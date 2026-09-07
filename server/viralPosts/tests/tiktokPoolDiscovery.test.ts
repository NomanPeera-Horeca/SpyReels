import { describe, expect, it } from "vitest";
import { parseTikTokSearchVideo } from "../../tiktok";
import {
  MIN_REACH_MULTIPLIER,
  MIN_VIEWS,
  scoreReel,
  scoreViralMetrics,
} from "../../discovery/scoring";
import {
  allocateTikTokSearchQueries,
  dedupeTikTokVideos,
  fallbackTikTokSearchQueries,
  scoreTikTokSearchVideo,
  shouldRunTikTokSeedFallback,
  shouldUseTikTokSearchDiscovery,
} from "../tiktokPoolDiscovery";
import { VIRAL_POOL_DEFAULTS, VIRAL_SEED_POOL_PILLAR } from "../constants";
import { routeSemanticPoolCandidates } from "../semanticPoolRelevance";
import type { AdaptedCandidate } from "../candidateAdapter";
import type { TikTokVideoData } from "../../tiktok";

function video(args: Partial<TikTokVideoData> & { awemeId: string }): TikTokVideoData {
  return {
    caption: args.caption ?? "Restaurant staff training before the shift",
    viewCount: args.viewCount ?? 80_000,
    likeCount: args.likeCount ?? 4_000,
    commentCount: args.commentCount ?? 200,
    shareCount: args.shareCount ?? 50,
    thumbnailUrl: "",
    videoUrl: "",
    videoPageUrl: `https://www.tiktok.com/@ops/video/${args.awemeId}`,
    durationSec: 12,
    postedAt: new Date("2026-09-01T00:00:00.000Z"),
    ownerUsername: args.ownerUsername ?? "ops",
    creatorFollowerCount: args.creatorFollowerCount ?? 8_000,
    saveCount: args.saveCount ?? 20,
    ...args,
  };
}

function adapted(args: {
  platform: "instagram" | "tiktok" | "youtube";
  sourceId: string;
  caption: string;
}): AdaptedCandidate {
  return {
    platform: args.platform,
    sourceId: args.sourceId,
    sourceUrl:
      args.platform === "tiktok"
        ? `https://www.tiktok.com/@ops/video/${args.sourceId}`
        : args.platform === "youtube"
          ? `https://www.youtube.com/shorts/${args.sourceId}`
          : `https://www.instagram.com/reel/${args.sourceId}/`,
    creatorId: "ops",
    creatorName: "Ops",
    creatorHandle: "@ops",
    creatorAvatarUrl: null,
    creatorFollowers: 8_000,
    thumbnailUrl: null,
    videoUrl: null,
    caption: args.caption,
    transcript: null,
    hashtags: [],
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    views: 80_000,
    likes: 4_000,
    comments: 200,
    shares: 50,
    saves: 20,
    reachMultiplier: 10,
    engagementRate: 0.05,
    viewsPerHour: 1_000,
    trendStatus: "proven-format",
    relevanceHint: 50,
    contentPillar: null,
    relevanceLabel: "Direct",
    relevanceReason: "",
    hook: args.caption,
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: { source: `${args.platform}_pool_discovery` },
  };
}

