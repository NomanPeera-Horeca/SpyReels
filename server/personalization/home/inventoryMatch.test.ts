import { describe, expect, it } from "vitest";
import { buildPoolKey, DEFAULT_CONTENT_PILLARS } from "../../viralPosts/constants";
import {
  chooseIndexedHomeSpecs,
  indexedHomePoolSpecChoices,
} from "../../viralPosts/browseService";
import {
  contentInventoryPlan,
  dailyFeedCacheMatches,
  dailyFeedInventoryDecision,
  dailyFeedStrategyKey,
  preservesEmptyTaxonomyFeed,
  stampFeedStrategy,
} from "./inventoryMatch";

const strategy = {
  goalText: "Book the next client",
  audienceText: "People who need this service",
  platforms: { instagram: true, tiktok: false, youtube: false },
};

function planFor(categoryLabel: string | null, nicheLabel: string, pillarTitles: string[] = []) {
  return contentInventoryPlan({
    categoryLabel,
    nicheLabel,
    pillarTitles,
    ...strategy,
  });
}

describe("stored category inventory", () => {
  it("keeps cooking, wedding photography, and math tutoring off unrelated pools", () => {
    for (const [category, label] of [
      ["Food", "weeknight dinners"],
      ["Business", "wedding photography"],
      ["Education", "math tutoring"],
      ["Business", "commercial kitchen equipment"],
    ] as const) {
      const plan = planFor(category, label);
      expect(plan.mode).toBe("taxonomy");
      if (plan.mode === "taxonomy") {
        expect(plan.plan.niche).toBe("");
        expect(plan.plan.confirmedSpecs).toEqual([]);
        expect(plan.plan.fallbackSpecs).toEqual([]);
      }
      const feed = dailyFeedInventoryDecision({
        categoryLabel: category,
        nicheLabel: label,
        pillarTitles: [],
        goalText: strategy.goalText,
        audienceText: strategy.audienceText,
        platforms: strategy.platforms,
      });
      expect(feed).toEqual({
        mode: "taxonomy",
        niche: "",
        confirmedSpecs: [],
        fallbackSpecs: [],
      });
    }
  });

  it("reads only existing Health & Fitness pools for fitness coaching", () => {
    const plan = planFor("Fitness", "fitness coaching", ["strength"]);
    expect(plan.mode).toBe("taxonomy");
    if (plan.mode !== "taxonomy") return;
    expect(plan.plan.niche).toBe("Health & Fitness");
    expect(plan.plan.confirmedSpecs.every((spec) => spec.niche === "Health & Fitness")).toBe(true);
    expect(plan.plan.fallbackSpecs.every((spec) => spec.niche === "Health & Fitness")).toBe(true);
    const sample = plan.plan.confirmedSpecs[0] ?? plan.plan.fallbackSpecs[0];
    expect(sample).toBeTruthy();
    const chosen = chooseIndexedHomeSpecs({
      confirmedSpecs: plan.plan.confirmedSpecs,
      fallbackSpecs: plan.plan.fallbackSpecs,
      existingKeys: new Set([
        buildPoolKey(sample),
        buildPoolKey({
          platform: "instagram",
          niche: "Business & Entrepreneurship",
          pillar: "menu engineering",
        }),
      ]),
    });
    expect(chosen.specs.length).toBeGreaterThan(0);
    expect(chosen.specs.every((spec) => spec.niche === "Health & Fitness")).toBe(true);
  });

  it("reads existing restaurant pillars only when the category is Hospitality", () => {
    const plan = planFor("Hospitality", "commercial kitchen equipment", ["menu engineering"]);
    expect(plan.mode).toBe("taxonomy");
    if (plan.mode !== "taxonomy") return;
    expect(plan.plan.niche).toBe("Business & Entrepreneurship");
    expect(plan.plan.confirmedSpecs.every((spec) => spec.pillar === "menu engineering")).toBe(true);
    expect(plan.plan.fallbackSpecs.some((spec) => spec.pillar === DEFAULT_CONTENT_PILLARS[0])).toBe(
      true
    );
    const chosen = chooseIndexedHomeSpecs({
      confirmedSpecs: plan.plan.confirmedSpecs,
      fallbackSpecs: plan.plan.fallbackSpecs,
      existingKeys: new Set(plan.plan.confirmedSpecs.map((spec) => buildPoolKey(spec))),
    });
    expect(chosen.source).toBe("confirmed");
    expect(chosen.specs.every((spec) => spec.niche === "Business & Entrepreneurship")).toBe(true);
  });

  it("leaves a confirmed profile with no category on the legacy path", () => {
    expect(planFor(null, "Restaurants & Cafes").mode).toBe("legacy");
    expect(
      dailyFeedInventoryDecision({
        categoryLabel: "",
        nicheLabel: "math tutoring",
        pillarTitles: [],
        goalText: null,
        audienceText: null,
      }).mode
    ).toBe("legacy");
    expect(dailyFeedInventoryDecision(null).mode).toBe("legacy");
    const legacy = indexedHomePoolSpecChoices({
      nicheText: "math tutoring",
      confirmedPillars: [],
    });
    expect(legacy.niche).toBe("Business & Entrepreneurship");
  });

  it("keeps a taxonomy empty feed from being replaced", () => {
    expect(preservesEmptyTaxonomyFeed("taxonomy_empty")).toBe(true);
    expect(preservesEmptyTaxonomyFeed("taxonomy_indexed")).toBe(true);
    expect(preservesEmptyTaxonomyFeed(stampFeedStrategy("taxonomy_empty", "a".repeat(16)))).toBe(
      true
    );
    expect(preservesEmptyTaxonomyFeed("pool_assembly")).toBe(false);
    expect(preservesEmptyTaxonomyFeed(null)).toBe(false);
  });

  it("rebuilds today's feed when the workspace strategy changes and keeps an unchanged one", () => {
    const cooking = dailyFeedStrategyKey({
      workspaceId: "workspace-a",
      categoryLabel: "Food",
      nicheLabel: "weeknight dinners",
      goalText: "Teach dinners",
      audienceText: "Busy parents",
      pillarTitles: ["Weeknight dinners"],
    });
    const fitness = dailyFeedStrategyKey({
      workspaceId: "workspace-a",
      categoryLabel: "Fitness",
      nicheLabel: "fitness coaching",
      goalText: "Book clients",
      audienceText: "Busy adults",
      pillarTitles: ["strength"],
    });
    const otherWorkspace = dailyFeedStrategyKey({
      workspaceId: "workspace-b",
      categoryLabel: "Food",
      nicheLabel: "weeknight dinners",
      goalText: "Teach dinners",
      audienceText: "Busy parents",
      pillarTitles: ["Weeknight dinners"],
    });
    const legacy = dailyFeedStrategyKey({ workspaceId: "workspace-a" });
    expect(cooking).not.toBe(fitness);
    expect(cooking).not.toBe(otherWorkspace);
    expect(dailyFeedStrategyKey({
      workspaceId: "workspace-a",
      categoryLabel: "Food",
      nicheLabel: "weeknight dinners",
      goalText: "Teach dinners",
      audienceText: "Busy parents",
      pillarTitles: ["Weeknight dinners"],
    })).toBe(cooking);

    const stamped = stampFeedStrategy("taxonomy_empty", cooking);
    expect(stamped.startsWith("taxonomy_empty:s")).toBe(true);
    expect(dailyFeedCacheMatches(stamped, cooking, true)).toBe(true);
    expect(dailyFeedCacheMatches(stamped, fitness, true)).toBe(false);
    expect(dailyFeedCacheMatches("pool_assembly", cooking, true)).toBe(false);
    expect(dailyFeedCacheMatches("pool_assembly", legacy, false)).toBe(true);
    expect(dailyFeedCacheMatches(stampFeedStrategy("pool_assembly", cooking), legacy, false)).toBe(
      false
    );
  });
});
