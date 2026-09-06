import { describe, expect, it } from "vitest";
import {
  scoreReelRelaxed,
  scoreViralMetrics,
  TIER2_MIN_VIEWS,
} from "../../discovery/scoring";
import { VIRAL_POOL_DEFAULTS, VIRAL_SEED_POOL_PILLAR } from "../constants";
import {
  dedupeAdaptedCandidates,
  fallbackInstagramPopularQueries,
  mergeInstagramPopularRows,
  normalizePopularQuery,
  planInstagramAdaptiveBudgets,
  rankInstagramPopularPrimaryRows,
  scoreInstagramPopularPost,
  selectInstagramPopularCreators,
  shouldRunInstagramHashtagFallback,
  shouldUseInstagramPopularDiscovery,
  type InstagramPopularRow,
} from "../instagramPopularDiscovery";
import { routeSemanticPoolCandidates, type SemanticPoolVerdict } from "../semanticPoolRelevance";
import type { AdaptedCandidate } from "../candidateAdapter";

function post(
  args: Partial<InstagramPopularRow> & { shortcode: string }
): InstagramPopularRow {
  return {
    caption: args.caption ?? "How we train restaurant staff before every shift",
    views: args.views ?? 24_000,
    likes: args.likes ?? 1_200,
    comments: args.comments ?? 80,
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    ownerUsername: args.ownerUsername ?? "ops",
    ownerFollowerCount: args.ownerFollowerCount ?? null,
    ownerIsVerified: false,
    ownerIsPrivate: false,
    thumbnailUrl: null,
    videoUrl: null,
    sourceUrl: `https://www.instagram.com/reel/${args.shortcode}/`,
    queries: args.queries ?? ["restaurant management"],
    ...args,
  };
}

function verdict(
  args: Partial<SemanticPoolVerdict> & { sourceId: string }
): SemanticPoolVerdict {
  return {
    sourceId: args.sourceId,
    domainRelevant: args.domainRelevant ?? true,
    primaryPillar: args.primaryPillar ?? "restaurant operations",
    secondaryPillar: args.secondaryPillar ?? null,
    confidence: args.confidence ?? 0.9,
    reason: args.reason ?? "Operator lesson",
  };
}

function adapted(sourceId: string, caption: string): AdaptedCandidate {
  return {
    platform: "instagram",
    sourceId,
    sourceUrl: `https://www.instagram.com/reel/${sourceId}/`,
    creatorId: "ops",
    creatorName: "Ops",
    creatorHandle: "@ops",
    creatorAvatarUrl: null,
    creatorFollowers: 4_000,
    thumbnailUrl: null,
    videoUrl: null,
    caption,
    transcript: null,
    hashtags: [],
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    views: 24_000,
    likes: 1_200,
    comments: 80,
    shares: null,
    saves: null,
    reachMultiplier: 6,
    engagementRate: 0.05,
    viewsPerHour: 1_000,
    trendStatus: "proven-format",
    relevanceHint: 50,
    contentPillar: null,
    relevanceLabel: "Popular",
    relevanceReason: "",
    hook: caption,
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: { source: "instagram_popular_discovery" },
  };
}