describe("TikTok search parsing", () => {
  it("parses keyword aweme_info rows without inventing followers", () => {
    const parsed = parseTikTokSearchVideo({
      aweme_info: {
        aweme_id: "kw1",
        desc: "FIFO inventory walkthrough",
        create_time: 1756700000,
        author: { unique_id: "nimadorjee", follower_count: 2293 },
        statistics: {
          play_count: 54974,
          digg_count: 1200,
          comment_count: 40,
          share_count: 12,
          collect_count: 80,
        },
        share_url: "https://www.tiktok.com/@nimadorjee/video/kw1",
      },
    });
    expect(parsed?.awemeId).toBe("kw1");
    expect(parsed?.viewCount).toBe(54974);
    expect(parsed?.creatorFollowerCount).toBe(2293);
    expect(parsed?.saveCount).toBe(80);
    expect(parsed?.videoPageUrl).toContain("tiktok.com");
    expect(parsed?.videoPageUrl).not.toContain("instagram.com");
  });

  it("parses Top search rows and leaves missing followers null", () => {
    const parsed = parseTikTokSearchVideo({
      id: "top1",
      desc: "Server training shadow",
      create_time: 1756700000,
      author: { unique_id: "degidios" },
      statistics: {
        play_count: 6_000_000,
        digg_count: 10_000,
        comment_count: 200,
        share_count: 50,
        collect_count: 300,
      },
      url: "https://www.tiktok.com/@degidios/video/top1",
    });
    expect(parsed?.awemeId).toBe("top1");
    expect(parsed?.viewCount).toBe(6_000_000);
    expect(parsed?.creatorFollowerCount).toBeNull();
    expect(parsed?.saveCount).toBe(300);
  });
});

describe("TikTok search allocation and dedupe", () => {
  it("caps keyword plus Top at 6 provider calls", () => {
    const allocated = allocateTikTokSearchQueries({
      queries: ["a", "b", "c", "d", "e"],
      maxScCalls: 6,
    });
    expect(allocated.keywordQueries).toHaveLength(4);
    expect(allocated.topQueries).toHaveLength(2);
    expect(allocated.keywordQueries.length + allocated.topQueries.length).toBeLessThanOrEqual(
      VIRAL_POOL_DEFAULTS.tiktokPoolMaxSearchCalls
    );
  });

  it("does not invent extra Top calls when the remaining budget is thin", () => {
    const allocated = allocateTikTokSearchQueries({
      queries: ["a", "b", "c", "d", "e"],
      maxScCalls: 3,
    });
    expect(allocated.keywordQueries).toHaveLength(3);
    expect(allocated.topQueries).toHaveLength(0);
  });

  it("keeps seed-mix TikTok pools on the seed scrape fallback", () => {
    expect(shouldUseTikTokSearchDiscovery(VIRAL_SEED_POOL_PILLAR)).toBe(false);
    expect(shouldUseTikTokSearchDiscovery("restaurant operations")).toBe(true);
  });

  it("skips seed fallback when search already admitted a healthy current pool", () => {
    expect(
      shouldRunTikTokSeedFallback({
        admittedCount: VIRAL_POOL_DEFAULTS.tiktokPoolMinSearchAdmittedToSkipSeeds,
        remainingBudget: 30,
      })
    ).toBe(false);
    expect(
      shouldRunTikTokSeedFallback({
        admittedCount: 4,
        remainingBudget: VIRAL_POOL_DEFAULTS.seedScCallsPerHandle,
      })
    ).toBe(true);
    expect(
      shouldRunTikTokSeedFallback({
        admittedCount: 2,
        remainingBudget: VIRAL_POOL_DEFAULTS.seedScCallsPerHandle - 1,
      })
    ).toBe(false);
  });

  it("dedupes keyword and Top by awemeId and counts overlap", () => {
    const unique = dedupeTikTokVideos([
      video({ awemeId: "shared", viewCount: 10_000 }),
      video({ awemeId: "only_kw", viewCount: 12_000 }),
      video({ awemeId: "shared", viewCount: 90_000 }),
    ]);
    expect(unique).toHaveLength(2);
    expect(unique.find((row) => row.awemeId === "shared")?.viewCount).toBe(90_000);
  });

  it("does not use restaurant-only static terms as the only architecture", () => {
    const marketing = fallbackTikTokSearchQueries({
      niche: "Business & Entrepreneurship",
      pillar: "restaurant marketing",
      count: 3,
    });
    expect(marketing[0]).toContain("restaurant marketing");
    expect(marketing.join(" ")).not.toBe(
      fallbackTikTokSearchQueries({
        niche: "Business & Entrepreneurship",
        pillar: "restaurant operations",
        count: 3,
      }).join(" ")
    );
  });
});

