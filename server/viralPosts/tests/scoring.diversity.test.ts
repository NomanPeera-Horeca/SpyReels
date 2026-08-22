import { describe, expect, it } from "vitest";
import {
  classifyTrendStatus,
  computeEngagementRate,
  computeReachMultiplier,
  computeViewsPerHour,
  freshnessScoreFromAge,
  scoreCandidate,
} from "../scoring";
import { selectDiverseFeed, type DiversityCandidate } from "../diversity";

describe("viralPosts scoring", () => {
  it("returns null reach when followers missing", () => {
    expect(computeReachMultiplier(100_000, null)).toBeNull();
    expect(computeReachMultiplier(100_000, 0)).toBeNull();
  });

  it("computes reach multiplier when followers exist", () => {
    expect(computeReachMultiplier(100_000, 5_000)).toBe(20);
  });

  it("omits missing shares/saves from engagement (does not invent zero)", () => {
    const withShares = computeEngagementRate({
      views: 1000,
      likes: 100,
      comments: 50,
      shares: 10,
      saves: null,
    });
    const withoutShares = computeEngagementRate({
      views: 1000,
      likes: 100,
      comments: 50,
      shares: null,
      saves: null,
    });
    expect(withoutShares).toBe(0.15);
    expect(withShares).toBe(0.17);
  });

  it("computes views per hour with age floor", () => {
    expect(computeViewsPerHour(10_000, 0.5)).toBe(10_000);
    expect(computeViewsPerHour(10_000, 5)).toBe(2000);
    expect(computeViewsPerHour(null, 5)).toBeNull();
  });

  it("labels breaking out for young high-velocity posts", () => {
    expect(
      classifyTrendStatus({
        reachMultiplier: 12,
        viewsPerHour: 12_000,
        ageHours: 8,
        views: 50_000,
      })
    ).toBe("breaking-out");
  });

  it("labels rising fast for recent solid velocity", () => {
    expect(
      classifyTrendStatus({
        reachMultiplier: 2,
        viewsPerHour: 4_000,
        ageHours: 30,
        views: 20_000,
      })
    ).toBe("rising-fast");
  });

  it("labels proven format for older still-performing posts", () => {
    expect(
      classifyTrendStatus({
        reachMultiplier: 5,
        viewsPerHour: 2_500,
        ageHours: 60,
        views: 120_000,
      })
    ).toBe("proven-format");
  });

  it("labels saturated for old huge slow posts", () => {
    expect(
      classifyTrendStatus({
        reachMultiplier: 4,
        viewsPerHour: 500,
        ageHours: 96,
        views: 800_000,
      })
    ).toBe("saturated");
  });

  it("returns unknown when core metrics missing", () => {
    expect(
      classifyTrendStatus({
        reachMultiplier: null,
        viewsPerHour: null,
        ageHours: null,
        views: 50_000,
      })
    ).toBe("unknown");
  });

  it("small creator outperformance yields high reach", () => {
    expect(computeReachMultiplier(80_000, 2_000)).toBe(40);
  });

  it("redistributes score weights when followers missing", () => {
    const base = {
      views: 40_000,
      likes: 2_000,
      comments: 200,
      shares: null,
      saves: null,
      publishedAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
      relevanceScore: 80,
      adaptabilityScore: 70,
    };
    const withFollowers = scoreCandidate(
      { ...base, creatorFollowers: 8_000 },
      [{ ...base, creatorFollowers: 8_000 }]
    );
    const withoutFollowers = scoreCandidate(
      { ...base, creatorFollowers: null },
      [{ ...base, creatorFollowers: null }]
    );
    expect(withFollowers.reachMultiplier).not.toBeNull();
    expect(withoutFollowers.reachMultiplier).toBeNull();
    expect(withoutFollowers.finalScore).toBeGreaterThan(0);
    expect(freshnessScoreFromAge(6)).toBe(1);
  });
});

