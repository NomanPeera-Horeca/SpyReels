import {
  createDiscoveryScCallTracker,
  runWithDiscoveryScCallTracker,
  scrapeReels,
  searchHashtagReels,
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
import { classifyCandidateForPoolAdmission } from "./poolAdmission";
import {
  classifySemanticPoolRelevance,
  routeSemanticPoolCandidates,
  type SemanticPoolRejected,
  type SemanticPoolReroute,
} from "./semanticPoolRelevance";

export type InstagramHashtagCreatorSeed = {
  handle: string;
  fullName: string;
  profilePicUrl: string;
  biography: string;
  isVerified: boolean;
  matchedHashtags: string[];
  hashtagPostCount: number;
  topicSignalScore: number;
  sampleCaption: string;
};

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
  matchedHashtags: string[];
  topicSignalScore: number;
  seedMode: "scored_reel" | "metricless_hashtag" | "mixed";
  sampleCaption: string;
};

export type InstagramPoolDiscoveryResult = {
  adapted: AdaptedCandidate[];
  description: string;
  routedNiche: string;
  hashtagsUsed: string[];
  hashtagFailures: string[];
  routeProbeScCalls: number;
  rawHashtagScCalls: number;
  shallowScCalls: number;
  drillScCalls: number;
  totalScCalls: number;
  costEstimateUsd: number;
  shallowCandidateCount: number;
  rawHashtagPosts: number;
  uniqueShallowCreators: number;
  metriclessCreatorSeeds: number;
  selectedCreators: InstagramPoolDrillCreator[];
  drilledCreatorHandles: string[];
  drilledReelsRead: number;
  drilledViralCandidates: number;
  poolAdmissionRejected: number;
  semanticHaikuCalls: number;
  semanticRejected: number;
  semanticRerouted: number;
  reroutedCandidates: SemanticPoolReroute[];
  semanticRejectedCandidates: SemanticPoolRejected[];
};

const RESTAURANT_PILLARS = new Set<string>(DEFAULT_CONTENT_PILLARS);
const DEFAULT_SC_USD_PER_CREDIT = 0.002;
const RESTAURANT_DOMAIN =
  /\b(restaurant|restaurants|restaurateur|cafe|cafes|coffee shop|chef|hospitality|foodservice|food service|food-service|menu|kitchen|catering|diner|bistro)\b/i;

const PILLAR_TERMS: Record<string, string[]> = {
  "restaurant profitability": [
    "profit",
    "margin",
    "food cost",
    "cogs",
    "revenue",
    "cash flow",
    "break even",
    "pricing",
  ],
  "menu engineering": [
    "menu",
    "pricing",
    "dish",
    "recipe",
    "upsell",
    "special",
    "food cost",
  ],
  "restaurant operations": [
    "operations",
    "staff",
    "hiring",
    "training",
    "shift",
    "sop",
    "service",
    "system",
    "manager",
  ],
  "kitchen buildouts": [
    "kitchen",
    "equipment",
    "buildout",
    "build out",
    "construction",
    "lease",
    "hood",
    "refrigeration",
  ],
  "restaurant marketing": [
    "marketing",
    "advertising",
    "ads",
    "instagram",
    "content",
    "promotion",
    "customer",
    "loyalty",
  ],
  "hospitality leadership": [
    "leadership",
    "owner",
    "founder",
    "manager",
    "team",
    "culture",
    "hospitality",
  ],
};

