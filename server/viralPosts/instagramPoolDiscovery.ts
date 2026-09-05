import {
  createDiscoveryScCallTracker,
  runWithDiscoveryScCallTracker,
  scrapeReels,
  type ReelData,
} from "../instagram";
import {
  runDiscoveryPipeline,
  type DiscoveryResult,
} from "../discovery/pipeline";
import {
  scoreReel,
  type ParsedReel,
  type ScoredReel,
} from "../discovery/scoring";
import {
  adaptDiscoveryResult,
  type AdaptedCandidate,
} from "./candidateAdapter";
import { DEFAULT_CONTENT_PILLARS, VIRAL_POOL_DEFAULTS } from "./constants";

export type InstagramPoolDrillCreator = {
  handle: string;
  fullName: string;
  followers: number;
  profilePicUrl: string;
  biography: string;
  isVerified: boolean;
  hashtagReelCount: number;
  tier1Count: number;
  bestViralScore: number;
  bestViews: number;
};

export type InstagramPoolDiscoveryResult = {
  adapted: AdaptedCandidate[];
  description: string;
  routedNiche: string;
  hashtagsUsed: string[];
  hashtagFailures: string[];
  shallowScCalls: number;
  drillScCalls: number;
  totalScCalls: number;
  costEstimateUsd: number;
  shallowCandidateCount: number;
  uniqueShallowCreators: number;
  selectedCreators: InstagramPoolDrillCreator[];
  drilledCreatorHandles: string[];
  drilledReelsRead: number;
  drilledViralCandidates: number;
};

const RESTAURANT_PILLARS = new Set<string>(DEFAULT_CONTENT_PILLARS);
const DEFAULT_SC_USD_PER_CREDIT = 0.002;

