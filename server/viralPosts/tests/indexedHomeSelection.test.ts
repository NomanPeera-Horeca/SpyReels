import { describe, expect, it } from "vitest";
import { buildPoolKey, VIRAL_SEED_POOL_PILLAR } from "../constants";
import {
  chooseIndexedHomeSpecs,
  indexedHomePoolSpecChoices,
} from "../browseService";
import {
  rankIndexedHomeInventory,
  selectIndexedHomePosts,
  type IndexedHomePost,
} from "../indexedHomeSelection";
import {
  passesIndexedViralQualification,
  qualifyAdaptedForSeedAdmission,
} from "../indexedQualification";

const now = new Date("2026-10-23T12:00:00Z");
const recent = new Date("2026-10-23T06:00:00Z");

function post(overrides: Partial<IndexedHomePost> & Pick<IndexedHomePost, "id" | "sourceId">): IndexedHomePost {
  return {
    platform: "tiktok",
    creatorId: `creator-${overrides.id}`,
    creatorHandle: `@creator-${overrides.id}`,
    caption: "How to lower food cost before the next supply order",
    hashtags: [],
    views: 80_000,
    likes: 4_000,
    comments: 400,
    shares: null,
    saves: null,
    creatorFollowers: 10_000,
    publishedAt: recent,
    primaryPillar: "Business & Entrepreneurship",
    pillarConfidence: 0.55,
    ...overrides,
  };
}

describe("indexed viral qualification", () => {
  it("rejects a 286-view TikTok seed post and keeps a post that passes the existing gate", () => {
    const weak = {
      platform: "tiktok",
      views: 286,
      likes: 200,
      comments: 20,
      creatorFollowers: 80,
    };
    const strong = {
      platform: "tiktok",
      views: 80_000,
      likes: 4_000,
      comments: 400,
      creatorFollowers: 10_000,
    };
    expect(passesIndexedViralQualification(weak)).toBe(false);
    expect(qualifyAdaptedForSeedAdmission([weak, strong])).toEqual([strong]);
  });

  it("uses each platform's existing rule", () => {
    expect(
      passesIndexedViralQualification({
        platform: "youtube",
        views: 286,
        likes: 10,
        comments: 1,
        creatorFollowers: null,
      })
    ).toBe(false);
    expect(
      passesIndexedViralQualification({
        platform: "youtube",
        views: 1_000,
        likes: null,
        comments: null,
        creatorFollowers: null,
      })
    ).toBe(true);
    expect(
      passesIndexedViralQualification({
        platform: "tiktok",
        views: 1_500,
        likes: 100,
        comments: 10,
        creatorFollowers: null,
      })
    ).toBe(false);
    expect(
      passesIndexedViralQualification({
        platform: "instagram",
        views: 286,
        likes: 40,
        comments: 4,
        creatorFollowers: 50,
      })
    ).toBe(false);
    expect(
      passesIndexedViralQualification({
        platform: "instagram",
        views: 1_500,
        likes: null,
        comments: null,
        creatorFollowers: null,
      })
    ).toBe(true);
  });
});

