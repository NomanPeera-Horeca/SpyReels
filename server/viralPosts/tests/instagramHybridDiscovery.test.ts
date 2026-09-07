import { readFileSync } from "fs";
import { describe, expect, it } from "vitest";
import {
  parseInstagramPostDetail,
  parseInstagramSearchPost,
} from "../../instagram";
import { MIN_VIEWS, scoreViralMetrics } from "../../discovery/scoring";
import {
  allocateInstagramHybridQueries,
  applyCreatorFollowers,
  countCrossLaneOverlap,
  fallbackInstagramSearchQueries,
  INSTAGRAM_HYBRID_MAX_HASHTAG_QUERIES,
  INSTAGRAM_HYBRID_MAX_KEYWORD_QUERIES,
  INSTAGRAM_HYBRID_MAX_POPULAR_PROFILE_CALLS,
  INSTAGRAM_HYBRID_MAX_POPULAR_QUERIES,
  INSTAGRAM_HYBRID_MAX_POST_ENRICHMENT_CALLS,
  INSTAGRAM_HYBRID_MAX_SEARCH_CALLS,
  mergeInstagramHybridRows,
  scoreInstagramHybridPost,
  selectPopularCreatorsForProfileEnrichment,
  selectPostsForDetailEnrichment,
  type InstagramHybridSearchRow,
} from "../instagramHybridDiscovery";
import { routeSemanticPoolCandidates, type SemanticPoolVerdict } from "../semanticPoolRelevance";
import type { AdaptedCandidate } from "../candidateAdapter";

function post(args: Partial<InstagramHybridSearchRow> & { shortcode: string }): InstagramHybridSearchRow {
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
    lanes: args.lanes ?? ["popular"],
    queries: args.queries ?? ["restaurant staff training"],
    ...args,
  };
}

function verdict(args: Partial<SemanticPoolVerdict> & { sourceId: string }): SemanticPoolVerdict {
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
    relevanceLabel: "Hybrid",
    relevanceReason: "",
    hook: caption,
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: { source: "instagram_hybrid_discovery" },
  };
}

describe("Instagram hybrid parsers", () => {
  it("parses Popular rows with play_count and leaves followers null", () => {
    const parsed = parseInstagramSearchPost({
      shortcode: "pop1",
      caption: "Restaurant inventory walkthrough",
      play_count: 36_000,
      like_count: 900,
      comment_count: 40,
      taken_at_timestamp: 1756700000,
      owner: { username: "opslead" },
      url: "https://www.instagram.com/reel/pop1/",
    });
    expect(parsed?.shortcode).toBe("pop1");
    expect(parsed?.views).toBe(36_000);
    expect(parsed?.ownerFollowerCount).toBeNull();
    expect(parsed?.sourceUrl).toContain("instagram.com/reel/pop1");
  });

  it("parses keyword rows without inventing views or followers", () => {
    const parsed = parseInstagramSearchPost({
      shortcode: "kw1",
      caption: { text: "SOP board before the shift" },
      like_count: 220,
      comment_count: 18,
      owner: { username: "shiftlead" },
    });
    expect(parsed?.views).toBeNull();
    expect(parsed?.ownerFollowerCount).toBeNull();
    expect(parsed?.likes).toBe(220);
  });

  it("parses /v1/instagram/post detail for views and followers", () => {
    const parsed = parseInstagramPostDetail({
      data: {
        xdt_shortcode_media: {
          shortcode: "det1",
          video_play_count: 54_000,
          like_count: 1_100,
          comment_count: 70,
          taken_at_timestamp: 1756700000,
          owner: {
            username: "opslead",
            edge_followed_by: { count: 4_200 },
            is_verified: false,
            is_private: false,
          },
          edge_media_to_caption: { edges: [{ node: { text: "Staff training SOP" } }] },
        },
      },
    });
    expect(parsed?.shortcode).toBe("det1");
    expect(parsed?.views).toBe(54_000);
    expect(parsed?.ownerFollowerCount).toBe(4_200);
    expect(parsed?.caption).toBe("Staff training SOP");
  });

  it("leaves missing post-detail metrics null", () => {
    const parsed = parseInstagramPostDetail({
      shortcode: "empty1",
      owner: { username: "opslead" },
      caption: "No metrics",
    });
    expect(parsed?.views).toBeNull();
    expect(parsed?.ownerFollowerCount).toBeNull();
  });
});