function normalizeHandle(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

/**
 * Pool discovery prompt stays pillar-specific even when the legacy pool niche is
 * the broader Business & Entrepreneurship bucket. This helps hashtag routing
 * search the restaurant/hospitality subject rather than generic entrepreneurship.
 */
export function buildInstagramPoolDiscoveryDescription(args: {
  niche: string;
  pillar: string;
}): string {
  if (RESTAURANT_PILLARS.has(args.pillar)) {
    return `Find Instagram Reels for restaurant and hospitality operators about ${args.pillar}. Target restaurant owners, chefs, cafe operators, food-service entrepreneurs, and hospitality leaders. Use restaurant-specific discovery signals first, then adjacent operational or business signals. Prefer practical, realistically remakeable educational, story, talking-head, and before/after formats.`;
  }
  return `Find Instagram Reels about ${args.pillar} for creators in the ${args.niche} niche. Prefer practical, realistically remakeable educational, story, talking-head, and before/after formats.`;
}

/**
 * Hashtag search is primarily a creator-discovery stage. Prefer creators who
 * repeatedly surface with strong qualifying reels instead of drilling accounts
 * in provider/result insertion order.
 */
export function selectInstagramCreatorsForDrilling(args: {
  reels: DiscoveryResult["viralReels"];
  limit?: number;
}): InstagramPoolDrillCreator[] {
  const limit = Math.max(
    0,
    Math.min(
      args.limit ?? VIRAL_POOL_DEFAULTS.instagramPoolMaxCreatorsToDrill,
      20
    )
  );
  const byHandle = new Map<string, InstagramPoolDrillCreator>();

  for (const reel of args.reels) {
    const handle = normalizeHandle(reel.owner.username);
    if (!handle) continue;
    const existing = byHandle.get(handle);
    if (!existing) {
      byHandle.set(handle, {
        handle,
        fullName: reel.owner.fullName || handle,
        followers: reel.owner.followers,
        profilePicUrl: reel.owner.profilePicUrl,
        biography: reel.owner.biography,
        isVerified: reel.owner.isVerified,
        hashtagReelCount: 1,
        tier1Count: reel.tier === 1 ? 1 : 0,
        bestViralScore: reel.viralScore,
        bestViews: reel.views,
      });
      continue;
    }

    existing.hashtagReelCount += 1;
    if (reel.tier === 1) existing.tier1Count += 1;
    if (reel.viralScore > existing.bestViralScore) {
      existing.bestViralScore = reel.viralScore;
    }
    if (reel.views > existing.bestViews) existing.bestViews = reel.views;
    if (reel.owner.followers > existing.followers) {
      existing.followers = reel.owner.followers;
    }
    if (!existing.profilePicUrl && reel.owner.profilePicUrl) {
      existing.profilePicUrl = reel.owner.profilePicUrl;
    }
    if (!existing.biography && reel.owner.biography) {
      existing.biography = reel.owner.biography;
    }
  }

  return [...byHandle.values()]
    .sort((a, b) => {
      if (b.tier1Count !== a.tier1Count) return b.tier1Count - a.tier1Count;
      if (b.hashtagReelCount !== a.hashtagReelCount) {
        return b.hashtagReelCount - a.hashtagReelCount;
      }
      if (b.bestViralScore !== a.bestViralScore) {
        return b.bestViralScore - a.bestViralScore;
      }
      if (b.bestViews !== a.bestViews) return b.bestViews - a.bestViews;
      return a.handle.localeCompare(b.handle);
    })
    .slice(0, limit);
}

function reelDataToParsed(
  reel: ReelData,
  creator: InstagramPoolDrillCreator,
  followerCount: number,
  profilePicUrl: string
): ParsedReel {
  return {
    shortcode: reel.shortcode,
    caption: reel.caption,
    views: reel.viewCount,
    likes: reel.likeCount,
    comments: reel.commentCount,
    videoUrl: reel.videoUrl,
    thumbnailUrl: reel.thumbnailUrl,
    postedAt: reel.postedAt,
    owner: {
      username: creator.handle,
      fullName: creator.fullName,
      followers: followerCount || creator.followers,
      isVerified: creator.isVerified,
      isPrivate: false,
      biography: creator.biography,
      profilePicUrl: profilePicUrl || creator.profilePicUrl,
    },
  };
}

function scoredToDiscoveryReel(
  reel: ScoredReel
): DiscoveryResult["viralReels"][number] {
  return {
    shortcode: reel.shortcode,
    reelUrl: reel.reelUrl,
    thumbnailUrl: reel.thumbnailUrl,
    videoUrl: reel.videoUrl,
    caption: reel.caption,
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    viralScore: reel.viralScore,
    viralTier: reel.viralTier,
    reachMultiplier: reel.reachMultiplier,
    engagementRate: reel.engagementRate,
    tier: reel.tier,
    postedAt: reel.postedAt ? reel.postedAt.toISOString() : null,
    owner: {
      username: reel.owner.username,
      fullName: reel.owner.fullName,
      followers: reel.owner.followers,
      isVerified: reel.owner.isVerified,
      biography: reel.owner.biography,
      profilePicUrl: reel.owner.profilePicUrl,
    },
  };
}

function dedupeDiscoveryReels(
  shallow: DiscoveryResult["viralReels"],
  drilled: DiscoveryResult["viralReels"]
): DiscoveryResult["viralReels"] {
  const byShortcode = new Map<string, DiscoveryResult["viralReels"][number]>();
  for (const reel of shallow) byShortcode.set(reel.shortcode, reel);
  // Drilled rows win because profile scraping gives us a richer creator context
  // and a deeper history than the one-page hashtag hit.
  for (const reel of drilled) byShortcode.set(reel.shortcode, reel);
  return [...byShortcode.values()];
}

/**
 * Deep Instagram retrieval for one Viral Posts pool without increasing the
 * existing provider call ceiling. Stage 1 uses hashtags to discover promising
 * creators; stage 2 spends only the remaining fuse budget drilling the best of
 * those creators' six-month Reel histories.
 */
export async function discoverInstagramPoolCandidates(args: {
  niche: string;
  pillar: string;
  maxScCalls: number;
}): Promise<InstagramPoolDiscoveryResult> {
  const maxScCalls = Math.max(1, args.maxScCalls);
  const description = buildInstagramPoolDiscoveryDescription(args);
  const reserveForDrilling = Math.min(
    VIRAL_POOL_DEFAULTS.instagramPoolDrillReserveCalls,
    Math.max(0, maxScCalls - 1)
  );
  const shallowBudget = Math.max(1, maxScCalls - reserveForDrilling);

  const shallow = await runDiscoveryPipeline(description, undefined, {
    skipMediaMirroring: true,
    maxScCalls: shallowBudget,
    skipProfileDrilling: true,
    skipRelevanceFilter: true,
  });

  const selectedCreators = selectInstagramCreatorsForDrilling({
    reels: shallow.viralReels,
  });
  const remainingBudget = Math.max(0, maxScCalls - shallow.scCallCount);
  const drilled: DiscoveryResult["viralReels"] = [];
  const drilledCreatorHandles: string[] = [];
  let drilledReelsRead = 0;
  let drillScCalls = 0;

  if (remainingBudget > 0 && selectedCreators.length > 0) {
    const tracker = createDiscoveryScCallTracker(remainingBudget);
    await runWithDiscoveryScCallTracker(tracker, async () => {
      for (const creator of selectedCreators) {
        if (tracker.count >= tracker.maxCalls) break;
        const before = tracker.count;
        try {
          const scraped = await scrapeReels(
            creator.handle,
            VIRAL_POOL_DEFAULTS.instagramPoolDrillTimeframeDays,
            undefined,
            {
              maxReels: VIRAL_POOL_DEFAULTS.instagramPoolDrillMaxReels,
              timeoutMs: 60_000,
            }
          );
          drilledCreatorHandles.push(creator.handle);
          drilledReelsRead += scraped.reels.length;
          const strictScored = scraped.reels
            .map((reel) =>
              scoreReel(
                reelDataToParsed(
                  reel,
                  creator,
                  scraped.followerCount,
                  scraped.profilePicUrl
                )
              )
            )
            .filter((reel): reel is ScoredReel => Boolean(reel))
            .sort((a, b) => {
              if (a.tier !== b.tier) return a.tier - b.tier;
              return b.viralScore - a.viralScore;
            })
            .slice(0, VIRAL_POOL_DEFAULTS.instagramPoolDrillKeepPerCreator);
          drilled.push(...strictScored.map(scoredToDiscoveryReel));
          console.info("[viralPosts.pool] instagram_creator_drill", {
            handle: creator.handle,
            hashtagReels: creator.hashtagReelCount,
            tier1HashtagReels: creator.tier1Count,
            bestHashtagViralScore: Number(creator.bestViralScore.toFixed(2)),
            scrapedReels: scraped.reels.length,
            keptViralReels: strictScored.length,
            scCalls: tracker.count - before,
          });
        } catch (err) {
          console.warn("[viralPosts.pool] instagram_creator_drill_failed", {
            handle: creator.handle,
            scCalls: tracker.count - before,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
    drillScCalls = tracker.count;
  }

  const combinedReels = dedupeDiscoveryReels(shallow.viralReels, drilled);
  const totalScCalls = shallow.scCallCount + drillScCalls;
  const usdPerCredit =
    Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) ||
    DEFAULT_SC_USD_PER_CREDIT;
  const combinedResult: DiscoveryResult = {
    ...shallow,
    viralReels: combinedReels,
    scCallCount: totalScCalls,
    costEstimateUsd: totalScCalls * usdPerCredit,
  };
  const adapted = adaptDiscoveryResult(combinedResult).map((candidate) => ({
    ...candidate,
    rawProviderPayload: {
      ...candidate.rawProviderPayload,
      source: "instagram_pool_discovery",
      retrievalDepth:
        drilled.some((reel) => reel.shortcode === candidate.sourceId)
          ? "creator_drill"
          : "hashtag",
    },
  }));

  console.info("[viralPosts.pool] instagram_retrieval_depth", {
    pillar: args.pillar,
    niche: args.niche,
    hashtags: shallow.hashtagsUsed,
    hashtagFailures: shallow.hashtagFailures,
    shallowScCalls: shallow.scCallCount,
    drillScCalls,
    totalScCalls,
    shallowCandidates: shallow.viralReels.length,
    uniqueShallowCreators: new Set(
      shallow.viralReels.map((reel) => normalizeHandle(reel.owner.username))
    ).size,
    selectedCreators: selectedCreators.map((creator) => creator.handle),
    drilledCreators: drilledCreatorHandles,
    drilledReelsRead,
    drilledViralCandidates: drilled.length,
    finalUniqueCandidates: adapted.length,
  });

  return {
    adapted,
    description,
    routedNiche: shallow.routedNiche,
    hashtagsUsed: shallow.hashtagsUsed,
    hashtagFailures: shallow.hashtagFailures,
    shallowScCalls: shallow.scCallCount,
    drillScCalls,
    totalScCalls,
    costEstimateUsd: combinedResult.costEstimateUsd,
    shallowCandidateCount: shallow.viralReels.length,
    uniqueShallowCreators: new Set(
      shallow.viralReels.map((reel) => normalizeHandle(reel.owner.username))
    ).size,
    selectedCreators,
    drilledCreatorHandles,
    drilledReelsRead,
    drilledViralCandidates: drilled.length,
  };
}
