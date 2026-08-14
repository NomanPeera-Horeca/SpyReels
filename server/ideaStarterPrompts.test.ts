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
