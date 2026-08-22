import { describe, expect, it } from "vitest";
import { VIRAL_POOL_DEFAULTS } from "../constants";
import { diversifyByPillar } from "../pillarClassify";

describe("feed assembly budget contracts", () => {
  it("keeps assembly path budgets far below the old 300-call feed path", () => {
    expect(VIRAL_POOL_DEFAULTS.refreshMaxScCalls).toBe(35);
    expect(VIRAL_POOL_DEFAULTS.exploreMaxScCalls).toBe(25);
    expect(VIRAL_POOL_DEFAULTS.dailyCallBudget).toBe(60);
    // User feed assembly must never use these; they are background-only.
    expect(VIRAL_POOL_DEFAULTS.assemblyCandidateLimit).toBeGreaterThanOrEqual(
      40
    );
  });

  it("prefers multi-pillar coverage when quality allows", () => {
    const ranked = [
      { id: "1", contentPillar: "restaurant profitability", finalScore: 1 },
      { id: "2", contentPillar: "restaurant profitability", finalScore: 0.99 },
      { id: "3", contentPillar: "restaurant profitability", finalScore: 0.98 },
      { id: "4", contentPillar: "menu engineering", finalScore: 0.9 },
      { id: "5", contentPillar: "restaurant marketing", finalScore: 0.89 },
    ];
    const out = diversifyByPillar(ranked, { max: 5, minPillars: 2 });
    expect(out.length).toBe(5);
    expect(new Set(out.map((o) => o.contentPillar)).size).toBeGreaterThanOrEqual(
      2
    );
  });
});