describe("shared strict virality", () => {
  it("uses the same thresholds for TikTok search and Instagram scoreReel", () => {
    const tiktok = scoreTikTokSearchVideo(
      video({
        awemeId: "strict",
        viewCount: 24_000,
        creatorFollowerCount: 4_000,
        likeCount: 1_200,
        commentCount: 80,
      })
    );
    const instagram = scoreReel({
      shortcode: "abc",
      caption: "same math",
      views: 24_000,
      likes: 1_200,
      comments: 80,
      videoUrl: "",
      thumbnailUrl: "",
      postedAt: new Date(),
      owner: {
        username: "ops",
        fullName: "Ops",
        followers: 4_000,
        isVerified: false,
        isPrivate: false,
        biography: "",
        profilePicUrl: "",
      },
    });
    expect(tiktok?.tier).toBe(instagram?.tier);
    expect(tiktok?.viralScore).toBe(instagram?.viralScore);
    expect(instagram?.reelUrl).toContain("instagram.com/reel/");
    expect(MIN_VIEWS).toBe(5_000);
    expect(MIN_REACH_MULTIPLIER).toBe(3);
  });

  it("does not invent followers or pass videos with missing metrics", () => {
    expect(
      scoreTikTokSearchVideo(video({ awemeId: "nofollow", creatorFollowerCount: null }))
    ).toBeNull();
    expect(scoreTikTokSearchVideo(video({ awemeId: "noviews", viewCount: 0 }))).toBeNull();
    expect(scoreViralMetrics({ views: 0, likes: 10, comments: 1, followers: 100 })).toBeNull();
  });
});

describe("semantic routing stays primary-only across platforms", () => {
  it("keeps TikTok operations content in the current pool", () => {
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [
        adapted({
          platform: "tiktok",
          sourceId: "tt-ops",
          caption: "How we train restaurant staff before every shift",
        }),
      ],
      verdicts: [
        {
          sourceId: "tt-ops",
          domainRelevant: true,
          primaryPillar: "restaurant operations",
          secondaryPillar: null,
          confidence: 0.9,
          reason: "Staff training",
        },
      ],
    });
    expect(routed.currentPool).toHaveLength(1);
    expect(routed.rerouted).toHaveLength(0);
  });

  it("keeps YouTube operations content and Instagram behavior unchanged", () => {
    const youtube = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [
        adapted({
          platform: "youtube",
          sourceId: "yt-ops",
          caption: "Restaurant inventory SOP that prevents stockouts",
        }),
      ],
      verdicts: [
        {
          sourceId: "yt-ops",
          domainRelevant: true,
          primaryPillar: "restaurant operations",
          secondaryPillar: null,
          confidence: 0.88,
          reason: "Inventory SOP",
        },
      ],
    });
    const instagramRecipe = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [
        adapted({
          platform: "instagram",
          sourceId: "ig-recipe",
          caption: "Pico de Gallo in under 20 seconds",
        }),
      ],
      verdicts: [
        {
          sourceId: "ig-recipe",
          domainRelevant: false,
          primaryPillar: null,
          secondaryPillar: null,
          confidence: 0.95,
          reason: "Recipe tutorial",
        },
      ],
    });
    expect(youtube.currentPool[0]?.sourceUrl).toContain("youtube.com");
    expect(instagramRecipe.rejected[0]?.reason).toBe("off_domain");
  });

  it("reroutes sibling-pillar TikTok videos and rejects off-domain rows", () => {
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [
        adapted({
          platform: "tiktok",
          sourceId: "qsr",
          caption: "India QSR opportunity",
        }),
        adapted({
          platform: "tiktok",
          sourceId: "dance",
          caption: "Dance trend",
        }),
      ],
      verdicts: [
        {
          sourceId: "qsr",
          domainRelevant: true,
          primaryPillar: "restaurant profitability",
          secondaryPillar: "restaurant operations",
          confidence: 0.91,
          reason: "Market opportunity",
        },
      ],
    });
    expect(routed.currentPool).toHaveLength(0);
    expect(routed.rerouted[0]?.targetPillar).toBe("restaurant profitability");
    expect(routed.rejected[0]?.reason).toBe("missing_verdict");
  });
});
