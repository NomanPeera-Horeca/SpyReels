import { describe, expect, it } from "vitest";
import {
  DAILY_PICK_FALLBACK_MIN_FINAL_SCORE,
  DAILY_PICK_STRONG_MIN_FINAL_SCORE,
  PLATFORM_DIVERSITY_MAX_SCORE_GAP,
  selectDiverseFeed,
  selectTieredDailyFeed,
  summarizeDailyPickScores,
  type DiversityCandidate,
} from "../diversity";

function candidate(args: {
  id: number;
  score: number;
  platform: string;
  creator?: string;
  hidden?: boolean;
  recentlyDismissed?: boolean;
  recentlyShown?: boolean;
}): DiversityCandidate {
  const creator = args.creator ?? `creator-${args.id}`;
  return {
    candidateId: args.id,
    sourceId: `source-${args.id}`,
    creatorKey: creator,
    caption: `Distinct candidate ${args.id} with a unique useful lesson`,
    hook: `Hook ${args.id}`,
    contentPillar: `pillar-${args.id}`,
    format: "talking-head",
    finalScore: args.score,
    trendStatus: "proven-format",
    hidden: args.hidden ?? false,
    recentlyDismissed: args.recentlyDismissed ?? false,
    recentlyShown: args.recentlyShown ?? false,
    hashtagKey: null,
    platform: args.platform,
  };
}

describe("viralPosts diversity", () => {
  it("does not sacrifice a materially stronger candidate just to force platform variety", () => {
    const selected = selectDiverseFeed(
      [
        candidate({ id: 1, score: 0.9, platform: "instagram" }),
        candidate({ id: 2, score: 0.8, platform: "instagram" }),
        candidate({ id: 3, score: 0.6, platform: "instagram" }),
        candidate({ id: 4, score: 0.5, platform: "youtube" }),
      ],
      { min: 2, max: 3, minFinalScore: 0.45 }
    );

    expect(selected.map((item) => item.candidateId)).toEqual([1, 2, 3]);
  });

  it("prefers another platform when its score is within the soft diversity gap", () => {
    const samePlatformScore = 0.6;
    const altPlatformScore =
      samePlatformScore - (PLATFORM_DIVERSITY_MAX_SCORE_GAP - 0.005);
    const selected = selectDiverseFeed(
      [
        candidate({ id: 1, score: 0.9, platform: "instagram" }),
        candidate({ id: 2, score: 0.8, platform: "instagram" }),
        candidate({ id: 3, score: samePlatformScore, platform: "instagram" }),
        candidate({ id: 4, score: altPlatformScore, platform: "youtube" }),
      ],
      { min: 2, max: 3, minFinalScore: 0.45 }
    );

    expect(selected.map((item) => item.candidateId)).toEqual([1, 2, 4]);
  });
});

describe("viralPosts tiered daily selection", () => {
  it("keeps the strong quality bar when enough strong candidates exist", () => {
    const input = Array.from({ length: 7 }, (_, index) =>
      candidate({
        id: index + 1,
        score: 0.75 - index * 0.02,
        platform: index % 2 === 0 ? "instagram" : "tiktok",
      })
    );

    const result = selectTieredDailyFeed(input);

    expect(result.selected).toHaveLength(7);
    expect(result.strongSelectedCount).toBe(7);
    expect(result.fallbackSelectedCount).toBe(0);
    expect(
      result.selected.every(
        (item) => item.finalScore >= DAILY_PICK_STRONG_MIN_FINAL_SCORE
      )
    ).toBe(true);
  });

  it("uses the fallback band only to reach the minimum feed size", () => {
    const input = [
      candidate({ id: 1, score: 0.82, platform: "instagram" }),
      candidate({ id: 2, score: 0.7, platform: "tiktok" }),
      candidate({ id: 3, score: 0.58, platform: "instagram" }),
      candidate({ id: 4, score: 0.53, platform: "tiktok" }),
      candidate({ id: 5, score: 0.5, platform: "instagram" }),
      candidate({ id: 6, score: 0.49, platform: "tiktok" }),
      candidate({ id: 7, score: 0.47, platform: "instagram" }),
    ];

    const result = selectTieredDailyFeed(input);

    expect(result.selected).toHaveLength(5);
    expect(result.strongSelectedCount).toBe(3);
    expect(result.fallbackSelectedCount).toBe(2);
    expect(result.selected.map((item) => item.candidateId)).toContain(4);
    expect(result.selected.map((item) => item.candidateId)).toContain(5);
    expect(result.selected.map((item) => item.candidateId)).not.toContain(6);
  });

  it("never crosses the fallback quality floor just to fill quota", () => {
    const input = [
      candidate({ id: 1, score: 0.8, platform: "instagram" }),
      candidate({ id: 2, score: 0.6, platform: "tiktok" }),
      candidate({ id: 3, score: 0.5, platform: "instagram" }),
      candidate({ id: 4, score: 0.44, platform: "tiktok" }),
      candidate({ id: 5, score: 0.2, platform: "instagram" }),
    ];

    const result = selectTieredDailyFeed(input);

    expect(result.selected).toHaveLength(3);
    expect(
      result.selected.every(
        (item) => item.finalScore >= DAILY_PICK_FALLBACK_MIN_FINAL_SCORE
      )
    ).toBe(true);
  });

  it("does not resurrect hidden, dismissed, or recently shown candidates in fallback", () => {
    const result = selectTieredDailyFeed([
      candidate({ id: 1, score: 0.8, platform: "instagram" }),
      candidate({ id: 2, score: 0.7, platform: "tiktok" }),
      candidate({ id: 3, score: 0.52, platform: "instagram" }),
      candidate({ id: 4, score: 0.51, platform: "tiktok", hidden: true }),
      candidate({
        id: 5,
        score: 0.5,
        platform: "instagram",
        recentlyDismissed: true,
      }),
      candidate({
        id: 6,
        score: 0.49,
        platform: "tiktok",
        recentlyShown: true,
      }),
    ]);

    expect(result.selected.map((item) => item.candidateId)).toEqual([1, 2, 3]);
    expect(result.fallbackSelectedCount).toBe(1);
  });

  it("allows at most a second post from one creator as the final escape hatch", () => {
    const result = selectTieredDailyFeed([
      candidate({ id: 1, score: 0.8, platform: "instagram", creator: "a" }),
      candidate({ id: 2, score: 0.7, platform: "tiktok", creator: "b" }),
      candidate({ id: 3, score: 0.52, platform: "instagram", creator: "a" }),
      candidate({ id: 4, score: 0.51, platform: "tiktok", creator: "b" }),
      candidate({ id: 5, score: 0.5, platform: "instagram", creator: "a" }),
      candidate({ id: 6, score: 0.49, platform: "tiktok", creator: "b" }),
    ]);

    expect(result.selected).toHaveLength(4);
    const counts = new Map<string, number>();
    for (const item of result.selected) {
      counts.set(item.creatorKey, (counts.get(item.creatorKey) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBe(2);
  });

  it("exposes deterministic score distribution for ranking-funnel telemetry", () => {
    expect(
      summarizeDailyPickScores([
        candidate({ id: 1, score: 0.2, platform: "instagram" }),
        candidate({ id: 2, score: 0.4, platform: "instagram" }),
        candidate({ id: 3, score: 0.6, platform: "tiktok" }),
        candidate({ id: 4, score: 0.8, platform: "tiktok" }),
      ])
    ).toEqual({ p50: 0.4, p75: 0.6, p90: 0.8, max: 0.8 });
  });
});