describe("Instagram hybrid allocation, dedupe, and caps", () => {
  it("allocates 3 Popular + 2 keyword + 1 hashtag without exceeding 6 search calls", () => {
    const allocated = allocateInstagramHybridQueries({
      queries: [
        "restaurant staff training",
        "restaurant SOP",
        "restaurant inventory",
        "restaurant scheduling",
        "restaurant manager systems",
      ],
    });
    expect(allocated.popularQueries).toHaveLength(INSTAGRAM_HYBRID_MAX_POPULAR_QUERIES);
    expect(allocated.keywordQueries).toHaveLength(INSTAGRAM_HYBRID_MAX_KEYWORD_QUERIES);
    expect(allocated.hashtagQueries).toHaveLength(INSTAGRAM_HYBRID_MAX_HASHTAG_QUERIES);
    expect(allocated.hashtagQueries[0]).toBe("restaurantmanager");
    expect(
      allocated.popularQueries.length +
        allocated.keywordQueries.length +
        allocated.hashtagQueries.length
    ).toBe(INSTAGRAM_HYBRID_MAX_SEARCH_CALLS);
  });

  it("does not use restaurant-only static terms as the only architecture", () => {
    const marketing = fallbackInstagramSearchQueries({
      niche: "Business & Entrepreneurship",
      pillar: "restaurant marketing",
      count: 3,
    });
    expect(marketing[0]).toContain("restaurant marketing");
    expect(marketing.join(" ")).not.toBe(
      fallbackInstagramSearchQueries({
        niche: "Business & Entrepreneurship",
        pillar: "restaurant operations",
        count: 3,
      }).join(" ")
    );
  });

  it("dedupes by shortcode and keeps multi-lane provenance", () => {
    const merged = mergeInstagramHybridRows([
      { ...post({ shortcode: "shared", views: 10_000 }), lane: "popular", query: "a" },
      { ...post({ shortcode: "shared", views: 40_000 }), lane: "keyword", query: "b" },
      { ...post({ shortcode: "onlypop", views: 12_000 }), lane: "popular", query: "a" },
    ]);
    expect(merged).toHaveLength(2);
    const shared = merged.find((row) => row.shortcode === "shared");
    expect(shared?.lanes).toEqual(["popular", "keyword"]);
    expect(shared?.views).toBe(40_000);
    expect(countCrossLaneOverlap(merged)).toBe(1);
  });

  it("caps Popular profile and keyword/hashtag post enrichment", () => {
    const posts = Array.from({ length: 8 }, (_, index) =>
      post({
        shortcode: `p${index}`,
        ownerUsername: `creator${index}`,
        views: 20_000 + index,
        likes: 400,
        lanes: index < 6 ? ["popular"] : ["keyword"],
      })
    );
    const verdicts = posts.map((item) => verdict({ sourceId: item.shortcode }));
    expect(
      selectPopularCreatorsForProfileEnrichment({
        posts,
        verdicts,
        sourcePillar: "restaurant operations",
        maxCreators: INSTAGRAM_HYBRID_MAX_POPULAR_PROFILE_CALLS,
      })
    ).toHaveLength(6);
    expect(
      selectPostsForDetailEnrichment({
        posts,
        verdicts,
        sourcePillar: "restaurant operations",
        maxPosts: INSTAGRAM_HYBRID_MAX_POST_ENRICHMENT_CALLS,
      }).length
    ).toBeLessThanOrEqual(2);
  });
});

describe("Instagram hybrid virality and semantic routing", () => {
  it("does not count missing followers as strict viral", () => {
    expect(scoreInstagramHybridPost(post({ shortcode: "nofollow", ownerFollowerCount: null }))).toBeNull();
    expect(scoreViralMetrics({ views: 24_000, likes: 1_200, comments: 80, followers: 0 })).toBeNull();
    expect(MIN_VIEWS).toBe(5_000);
  });

  it("applies one Popular creator profile to every shortlisted Reel from that creator", () => {
    const updated = applyCreatorFollowers(
      [
        post({ shortcode: "a", ownerUsername: "opslead", ownerFollowerCount: null }),
        post({ shortcode: "b", ownerUsername: "opslead", ownerFollowerCount: null }),
        post({ shortcode: "c", ownerUsername: "other", ownerFollowerCount: null }),
      ],
      "opslead",
      4_000
    );
    expect(updated[0]?.ownerFollowerCount).toBe(4_000);
    expect(updated[1]?.ownerFollowerCount).toBe(4_000);
    expect(updated[2]?.ownerFollowerCount).toBeNull();
  });

  it("keeps primary-pillar ownership after semantic routing", () => {
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [
        adapted("ops", "How we train restaurant staff before every shift"),
        adapted("qsr", "India QSR opportunity"),
        adapted("recipe", "Pico de Gallo in under 20 seconds"),
      ],
      verdicts: [
        verdict({ sourceId: "ops", primaryPillar: "restaurant operations" }),
        verdict({
          sourceId: "qsr",
          primaryPillar: "restaurant profitability",
          secondaryPillar: "restaurant operations",
        }),
        verdict({
          sourceId: "recipe",
          domainRelevant: false,
          primaryPillar: null,
          confidence: 0.95,
        }),
      ],
    });
    expect(routed.currentPool).toHaveLength(1);
    expect(routed.rerouted[0]?.targetPillar).toBe("restaurant profitability");
    expect(routed.rejected[0]?.reason).toBe("off_domain");
  });

  it("does not import a database from hybrid helpers or the benchmark script", () => {
    const hybrid = readFileSync(
      new URL("../instagramHybridDiscovery.ts", import.meta.url),
      "utf8"
    );
    const script = readFileSync(
      new URL("../../../scripts/viral-posts-instagram-hybrid-benchmark.ts", import.meta.url),
      "utf8"
    );
    expect(hybrid).not.toMatch(/from ["'].*\/(db|poolRepository|repository)["']/);
    expect(script).not.toMatch(/from ["'].*\/(db|poolRepository|repository)["']/);
    expect(script).toContain("delete process.env.DATABASE_URL");
  });
});
