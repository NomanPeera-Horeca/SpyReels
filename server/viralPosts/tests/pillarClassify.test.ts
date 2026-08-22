import { describe, expect, it } from "vitest";
import {
  classifyCandidatePillars,
  diversifyByPillar,
} from "../pillarClassify";
import { buildPoolKey, slugifyPoolPart } from "../constants";

describe("pillarClassify", () => {
  it("classifies profitability captions", () => {
    const c = classifyCandidatePillars({
      caption: "Your food cost is killing profit margins and cash flow",
      activePillars: [
        "restaurant profitability",
        "menu engineering",
        "restaurant marketing",
      ],
    });
    expect(c.primaryPillar).toBe("restaurant profitability");
    expect(c.confidence).toBeGreaterThan(0.45);
  });

  it("falls back when no keywords match", () => {
    const c = classifyCandidatePillars({
      caption: "hello world",
      activePillars: ["restaurant marketing"],
    });
    expect(c.primaryPillar).toBe("restaurant marketing");
    expect(c.confidence).toBeLessThan(0.5);
  });

  it("diversifies pillars without large quality drop", () => {
    const ranked = [
      { id: 1, contentPillar: "a", finalScore: 1 },
      { id: 2, contentPillar: "a", finalScore: 0.95 },
      { id: 3, contentPillar: "a", finalScore: 0.9 },
      { id: 4, contentPillar: "b", finalScore: 0.88 },
      { id: 5, contentPillar: "c", finalScore: 0.2 },
    ];
    const out = diversifyByPillar(ranked, { max: 3, minPillars: 2 });
    expect(out).toHaveLength(3);
    expect(new Set(out.map((o) => o.contentPillar)).size).toBeGreaterThanOrEqual(2);
    expect(out.some((o) => o.id === 5)).toBe(false);
  });
});

describe("pool keys", () => {
  it("builds stable pool keys", () => {
    expect(slugifyPoolPart("Restaurant Profitability")).toBe(
      "restaurant-profitability"
    );
    expect(
      buildPoolKey({
        niche: "Business & Entrepreneurship",
        pillar: "menu engineering",
      })
    ).toBe(
      "instagram:business-and-entrepreneurship:menu-engineering:en"
    );
  });
});
