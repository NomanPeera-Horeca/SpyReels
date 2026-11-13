import { describe, expect, it } from "vitest";
import {
  buildIdeaStarterChips,
  buildIdeaStarterHeroSubhead,
  buildIdeaStarterNichePill,
  buildIdeaStarterPanelHeader,
  shortAudienceForUi,
} from "@shared/ideaStarterPrompts";

describe("ideaStarterPrompts", () => {
  const foodCtx = {
    selectedNicheSlugs: ["food-cooking"],
    businessDescription: "Easy weeknight recipes for busy moms",
    targetAudience: "25 to 35 year old women",
  };

  it("uses niche-specific chip labels for food-cooking", () => {
    const chips = buildIdeaStarterChips(foodCtx);
    expect(chips[0]?.label).toContain("Weeknight");
    expect(chips[0]?.value.toLowerCase()).toContain("cooking");
    expect(chips.some((chip) => chip.label.toLowerCase().includes("chicken"))).toBe(true);
  });

  it("personalizes short hero and panel copy from niche and audience", () => {
    expect(buildIdeaStarterHeroSubhead(foodCtx)).toContain("25 to 35 year old women");
    expect(buildIdeaStarterHeroSubhead(foodCtx).length).toBeLessThan(80);
    expect(buildIdeaStarterPanelHeader(foodCtx)).toContain("Food Cooking");
    expect(buildIdeaStarterNichePill(foodCtx)).toBe("Food Cooking");
  });

  it("does not dump long onboarding bios into the hero subhead", () => {
    const subhead = buildIdeaStarterHeroSubhead({
      selectedNicheSlugs: ["business-entrepreneurship"],
      businessDescription: "Business coaching",
      targetAudience:
        "I create content for CEOs, founders, and operators who want clearer offers and faster sales cycles across Instagram Reels",
    });
    expect(subhead.toLowerCase()).toContain("business entrepreneurship");
    expect(subhead.toLowerCase()).not.toContain("i create content");
    expect(subhead.length).toBeLessThan(90);
  });

  it("shortAudienceForUi rejects bios and accepts short labels", () => {
    expect(shortAudienceForUi("Restaurant Owners")).toBe("Restaurant Owners");
    expect(
      shortAudienceForUi(
        "I create content for CEOs, founders, and operators who want clearer offers"
      )
    ).toBeNull();
  });

  it("does not double the word for when audience already starts with for", () => {
    const subhead = buildIdeaStarterHeroSubhead({
      selectedNicheSlugs: ["business-entrepreneurship"],
      businessDescription: "Restaurant equipment",
      targetAudience: "for Restaurant Owners",
    });
    expect(subhead).toContain("Restaurant Owners");
    expect(subhead).not.toMatch(/for for /i);
  });
});

describe("Agent starter: confirmed profile wins", () => {
  it("shows the confirmed niche, not the old category", async () => {
    const m = await import("@shared/ideaStarterPrompts");
    const ctx = { selectedNicheSlugs: ["business-entrepreneurship"], activeNicheLabel: "points and travel for entrepreneurs" };
    expect(m.buildIdeaStarterNichePill(ctx)).toBe("points and travel for entrepreneurs");
    expect(m.buildIdeaStarterNichePill({ selectedNicheSlugs: ["business-entrepreneurship"] })).toBe("Business Entrepreneurship");
  });

  it("starting suggestions are the creator's written ideas when there are some", async () => {
    const m = await import("@shared/ideaStarterPrompts");
    const long = "Stack hotel points across multiple credit cards to fund luxury European stays";
    const chips = m.buildIdeaStarterChips({ selectedNicheSlugs: ["business-entrepreneurship"], writtenIdeas: [long, "Solo trips build confidence"] });
    expect(chips.map(c => c.value)).toEqual([long, "Solo trips build confidence"]);
    expect(chips[0].label.length).toBeLessThanOrEqual(48);
    expect(m.buildIdeaStarterChips({ selectedNicheSlugs: ["business-entrepreneurship"] }).length).toBeGreaterThan(0);
  });
});