function normalizeHandle(value: string): string {
  return value.replace(/^@/, "").trim().toLowerCase();
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Lightweight seed relevance used only to decide which metricless hashtag
 * creators deserve an expensive profile drill. It is NOT the final Today topic
 * relevance score and never creates a recommendation by itself.
 */
export function instagramCreatorSeedTopicSignal(args: {
  text: string;
  pillar: string;
  niche: string;
}): number {
  const text = normalizeText(args.text);
  if (!text) return 0;

  let score = 0;
  const restaurantFamily = RESTAURANT_PILLARS.has(args.pillar);
  if (restaurantFamily && RESTAURANT_DOMAIN.test(text)) score += 8;

  const pillarTerms = PILLAR_TERMS[args.pillar] ?? [];
  for (const term of pillarTerms) {
    if (text.includes(term)) score += 2;
  }

  if (!restaurantFamily) {
    const genericTerms = `${args.pillar} ${args.niche}`
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length >= 4);
    for (const term of new Set(genericTerms)) {
      if (text.includes(term)) score += 2;
    }
  }

  return Math.min(30, score);
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

function extractSearchPosts(data: unknown): unknown[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  if (Array.isArray(root.reels)) return root.reels;
  if (Array.isArray(root.posts)) return root.posts;
  if (Array.isArray(root.items)) return root.items;
  if (Array.isArray(root.results)) return root.results;
  if (root.data && typeof root.data === "object") {
    const nested = root.data as Record<string, unknown>;
    if (Array.isArray(nested.reels)) return nested.reels;
    if (Array.isArray(nested.posts)) return nested.posts;
    if (Array.isArray(nested.items)) return nested.items;
    if (Array.isArray(nested.results)) return nested.results;
  }
  return [];
}

function rawCaption(post: Record<string, unknown>): string {
  if (typeof post.caption === "string") return post.caption;
  if (post.caption && typeof post.caption === "object") {
    const text = (post.caption as Record<string, unknown>).text;
    if (typeof text === "string") return text;
  }
  return "";
}

function rawOwner(post: Record<string, unknown>): Record<string, unknown> {
  const owner = post.owner ?? post.user;
  return owner && typeof owner === "object"
    ? (owner as Record<string, unknown>)
    : {};
}

function parseMetriclessHashtagSeed(args: {
  post: unknown;
  hashtag: string;
  pillar: string;
  niche: string;
}): InstagramHashtagCreatorSeed | null {
  if (!args.post || typeof args.post !== "object") return null;
  const post = args.post as Record<string, unknown>;
  const owner = rawOwner(post);
  const handle = normalizeHandle(
    String(owner.username ?? owner.user_name ?? post.ownerUsername ?? "")
  );
  if (!handle) return null;

  const fullName = String(owner.full_name ?? owner.fullName ?? handle).trim() || handle;
  const biography = String(owner.biography ?? owner.bio ?? "").trim();
  const profilePicUrl = String(
    owner.profile_pic_url ?? owner.profilePicUrl ?? ""
  ).trim();
  const isVerified = owner.is_verified === true || owner.isVerified === true;
  const caption = rawCaption(post);
  const topicSignalScore = instagramCreatorSeedTopicSignal({
    text: `${fullName} ${biography} ${caption}`,
    pillar: args.pillar,
    niche: args.niche,
  });

  return {
    handle,
    fullName,
    profilePicUrl,
    biography,
    isVerified,
    matchedHashtags: [args.hashtag],
    hashtagPostCount: 1,
    topicSignalScore,
    sampleCaption: caption,
  };
}

function mergeMetriclessSeed(
  target: Map<string, InstagramHashtagCreatorSeed>,
  seed: InstagramHashtagCreatorSeed
): void {
  const existing = target.get(seed.handle);
  if (!existing) {
    target.set(seed.handle, seed);
    return;
  }

  existing.hashtagPostCount += seed.hashtagPostCount;
  existing.topicSignalScore = Math.max(
    existing.topicSignalScore,
    seed.topicSignalScore
  );
  existing.matchedHashtags = [
    ...new Set([...existing.matchedHashtags, ...seed.matchedHashtags]),
  ];
  if (!existing.profilePicUrl && seed.profilePicUrl) {
    existing.profilePicUrl = seed.profilePicUrl;
  }
  if (!existing.biography && seed.biography) existing.biography = seed.biography;
  if (!existing.sampleCaption && seed.sampleCaption) {
    existing.sampleCaption = seed.sampleCaption;
  }
  existing.isVerified = existing.isVerified || seed.isVerified;
}

/**
 * Select profile-drill targets from both metric-bearing shallow candidates and
 * metricless hashtag search results. Since Instagram/ScrapeCreators stopped
 * returning play counts on hashtag search in Aug 2026, metricless creators are
 * ranked by topic evidence and repeated hashtag appearances; virality is judged
 * only after their real profile Reel history is fetched.
 */
export function selectInstagramCreatorsForDrilling(args: {
  reels: DiscoveryResult["viralReels"];
  metriclessSeeds?: InstagramHashtagCreatorSeed[];
  pillar?: string;
  niche?: string;
  limit?: number;
}): InstagramPoolDrillCreator[] {
  const limit = Math.max(
    0,
    Math.min(
      args.limit ?? VIRAL_POOL_DEFAULTS.instagramPoolMaxCreatorsToDrill,
      20
    )
  );
  const pillar = args.pillar ?? "";
  const niche = args.niche ?? "";
  const byHandle = new Map<string, InstagramPoolDrillCreator>();

  for (const seed of args.metriclessSeeds ?? []) {
    const handle = normalizeHandle(seed.handle);
    if (!handle) continue;
    byHandle.set(handle, {
      handle,
      fullName: seed.fullName || handle,
      followers: 0,
      profilePicUrl: seed.profilePicUrl,
      biography: seed.biography,
      isVerified: seed.isVerified,
      hashtagReelCount: seed.hashtagPostCount,
      tier1Count: 0,
      bestViralScore: 0,
      bestViews: 0,
      matchedHashtags: [...new Set(seed.matchedHashtags)],
      topicSignalScore: seed.topicSignalScore,
      seedMode: "metricless_hashtag",
      sampleCaption: seed.sampleCaption,
    });
  }

  for (const reel of args.reels) {
    const handle = normalizeHandle(reel.owner.username);
    if (!handle) continue;
    const topicSignal = instagramCreatorSeedTopicSignal({
      text: `${reel.owner.fullName} ${reel.owner.biography} ${reel.caption}`,
      pillar,
      niche,
    });
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
        matchedHashtags: [],
        topicSignalScore: topicSignal,
        seedMode: "scored_reel",
        sampleCaption: reel.caption,
      });
      continue;
    }

    existing.seedMode =
      existing.seedMode === "metricless_hashtag" ? "mixed" : existing.seedMode;
    existing.hashtagReelCount += 1;
    existing.topicSignalScore = Math.max(existing.topicSignalScore, topicSignal);
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
    if (!existing.sampleCaption && reel.caption) existing.sampleCaption = reel.caption;
  }

  return [...byHandle.values()]
    .sort((a, b) => {
      if (b.topicSignalScore !== a.topicSignalScore) {
        return b.topicSignalScore - a.topicSignalScore;
      }
      if (b.tier1Count !== a.tier1Count) return b.tier1Count - a.tier1Count;
      if (b.matchedHashtags.length !== a.matchedHashtags.length) {
        return b.matchedHashtags.length - a.matchedHashtags.length;
      }
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
  for (const reel of drilled) byShortcode.set(reel.shortcode, reel);
  return [...byShortcode.values()];
}

export type InstagramPoolAdmissionResult = {
  adapted: AdaptedCandidate[];
  reroutedCandidates: SemanticPoolReroute[];
  semanticRejectedCandidates: SemanticPoolRejected[];
  semanticHaikuCalls: number;
  semanticRejected: number;
  semanticRerouted: number;
  poolAdmissionRejected: number;
};

function emptySemanticAdmission(
  adapted: AdaptedCandidate[],
  poolAdmissionRejected: number
): InstagramPoolAdmissionResult {
  return {
    adapted,
    reroutedCandidates: [],
    semanticRejectedCandidates: [],
    semanticHaikuCalls: 0,
    semanticRejected: 0,
    semanticRerouted: 0,
    poolAdmissionRejected,
  };
}

/**
 * Final restaurant-family gate after strict scoreReel() + adapt.
 * Semantic classification uses Haiku only. It does not call ScrapeCreators.
 * Fail closed: if the judge is unavailable, do not fall back to keywords.
 */
export async function applyInstagramPoolAdmission(args: {
  niche: string;
  poolNiche: string;
  pillar: string;
  candidates: AdaptedCandidate[];
}): Promise<InstagramPoolAdmissionResult> {
  if (RESTAURANT_PILLARS.has(args.pillar)) {
    try {
      const classified = await classifySemanticPoolRelevance({
        niche: args.niche,
        candidates: args.candidates,
      });
      const routed = routeSemanticPoolCandidates({
        sourcePillar: args.pillar,
        candidates: args.candidates,
        verdicts: classified.verdicts,
      });
      return {
        adapted: routed.currentPool,
        reroutedCandidates: routed.rerouted,
        semanticRejectedCandidates: routed.rejected,
        semanticHaikuCalls: classified.haikuCalls,
        semanticRejected: routed.rejected.length,
        semanticRerouted: routed.rerouted.length,
        poolAdmissionRejected: 0,
      };
    } catch (err) {
      console.error("[viralPosts.pool] instagram_semantic_classification_failed", {
        pillar: args.pillar,
        niche: args.niche,
        candidateCount: args.candidates.length,
        error: err instanceof Error ? err.message : String(err),
      });
      return {
        adapted: [],
        reroutedCandidates: [],
        semanticRejectedCandidates: args.candidates.map((candidate) => ({
          candidate,
          verdict: null,
          reason: "missing_verdict",
        })),
        semanticHaikuCalls: 0,
        semanticRejected: args.candidates.length,
        semanticRerouted: 0,
        poolAdmissionRejected: 0,
      };
    }
  }

  const adapted: AdaptedCandidate[] = [];
  let poolAdmissionRejected = 0;
  for (const candidate of args.candidates) {
    const decision = classifyCandidateForPoolAdmission({
      pool: {
        platform: "instagram",
        niche: args.poolNiche,
        pillar: args.pillar,
      },
      candidate,
    });
    if (!decision.admit) {
      poolAdmissionRejected++;
      console.info("[viralPosts.pool] instagram_pool_admission_rejected", {
        pillar: args.pillar,
        sourceId: candidate.sourceId,
        creatorHandle: candidate.creatorHandle,
        confidence: decision.classification.confidence,
        reason: decision.classification.reason,
      });
      continue;
    }
    adapted.push({
      ...candidate,
      contentPillar: decision.classification.primaryPillar,
      pillarConfidence: decision.classification.confidence,
      rawProviderPayload: {
        ...candidate.rawProviderPayload,
        poolAdmissionConfidence: decision.classification.confidence,
        poolAdmissionReason: decision.classification.reason,
      },
    });
  }
  return emptySemanticAdmission(adapted, poolAdmissionRejected);
}

/**
 * Deep Instagram retrieval for one Viral Posts pool without increasing the
 * existing provider call ceiling. The shared discovery pipeline is first used
 * with a one-call fuse to obtain niche routing + generated hashtags. Because
 * hashtag search no longer includes play counts, we then use the raw hashtag
 * rows only as creator seeds and spend the remaining budget on real profile
 * Reel history where follower/view metrics exist.
 */
export async function discoverInstagramPoolCandidates(args: {
  niche: string;
  pillar: string;
  maxScCalls: number;
}): Promise<InstagramPoolDiscoveryResult> {
  const maxScCalls = Math.max(1, args.maxScCalls);
  const description = buildInstagramPoolDiscoveryDescription(args);

  const routeProbe = await runDiscoveryPipeline(description, undefined, {
    skipMediaMirroring: true,
    maxScCalls: 1,
    skipProfileDrilling: true,
    skipRelevanceFilter: true,
  });

  const reserveForDrilling = Math.min(
    VIRAL_POOL_DEFAULTS.instagramPoolDrillReserveCalls,
    Math.max(0, maxScCalls - routeProbe.scCallCount)
  );
  const rawHashtagBudget = Math.max(
    0,
    Math.min(
      routeProbe.hashtagsUsed.length,
      maxScCalls - routeProbe.scCallCount - reserveForDrilling
    )
  );
  const rawSeedsByHandle = new Map<string, InstagramHashtagCreatorSeed>();
  const hashtagFailures = new Set(routeProbe.hashtagFailures);
  let rawHashtagPosts = 0;
  let rawHashtagScCalls = 0;

  if (rawHashtagBudget > 0) {
    const tracker = createDiscoveryScCallTracker(rawHashtagBudget);
    await runWithDiscoveryScCallTracker(tracker, async () => {
      for (const hashtag of routeProbe.hashtagsUsed) {
        if (tracker.count >= tracker.maxCalls) break;
        try {
          const response = await searchHashtagReels(hashtag);
          if (!response.success) {
            hashtagFailures.add(hashtag);
            continue;
          }
          const posts = extractSearchPosts(response.data);
          rawHashtagPosts += posts.length;
          for (const post of posts) {
            const seed = parseMetriclessHashtagSeed({
              post,
              hashtag,
              pillar: args.pillar,
              niche: args.niche,
            });
            if (seed) mergeMetriclessSeed(rawSeedsByHandle, seed);
          }
          console.info("[viralPosts.pool] instagram_metricless_hashtag_seed", {
            hashtag,
            posts: posts.length,
            uniqueCreatorsSoFar: rawSeedsByHandle.size,
          });
        } catch (err) {
          hashtagFailures.add(hashtag);
          console.warn("[viralPosts.pool] instagram_metricless_hashtag_failed", {
            hashtag,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
    rawHashtagScCalls = tracker.count;
  }

  const metriclessSeeds = [...rawSeedsByHandle.values()];
  const selectedCreators = selectInstagramCreatorsForDrilling({
    reels: routeProbe.viralReels,
    metriclessSeeds,
    pillar: args.pillar,
    niche: args.niche,
  });
  const shallowScCalls = routeProbe.scCallCount + rawHashtagScCalls;
  const remainingBudget = Math.max(0, maxScCalls - shallowScCalls);
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
            seedMode: creator.seedMode,
            topicSignalScore: creator.topicSignalScore,
            matchedHashtags: creator.matchedHashtags,
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
            seedMode: creator.seedMode,
            scCalls: tracker.count - before,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    });
    drillScCalls = tracker.count;
  }

  const combinedReels = dedupeDiscoveryReels(routeProbe.viralReels, drilled);
  const totalScCalls = shallowScCalls + drillScCalls;
  const usdPerCredit =
    Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) ||
    DEFAULT_SC_USD_PER_CREDIT;
  const combinedResult: DiscoveryResult = {
    ...routeProbe,
    hashtagFailures: [...hashtagFailures],
    viralReels: combinedReels,
    scCallCount: totalScCalls,
    costEstimateUsd: totalScCalls * usdPerCredit,
  };

  const adaptedBeforeAdmission = adaptDiscoveryResult(combinedResult).map(
    (candidate) => ({
      ...candidate,
      rawProviderPayload: {
        ...candidate.rawProviderPayload,
        source: "instagram_pool_discovery",
        retrievalDepth:
          drilled.some((reel) => reel.shortcode === candidate.sourceId)
            ? "creator_drill"
            : "hashtag",
      },
    })
  );

  const admission = await applyInstagramPoolAdmission({
    niche: routeProbe.routedNiche || args.niche,
    poolNiche: args.niche,
    pillar: args.pillar,
    candidates: adaptedBeforeAdmission,
  });

  console.info("[viralPosts.pool] instagram_retrieval_depth", {
    pillar: args.pillar,
    niche: args.niche,
    routedNiche: routeProbe.routedNiche,
    hashtags: routeProbe.hashtagsUsed,
    hashtagFailures: [...hashtagFailures],
    routeProbeScCalls: routeProbe.scCallCount,
    rawHashtagScCalls,
    shallowScCalls,
    drillScCalls,
    totalScCalls,
    shallowCandidates: routeProbe.viralReels.length,
    rawHashtagPosts,
    metriclessCreatorSeeds: metriclessSeeds.length,
    selectedCreators: selectedCreators.map((creator) => ({
      handle: creator.handle,
      seedMode: creator.seedMode,
      topicSignalScore: creator.topicSignalScore,
      matchedHashtags: creator.matchedHashtags,
    })),
    drilledCreators: drilledCreatorHandles,
    drilledReelsRead,
    drilledViralCandidates: drilled.length,
    semanticHaikuCalls: admission.semanticHaikuCalls,
    semanticRejected: admission.semanticRejected,
    semanticRerouted: admission.semanticRerouted,
    poolAdmissionRejected: admission.poolAdmissionRejected,
    currentPoolAdmitted: admission.adapted.length,
    finalUniqueCandidates: admission.adapted.length,
  });

  return {
    adapted: admission.adapted,
    description,
    routedNiche: routeProbe.routedNiche,
    hashtagsUsed: routeProbe.hashtagsUsed,
    hashtagFailures: [...hashtagFailures],
    routeProbeScCalls: routeProbe.scCallCount,
    rawHashtagScCalls,
    shallowScCalls,
    drillScCalls,
    totalScCalls,
    costEstimateUsd: combinedResult.costEstimateUsd,
    shallowCandidateCount: routeProbe.viralReels.length,
    rawHashtagPosts,
    uniqueShallowCreators: metriclessSeeds.length,
    metriclessCreatorSeeds: metriclessSeeds.length,
    selectedCreators,
    drilledCreatorHandles,
    drilledReelsRead,
    drilledViralCandidates: drilled.length,
    poolAdmissionRejected: admission.poolAdmissionRejected,
    semanticHaikuCalls: admission.semanticHaikuCalls,
    semanticRejected: admission.semanticRejected,
    semanticRerouted: admission.semanticRerouted,
    reroutedCandidates: admission.reroutedCandidates,
    semanticRejectedCandidates: admission.semanticRejectedCandidates,
  };
}
