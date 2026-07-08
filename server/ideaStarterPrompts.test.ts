import { describe, expect, it } from "vitest";
import {
  buildIdeaStarterChips,
  buildIdeaStarterHeroSubhead,
  buildIdeaStarterPanelHeader,
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

  it("personalizes hero and panel copy from niche and audience", () => {
    expect(buildIdeaStarterHeroSubhead(foodCtx)).toContain("25 to 35 year old women");
    expect(buildIdeaStarterPanelHeader(foodCtx)).toContain("Food Cooking");
  });

  it("does not double the word for when audience already starts with for", () => {
    const subhead = buildIdeaStarterHeroSubhead({
      selectedNicheSlugs: ["business-entrepreneurship"],
      businessDescription: "Restaurant equipment",
      targetAudience: "for Restaurant Owners and Operators",
    });
    expect(subhead).toContain("tailored for Restaurant Owners and Operators");
    expect(subhead).not.toMatch(/for for /i);
  });
});