describe("indexed home pool choice", () => {
  it("uses confirmed pillars that already exist and does not let a fitness goal retarget the niche", () => {
    const plan = indexedHomePoolSpecChoices({
      nicheText: "Restaurants & Cafes",
      confirmedPillars: ["Menu engineering", "Guest experience"],
    });
    expect(plan.niche).toBe("Business & Entrepreneurship");
    expect(plan.confirmedSpecs).toEqual([
      { niche: plan.niche, pillar: "Menu engineering", platform: "instagram" },
      { niche: plan.niche, pillar: "Guest experience", platform: "instagram" },
      { niche: plan.niche, pillar: "Menu engineering", platform: "tiktok" },
      { niche: plan.niche, pillar: "Guest experience", platform: "tiktok" },
    ]);
    expect(plan.confirmedSpecs.some(spec => spec.pillar === VIRAL_SEED_POOL_PILLAR)).toBe(false);
    expect(plan.confirmedSpecs.some(spec => spec.platform === "youtube")).toBe(false);

    const menuKey = buildPoolKey({
      platform: "instagram",
      niche: plan.niche,
      pillar: "Menu engineering",
    });
    const choice = chooseIndexedHomeSpecs({
      confirmedSpecs: plan.confirmedSpecs,
      fallbackSpecs: plan.fallbackSpecs,
      existingKeys: new Set([menuKey]),
    });
    expect(choice.source).toBe("confirmed");
    expect(choice.specs).toEqual([
      expect.objectContaining({ platform: "instagram", pillar: "Menu engineering" }),
    ]);
  });

  it("includes an existing YouTube pool when that platform is enabled", () => {
    const plan = indexedHomePoolSpecChoices({
      nicheText: "Restaurants & Cafes",
      confirmedPillars: ["Menu engineering"],
      platforms: { instagram: true, tiktok: true, youtube: true },
    });
    expect(plan.confirmedSpecs).toEqual([
      { niche: plan.niche, pillar: "Menu engineering", platform: "instagram" },
      { niche: plan.niche, pillar: "Menu engineering", platform: "tiktok" },
      { niche: plan.niche, pillar: "Menu engineering", platform: "youtube" },
    ]);
    expect(plan.confirmedSpecs.some(spec => spec.pillar === VIRAL_SEED_POOL_PILLAR)).toBe(false);
  });

  it("falls back to inferred pools, including seed-mix, when no confirmed pillar pool exists", () => {
    const plan = indexedHomePoolSpecChoices({
      nicheText: "Restaurants & Cafes",
      confirmedPillars: ["Guest experience"],
    });
    expect(plan.fallbackSpecs.some(spec => spec.pillar === "menu engineering")).toBe(true);
    expect(plan.fallbackSpecs.some(spec => spec.pillar === VIRAL_SEED_POOL_PILLAR)).toBe(true);
    const choice = chooseIndexedHomeSpecs({
      confirmedSpecs: plan.confirmedSpecs,
      fallbackSpecs: plan.fallbackSpecs,
      existingKeys: new Set(
        plan.fallbackSpecs
          .filter(spec => spec.pillar === VIRAL_SEED_POOL_PILLAR)
          .map(spec => buildPoolKey(spec))
      ),
    });
    expect(choice.source).toBe("inferred");
    expect(choice.specs.map(spec => spec.pillar)).toEqual([VIRAL_SEED_POOL_PILLAR]);
  });

  it("returns nothing when indexed inventory is missing", () => {
    const plan = indexedHomePoolSpecChoices({
      nicheText: "Restaurants & Cafes",
      confirmedPillars: ["Menu engineering"],
    });
    expect(
      chooseIndexedHomeSpecs({
        confirmedSpecs: plan.confirmedSpecs,
        fallbackSpecs: plan.fallbackSpecs,
        existingKeys: new Set(),
      }).specs
    ).toEqual([]);
  });

  it("would retarget the niche if goal text were used as the niche input", () => {
    expect(indexedHomePoolSpecChoices({ nicheText: "Help fitness coaches sign clients.", confirmedPillars: [] }).niche).toBe(
      "Health & Fitness"
    );
  });
});

describe("selectIndexedHomePosts", () => {
  it("does not promote a 286-view TikTok just because the pool is otherwise empty", () => {
    const weak = post({
      id: 1,
      sourceId: "weak",
      views: 286,
      likes: 200,
      comments: 40,
      creatorFollowers: 80,
    });
    expect(selectIndexedHomePosts({ posts: [weak], goalText: null, audienceText: null, limit: 4, now })).toEqual([]);
  });

  it("ranks an audience match ahead of an unrelated post with the same viral metrics", () => {
    const matched = post({
      id: 2,
      sourceId: "food",
      caption: "How to lower food cost before the next supply order",
    });
    const unrelated = post({
      id: 1,
      sourceId: "aaa",
      creatorId: "traveler",
      creatorHandle: "@traveler",
      caption: "How to pack a suitcase before the next weekend trip",
    });
    const weak = post({
      id: 3,
      sourceId: "weak",
      views: 286,
      likes: 200,
      comments: 20,
      creatorFollowers: 40,
    });
    const selected = selectIndexedHomePosts({
      posts: [unrelated, weak, matched],
      goalText: "Help fitness coaches sign clients.",
      audienceText: "Restaurant owners. Lower food cost",
      limit: 4,
      now,
    });
    expect(selected.map(item => item.sourceId)).toEqual(["food", "aaa"]);
  });

  it("keeps one post per creator when another creator is available", () => {
    const first = post({
      id: 1,
      sourceId: "a",
      creatorId: "same",
      creatorHandle: "@same",
      caption: "How to lower food cost before the next supply order",
    });
    const second = post({
      id: 2,
      sourceId: "b",
      creatorId: "same",
      creatorHandle: "@same",
      caption: "How to train a closing shift before Friday night service",
    });
    const other = post({
      id: 3,
      sourceId: "c",
      platform: "instagram",
      creatorId: "other",
      creatorHandle: "@other",
      caption: "How to price a dinner menu before service starts tonight",
    });
    const selected = selectIndexedHomePosts({
      posts: [second, other, first],
      goalText: null,
      audienceText: null,
      limit: 4,
      now,
    });
    expect(selected.map(item => item.creatorId).sort()).toEqual(["other", "same"]);
    expect(selected.filter(item => item.creatorId === "same")).toHaveLength(1);
  });
});

