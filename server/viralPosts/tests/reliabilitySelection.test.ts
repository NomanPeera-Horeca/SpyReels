import { describe, expect, it } from "vitest";
import {
  DAILY_PICK_FALLBACK_MIN_FINAL_SCORE,
  DAILY_PICK_STRONG_MIN_FINAL_SCORE,
  selectTieredDailyFeed,
  type DiversityCandidate,
} from "../diversity";

function makeCandidate(id: number, score: number): DiversityCandidate {
  return {
    candidateId: id,
    sourceId: `reliability-source-${id}`,
    creatorKey: `reliability-creator-${id}`,
    caption: `Unique restaurant lesson ${id} with enough distinct copy for deduplication`,
    hook: `Restaurant hook ${id}`,
    contentPillar: id % 2 === 0 ? "menu engineering" : "restaurant profitability",
    format: "talking-head",
    finalScore: score,
    trendStatus: "proven-format",
    hidden: false,
    recentlyDismissed: false,
    recentlyShown: false,
    hashtagKey: null,
    platform: id % 2 === 0 ? "instagram" : "tiktok",
  };
}

describe("Viral Posts large-universe reliability", () => {
  it("does not turn a 124-candidate universe into an empty feed just because none reaches the strong floor", () => {
    const input = Array.from({ length: 124 }, (_, index) => {
      // Reproduce the class of production failure seen on Sep 14: plenty of
      // supply, no candidate at the strong 0.55 threshold, but a credible band
      // still exists immediately below it.
      const score = index < 12 ? 0.54 - index * 0.005 : 0.43 - index * 0.001;
      return makeCandidate(index + 1, score);
    });

    const result = selectTieredDailyFeed(input);

    expect(result.strongEligibleCount).toBe(0);
    expect(result.fallbackEligibleCount).toBeGreaterThanOrEqual(5);
    expect(result.selected).toHaveLength(5);
    expect(result.strongSelectedCount).toBe(0);
    expect(result.fallbackSelectedCount).toBe(5);
    expect(
      result.selected.every(
        (candidate) =>
          candidate.finalScore >= DAILY_PICK_FALLBACK_MIN_FINAL_SCORE &&
          candidate.finalScore < DAILY_PICK_STRONG_MIN_FINAL_SCORE
      )
    ).toBe(true);
  });

  it("still returns empty when a large universe has no candidate above the controlled fallback floor", () => {
    const input = Array.from({ length: 124 }, (_, index) =>
      makeCandidate(index + 1, 0.44 - index * 0.001)
    );

    const result = selectTieredDailyFeed(input);

    expect(result.strongEligibleCount).toBe(0);
    expect(result.fallbackEligibleCount).toBe(0);
    expect(result.selected).toHaveLength(0);
  });
});