describe("viralPosts diversity", () => {
  function make(
    partial: Partial<DiversityCandidate> &
      Pick<
        DiversityCandidate,
        "candidateId" | "sourceId" | "creatorKey" | "finalScore"
      >
  ): DiversityCandidate {
    const id = partial.sourceId;
    return {
      candidateId: partial.candidateId,
      sourceId: id,
      creatorKey: partial.creatorKey,
      finalScore: partial.finalScore,
      caption:
        partial.caption ??
        `Reel idea ${id}: ${id} profitability systems for operators in ${id}-land`,
      hook: partial.hook ?? `${id}-hook: challenge the ${id} assumption now`,
      contentPillar: partial.contentPillar ?? `pillar-${id}`,
      format: partial.format ?? "talking-head",
      trendStatus: partial.trendStatus ?? "rising-fast",
      hidden: partial.hidden ?? false,
      recentlyDismissed: partial.recentlyDismissed ?? false,
      recentlyShown: partial.recentlyShown ?? false,
      hashtagKey: partial.hashtagKey ?? `tag-${id}`,
    };
  }

  it("removes duplicates and hidden creators, caps creator to 2", () => {
    const input = [
      make({ candidateId: 1, sourceId: "post-a", creatorKey: "c1", finalScore: 0.9 }),
      make({ candidateId: 2, sourceId: "post-a", creatorKey: "c1", finalScore: 0.8 }),
      make({ candidateId: 3, sourceId: "post-b", creatorKey: "c1", finalScore: 0.7 }),
      make({ candidateId: 4, sourceId: "post-c", creatorKey: "c1", finalScore: 0.6 }),
      make({
        candidateId: 5,
        sourceId: "post-d",
        creatorKey: "c2",
        finalScore: 0.55,
        hidden: true,
      }),
      make({ candidateId: 6, sourceId: "post-e", creatorKey: "c3", finalScore: 0.5 }),
      make({ candidateId: 7, sourceId: "post-f", creatorKey: "c4", finalScore: 0.45 }),
      make({ candidateId: 8, sourceId: "post-g", creatorKey: "c5", finalScore: 0.4 }),
      make({ candidateId: 9, sourceId: "post-h", creatorKey: "c6", finalScore: 0.35 }),
    ];
    const selected = selectDiverseFeed(input, { min: 5, max: 7 });
    expect(selected.every((s) => !s.hidden)).toBe(true);
    expect(new Set(selected.map((s) => s.sourceId)).size).toBe(selected.length);
    const c1 = selected.filter((s) => s.creatorKey === "c1").length;
    expect(c1).toBeLessThanOrEqual(2);
    expect(selected.length).toBeGreaterThanOrEqual(5);
  });

  it("is deterministic for the same inputs", () => {
    const input = [
      make({ candidateId: 1, sourceId: "z", creatorKey: "a", finalScore: 0.5 }),
      make({ candidateId: 2, sourceId: "y", creatorKey: "b", finalScore: 0.5 }),
      make({ candidateId: 3, sourceId: "x", creatorKey: "c", finalScore: 0.5 }),
      make({ candidateId: 4, sourceId: "w", creatorKey: "d", finalScore: 0.5 }),
      make({ candidateId: 5, sourceId: "v", creatorKey: "e", finalScore: 0.5 }),
      make({ candidateId: 6, sourceId: "u", creatorKey: "f", finalScore: 0.5 }),
    ];
    const a = selectDiverseFeed(input).map((s) => s.sourceId);
    const b = selectDiverseFeed(input).map((s) => s.sourceId);
    expect(a).toEqual(b);
  });

  it("excludes recently dismissed", () => {
    const input = [
      make({
        candidateId: 1,
        sourceId: "a",
        creatorKey: "c1",
        finalScore: 0.99,
        recentlyDismissed: true,
      }),
      make({ candidateId: 2, sourceId: "b", creatorKey: "c2", finalScore: 0.5 }),
      make({ candidateId: 3, sourceId: "c", creatorKey: "c3", finalScore: 0.4 }),
      make({ candidateId: 4, sourceId: "d", creatorKey: "c4", finalScore: 0.3 }),
      make({ candidateId: 5, sourceId: "e", creatorKey: "c5", finalScore: 0.2 }),
      make({ candidateId: 6, sourceId: "f", creatorKey: "c6", finalScore: 0.1 }),
    ];
    const selected = selectDiverseFeed(input, { min: 5, max: 7 });
    expect(selected.find((s) => s.sourceId === "a")).toBeUndefined();
  });
});