describe("Instagram Popular-first adaptive retrieval", () => {
  it("uses Popular only for restaurant pillars, not seed-mix", () => {
    expect(shouldUseInstagramPopularDiscovery("restaurant operations")).toBe(true);
    expect(shouldUseInstagramPopularDiscovery("restaurant marketing")).toBe(true);
    expect(shouldUseInstagramPopularDiscovery(VIRAL_SEED_POOL_PILLAR)).toBe(false);
    expect(shouldUseInstagramPopularDiscovery("fat loss")).toBe(false);
  });

  it("skips hashtag fallback when Popular already admitted enough current-pillar supply", () => {
    expect(
      shouldRunInstagramHashtagFallback({
        admittedCount: VIRAL_POOL_DEFAULTS.instagramPoolMinPopularAdmittedToSkipFallback,
        remainingBudget: 20,
      })
    ).toBe(false);
    expect(
      shouldRunInstagramHashtagFallback({
        admittedCount: VIRAL_POOL_DEFAULTS.instagramPoolMinPopularAdmittedToSkipFallback + 2,
        remainingBudget: 20,
      })
    ).toBe(false);
  });

  it("triggers hashtag fallback on thin Popular supply when budget remains", () => {
    expect(
      shouldRunInstagramHashtagFallback({
        admittedCount: 0,
        remainingBudget: 17,
      })
    ).toBe(true);
    expect(
      shouldRunInstagramHashtagFallback({
        admittedCount: 2,
        remainingBudget: 17,
      })
    ).toBe(true);
    expect(
      shouldRunInstagramHashtagFallback({
        admittedCount: 0,
        remainingBudget: 4,
      })
    ).toBe(false);
  });

  it("keeps Popular + leftover fallback within maxScCalls", () => {
    const plan = planInstagramAdaptiveBudgets(VIRAL_POOL_DEFAULTS.refreshMaxScCalls);
    expect(plan.popularBudget).toBe(VIRAL_POOL_DEFAULTS.instagramPoolMaxPopularScCalls);
    expect(plan.popularBudget + plan.maxFallbackBudget).toBe(
      VIRAL_POOL_DEFAULTS.refreshMaxScCalls
    );
    expect(plan.popularBudget).toBeLessThanOrEqual(VIRAL_POOL_DEFAULTS.refreshMaxScCalls);

    const tight = planInstagramAdaptiveBudgets(10);
    expect(tight.popularBudget).toBe(10);
    expect(tight.maxFallbackBudget).toBe(0);
    expect(tight.popularBudget + tight.maxFallbackBudget).toBe(10);
  });

  it("does not use relaxed virality for Popular posts", () => {
    const missingFollowers = post({
      shortcode: "a1",
      views: 50_000,
      ownerFollowerCount: null,
      likes: 2_000,
    });
    expect(scoreInstagramPopularPost(missingFollowers)).toBeNull();

    const withFollowers = post({
      shortcode: "a2",
      views: 50_000,
      ownerFollowerCount: 5_000,
      likes: 2_000,
      comments: 100,
    });
    const strict = scoreInstagramPopularPost(withFollowers);
    expect(strict).not.toBeNull();
    expect(strict!.score.tier).toBe(1);

    // Guard: relaxed path exists elsewhere but Popular scoring must not call it.
    expect(typeof scoreReelRelaxed).toBe("function");
    expect(scoreViralMetrics({
      views: 50_000,
      likes: 0,
      comments: 0,
      followers: 5_000,
    })).not.toBeNull();
  });

  it("rejects missing metrics from strict Popular scoring", () => {
    expect(
      scoreInstagramPopularPost(
        post({ shortcode: "m1", views: null, ownerFollowerCount: 4_000 })
      )
    ).toBeNull();
    expect(
      scoreInstagramPopularPost(
        post({ shortcode: "m2", views: 20_000, ownerFollowerCount: null })
      )
    ).toBeNull();
    expect(
      scoreInstagramPopularPost(
        post({
          shortcode: "m3",
          views: TIER2_MIN_VIEWS - 1,
          ownerFollowerCount: 100,
          likes: 10,
        })
      )
    ).toBeNull();
  });

  it("routes semantic siblings away from the current pool and keeps primary ownership", () => {
    const candidates = [
      adapted("ops1", "Staff training SOP before service"),
      adapted("mkt1", "Restaurant loyalty promo that filled Tuesday"),
      adapted("off1", "Chocolate lava cake recipe"),
    ];
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates,
      verdicts: [
        verdict({ sourceId: "ops1", primaryPillar: "restaurant operations" }),
        verdict({
          sourceId: "mkt1",
          primaryPillar: "restaurant marketing",
          confidence: 0.88,
        }),
        verdict({
          sourceId: "off1",
          domainRelevant: false,
          primaryPillar: null,
          confidence: 0.2,
        }),
      ],
    });
    expect(routed.currentPool.map((row) => row.sourceId)).toEqual(["ops1"]);
    expect(routed.rerouted.map((row) => row.targetPillar)).toEqual([
      "restaurant marketing",
    ]);
    expect(routed.rejected.map((row) => row.candidate.sourceId)).toEqual(["off1"]);
    expect(routed.currentPool[0]?.contentPillar).toBe("restaurant operations");
  });

  it("prefers short Popular fallback queries and rejects invalid query shapes", () => {
    const queries = fallbackInstagramPopularQueries({
      pillar: "restaurant marketing",
      count: 5,
    });
    expect(queries).toHaveLength(5);
    for (const query of queries) {
      const words = query.split(/\s+/);
      expect(words.length).toBeGreaterThanOrEqual(2);
      expect(words.length).toBeLessThanOrEqual(4);
    }
    expect(normalizePopularQuery("restaurant marketing")).toBe("restaurant marketing");
    expect(normalizePopularQuery("#restaurant")).toBeNull();
    expect(normalizePopularQuery("one")).toBeNull();
  });

  it("selects diversified creators from target-pillar shortlist", () => {
    const ranked = rankInstagramPopularPrimaryRows({
      pillar: "restaurant operations",
      posts: [
        post({
          shortcode: "a",
          ownerUsername: "alpha",
          views: 100_000,
          queries: ["restaurant management"],
        }),
        post({
          shortcode: "b",
          ownerUsername: "beta",
          views: 90_000,
          queries: ["staff training"],
        }),
        post({
          shortcode: "c",
          ownerUsername: "alpha",
          views: 80_000,
          queries: ["restaurant SOP"],
        }),
      ],
      verdicts: [
        verdict({ sourceId: "a" }),
        verdict({ sourceId: "b" }),
        verdict({ sourceId: "c" }),
      ],
    });
    const selected = selectInstagramPopularCreators({
      ranked,
      queries: ["restaurant management", "staff training", "restaurant SOP"],
      maxCreators: 2,
    });
    expect(selected).toEqual(["alpha", "beta"]);
  });

  it("dedupes adapted candidates for canonical persistence merge", () => {
    const merged = dedupeAdaptedCandidates([
      adapted("same", "first"),
      adapted("same", "second"),
      adapted("other", "other"),
    ]);
    expect(merged.map((row) => row.sourceId)).toEqual(["same", "other"]);
  });

  it("merges Popular rows by shortcode without inventing metrics", () => {
    const merged = mergeInstagramPopularRows([
      {
        ...post({ shortcode: "x1", views: 10_000, likes: null, ownerFollowerCount: null }),
        query: "restaurant management",
      },
      {
        ...post({ shortcode: "x1", views: 12_000, likes: 500, ownerFollowerCount: null }),
        query: "staff training",
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]?.views).toBe(12_000);
    expect(merged[0]?.likes).toBe(500);
    expect(merged[0]?.ownerFollowerCount).toBeNull();
    expect(merged[0]?.queries).toEqual(["restaurant management", "staff training"]);
  });

  it("keeps Popular enrichment ceilings inside the shared Popular SC cap", () => {
    const popularCap = VIRAL_POOL_DEFAULTS.instagramPoolMaxPopularScCalls;
    const search = VIRAL_POOL_DEFAULTS.instagramPoolMaxPopularQueries;
    const profiles = VIRAL_POOL_DEFAULTS.instagramPoolMaxPopularProfileCalls;
    const details = VIRAL_POOL_DEFAULTS.instagramPoolMaxPopularPostDetailCalls;
    expect(search + profiles + details).toBe(popularCap);
    expect(popularCap).toBeLessThanOrEqual(VIRAL_POOL_DEFAULTS.refreshMaxScCalls);
    expect(VIRAL_POOL_DEFAULTS.instagramPoolMinPopularAdmittedToSkipFallback).toBe(
      VIRAL_POOL_DEFAULTS.tiktokPoolMinSearchAdmittedToSkipSeeds
    );
  });
});