describe("rankIndexedHomeInventory creators", () => {
  it("groups the broader qualified inventory and ranks by viral multiple, not followers", () => {
    const shown = post({
      id: 1,
      sourceId: "shown",
      platform: "instagram",
      creatorId: "shown",
      creatorHandle: "@shown",
      creatorFollowers: 10_000,
      views: 80_000,
      caption: "How to lower food cost before the next supply order",
    });
    const extra = post({
      id: 2,
      sourceId: "extra",
      platform: "tiktok",
      creatorId: "extra",
      creatorHandle: "@extra",
      creatorFollowers: 1_000,
      views: 80_000,
      likes: 8_000,
      comments: 800,
      caption: "How to train a closing shift before Friday night service",
    });
    const youtube = post({
      id: 3,
      sourceId: "youtube",
      platform: "youtube",
      creatorId: "channel",
      creatorHandle: "@channel",
      creatorFollowers: 4_000,
      views: 40_000,
      caption: "How to price a dinner menu before service starts tonight",
    });
    const famous = post({
      id: 4,
      sourceId: "famous",
      creatorId: "famous",
      creatorHandle: "@famous",
      creatorFollowers: 10_000_000,
      views: 80_000,
      caption: "How to pack a suitcase before the next weekend trip",
    });
    const weak = post({
      id: 5,
      sourceId: "weak",
      views: 286,
      likes: 200,
      comments: 20,
      creatorFollowers: 80,
      creatorId: "weak",
      creatorHandle: "@weak",
    });
    const ranked = rankIndexedHomeInventory({
      posts: [famous, weak, shown, youtube, extra],
      goalText: "Help fitness coaches sign clients.",
      audienceText: "Restaurant owners. Lower food cost",
      limit: 1,
      now,
    });

    expect(ranked.display).toHaveLength(1);
    expect(ranked.creators.map(creator => creator.post.creatorId)).toEqual(["extra", "channel", "shown"]);
    expect(ranked.creators.map(creator => creator.post.platform)).toEqual(["tiktok", "youtube", "instagram"]);
    expect(ranked.creators.map(creator => creator.badge.multiple)).toEqual([80, 10, 8]);
    expect(ranked.creators.some(creator => creator.post.creatorId === "famous")).toBe(false);
    expect(ranked.creators.some(creator => creator.post.creatorId === "weak")).toBe(false);
    expect(ranked.creators.some(creator => creator.post.id !== ranked.display[0]?.id)).toBe(true);
  });

  it("drops a creator whose only recent post misses the viral badge", () => {
    const skip = post({
      id: 6,
      sourceId: "skip",
      creatorId: "mid",
      creatorHandle: "@mid",
      creatorFollowers: 5_000,
      views: 20_000,
      likes: 4_000,
      comments: 400,
    });
    const ranked = rankIndexedHomeInventory({
      posts: [skip],
      goalText: null,
      audienceText: null,
      limit: 4,
      now,
    });
    expect(ranked.display.map(item => item.sourceId)).toEqual(["skip"]);
    expect(ranked.creators).toEqual([]);
  });

  it("does not keep a creator whose qualifying video is older than the recent window", () => {
    const stale = post({
      id: 7,
      sourceId: "stale",
      creatorId: "stale",
      creatorHandle: "@stale",
      creatorFollowers: 1_000,
      views: 600_000,
      likes: 30_000,
      comments: 3_000,
      publishedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const ranked = rankIndexedHomeInventory({
      posts: [stale],
      goalText: null,
      audienceText: null,
      limit: 4,
      now,
    });
    expect(ranked.creators).toEqual([]);
  });

  it("keeps one creator's strongest recent video", () => {
    const weaker = post({
      id: 11,
      sourceId: "weaker",
      creatorId: "same",
      creatorHandle: "@same",
      creatorFollowers: 10_000,
      views: 80_000,
      caption: "How to lower food cost before the next supply order",
    });
    const stronger = post({
      id: 12,
      sourceId: "stronger",
      creatorId: "same",
      creatorHandle: "@same",
      creatorFollowers: 10_000,
      views: 400_000,
      likes: 20_000,
      comments: 2_000,
      caption: "How to train a closing shift before Friday night service",
    });
    const ranked = rankIndexedHomeInventory({
      posts: [weaker, stronger],
      goalText: null,
      audienceText: null,
      limit: 4,
      now,
    });
    expect(ranked.creators).toHaveLength(1);
    expect(ranked.creators[0]?.post.sourceId).toBe("stronger");
    expect(ranked.creators[0]?.badge.multiple).toBe(40);
  });

  it("returns no creators when the only post is a 286-view TikTok", () => {
    const weak = post({
      id: 8,
      sourceId: "weak-only",
      views: 286,
      likes: 200,
      comments: 40,
      creatorFollowers: 80,
    });
    const ranked = rankIndexedHomeInventory({
      posts: [weak],
      goalText: null,
      audienceText: null,
      limit: 4,
      now,
    });
    expect(ranked.display).toEqual([]);
    expect(ranked.creators).toEqual([]);
  });
});
