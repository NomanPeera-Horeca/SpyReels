import { describe, expect, it } from "vitest";
import { fillNicheForCategory, planFill } from "../topicFill";

describe("topic fill plan", () => {
  it("searches topics our creators have first, both platforms each", () => {
    const plan = planFill(
      [
        { label: "baking & desserts", category: "food", creators: 0 },
        { label: "AI tools", category: "tech", creators: 3 },
        { label: "menu pricing", category: "hospitality", creators: 5 },
      ],
      ["tiktok", "youtube"]
    );
    expect(plan.map(p => `${p.platform}:${p.pillar}`)).toEqual([
      "tiktok:menu pricing",
      "youtube:menu pricing",
      "tiktok:AI tools",
      "youtube:AI tools",
      "tiktok:baking & desserts",
      "youtube:baking & desserts",
    ]);
    expect(plan[2]!.niche).toBe("Tech");
  });

  it("names pools by the category label", () => {
    expect(fillNicheForCategory("real_estate")).toBe("Real Estate");
    expect(fillNicheForCategory("hospitality")).toBe("Hospitality");
  });
});
