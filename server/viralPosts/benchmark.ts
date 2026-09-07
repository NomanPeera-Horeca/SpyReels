import { eq } from "drizzle-orm";
import {
  users,
  type ViralPostCandidate,
  type ViralPostPool,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  DEFAULT_CONTENT_PILLARS,
  VIRAL_POOL_DEFAULTS,
  VIRAL_SEED_POOL_PILLAR,
} from "./constants";
import {
  inferFormatFromCopy,
  type AdaptedCandidate,
} from "./candidateAdapter";
import {
  relevanceScoreForCandidate,
  remakeabilityScoreForCandidate,
} from "./rankingSignals";
import {
  DAILY_PICK_MIN_FINAL_SCORE,
  selectDiverseFeed,
} from "./diversity";
import {
  classifyCandidatePillars,
  diversifyByPillar,
} from "./pillarClassify";
import {
  scoreCandidate,
  TODAY_PICKS_SCORE_WEIGHTS,
  type ScoredCandidateInput,
  type ScoredMetrics,
} from "./scoring";
import {
  canonicalCandidateKey,
  loadViralPersonalizationContext,
  personalizationRelevanceBoost,
  type ViralPersonalizationSignals,
} from "./personalization";
import { resolvePersonalCandidates } from "./personalCandidateBridge";
import {
  isViralPostsInstagramEnabled,
  isViralPostsTiktokEnabled,
  isViralPostsYoutubeEnabled,
} from "./featureFlag";
import * as poolRepo from "./poolRepository";
import * as repo from "./repository";
import {
  VIRAL_DAILY_FEED_MAX,
  VIRAL_DAILY_FEED_MIN,
} from "@shared/viralPosts";

export type ViralBenchmarkSource =
  | "direct_instagram_pool"
  | "direct_tiktok_seed"
  | "direct_youtube_seed"
  | "transferable_featured"
  | "collected"
  | "creator_radar"
  | "similar_creator"
  | "personal_other";

export type ViralBenchmarkRejectReason =
  | "hidden_creator"
  | "recently_dismissed"
  | "recently_shown_90d"
  | "below_quality_floor"
  | "diversity_or_rank";

export type ViralBenchmarkCandidate = {
  candidateId: number;
  platform: string;
  sourceId: string;
  source: ViralBenchmarkSource;
  sourceUrl: string;
  creatorHandle: string | null;
  creatorName: string;
  pillar: string;
  format: string | null;
  hook: string | null;
  caption: string | null;
  views: number | null;
  followers: number | null;
  finalScore: number;
  relevanceScore: number;
  adaptabilityScore: number;
  trendStatus: string;
  selected: boolean;
  rejectReason: ViralBenchmarkRejectReason | null;
};

export type ViralPostsBenchmarkReport = {
  userId: number;
  generatedAt: string;
  benchmarkMode: "stored_supply_only";
  providerCalls: 0;
  mutatesDailyFeed: false;
  marksCandidatesShown: false;
  niche: string;
  pillars: string[];
  poolCount: number;
  sourceCounts: Record<ViralBenchmarkSource, number>;
  platformCounts: Record<string, number>;
  funnel: {
    pooledCandidates: number;
    personalCandidatesOffered: number;
    personalCandidatesAddedAfterCanonicalDedupe: number;
    canonicalUniverse: number;
    hiddenCreators: number;
    recentlyDismissed: number;
    recentlyShown90d: number;
    eligibleBeforeQualityFloor: number;
    aboveQualityFloor: number;
    selectedBeforePillarDiversity: number;
    finalSelected: number;
  };
  personalization: {
    canonicalReused: number;
    canonicalInserted: number;
    collectedRead: number;
    collectedCandidates: number;
    explicitCreatorHandles: number;
    radarSearchesRead: number;
    radarCreatorsRead: number;
    radarCandidates: number;
    similarNicheSlugs: number;
    similarCreatorsRead: number;
    similarCandidates: number;
  };
  selected: ViralBenchmarkCandidate[];
  topRejected: ViralBenchmarkCandidate[];
};

type EvaluatedCandidate = {
  adapted: AdaptedCandidate;
  row: ViralPostCandidate;
  source: ViralBenchmarkSource;
  scoreInput: ScoredCandidateInput;
  scored: ScoredMetrics;
  hidden: boolean;
  dismissed: boolean;
  recentlyShown: boolean;
};

const EMPTY_SOURCE_COUNTS: Record<ViralBenchmarkSource, number> = {
  direct_instagram_pool: 0,
  direct_tiktok_seed: 0,
  direct_youtube_seed: 0,
  transferable_featured: 0,
  collected: 0,
  creator_radar: 0,
  similar_creator: 0,
  personal_other: 0,
};

function normalizeCreatorKey(value: string | null | undefined): string {
  return (value || "unknown").toLowerCase().replace(/^@/, "");
}

function creatorKeyOf(candidate: AdaptedCandidate): string {
  return normalizeCreatorKey(candidate.creatorId || candidate.creatorHandle);
}

function deriveHook(caption: string | null): string | null {
  if (!caption) return null;
  const cleaned = caption.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return (cleaned.split(/[.!?\n]/)[0] || cleaned).trim().slice(0, 160) || null;
}

function rawProviderSource(row: ViralPostCandidate): string | null {
  const raw = row.rawProviderPayload;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const source = (raw as Record<string, unknown>).source;
  return typeof source === "string" ? source : null;
}

function inferNicheForBenchmark(businessDescription: string): string {
  // Mirrors the production Today’s Picks routing in service.ts. Keep benchmark
  // diagnostic-only; it does not become a second product routing system.
  const t = businessDescription.toLowerCase();
  if (/restaurant|cafe|food|kitchen|hospitality|menu|chef/.test(t)) {
    return "Business & Entrepreneurship";
  }
  if (/fitness|gym|workout|health/.test(t)) return "Health & Fitness";
  if (/beauty|skincare|makeup/.test(t)) return "Beauty";
  if (/real estate|realtor|housing/.test(t)) return "Real Estate";
  if (/finance|money|invest/.test(t)) return "Personal Finance";
  return "Business & Entrepreneurship";
}

function inferPillarsForBenchmark(
  businessDescription: string,
  niche: string
): string[] {
  const t = businessDescription.toLowerCase();
  if (/restaurant|cafe|food|kitchen|hospitality|menu|chef/.test(t)) {
    return [...DEFAULT_CONTENT_PILLARS];
  }
  return [niche, `${niche} marketing`, `${niche} operations`].slice(0, 4);
}

async function loadUserBenchmarkProfile(userId: number): Promise<{
  businessDescription: string;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [user] = await db
    .select({ businessDescription: users.businessDescription })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) throw new Error(`User ${userId} not found`);
  const businessDescription = user.businessDescription?.trim() || "";
  return {
    businessDescription:
      businessDescription.length >= 20
        ? businessDescription
        : businessDescription ||
          "Instagram Reels ideas for small business owners who want practical, remakeable content.",
  };
}

async function ensureBenchmarkPools(args: {
  niche: string;
  pillars: string[];
}): Promise<ViralPostPool[]> {
  const specs: Array<{ niche: string; pillar: string; platform?: string }> = [];
  if (isViralPostsInstagramEnabled) {
    for (const pillar of args.pillars.slice(0, 6)) {
      specs.push({ niche: args.niche, pillar, platform: "instagram" });
    }
  }
  if (isViralPostsTiktokEnabled) {
    specs.push({
      niche: args.niche,
      pillar: VIRAL_SEED_POOL_PILLAR,
      platform: "tiktok",
    });
  }
  if (isViralPostsYoutubeEnabled) {
    specs.push({
      niche: args.niche,
      pillar: VIRAL_SEED_POOL_PILLAR,
      platform: "youtube",
    });
  }
  return poolRepo.ensurePools(specs);
}

function candidateRowToAdapted(
  candidate: ViralPostCandidate,
  extras: {
    contentPillar: string;
    pillarConfidence?: number | null;
    relevanceLabel: string;
    relevanceReason: string;
  }
): AdaptedCandidate {
  const pillarConfidence =
    extras.pillarConfidence != null && Number.isFinite(extras.pillarConfidence)
      ? extras.pillarConfidence
      : classifyCandidatePillars({
          caption: candidate.caption,
          hashtags: candidate.hashtags ?? [],
          activePillars: [extras.contentPillar],
          fallbackNiche: extras.contentPillar,
        }).confidence;
  const platform =
    candidate.platform === "tiktok" || candidate.platform === "youtube"
      ? candidate.platform
      : "instagram";
  const hook = deriveHook(candidate.caption);
  const format = inferFormatFromCopy({ caption: candidate.caption, hook });
  return {
    platform,
    sourceId: candidate.sourceId,
    sourceUrl: candidate.sourceUrl,
    creatorId: candidate.creatorId,
    creatorName: candidate.creatorName,
    creatorHandle: candidate.creatorHandle,
    creatorAvatarUrl: candidate.creatorAvatarUrl,
    creatorFollowers: candidate.creatorFollowers,
    thumbnailUrl: candidate.thumbnailUrl,
    videoUrl: candidate.videoUrl,
    caption: candidate.caption,
    transcript: candidate.transcript,
    hashtags: candidate.hashtags ?? [],
    publishedAt: candidate.publishedAt,
    views: candidate.views,
    likes: candidate.likes,
    comments: candidate.comments,
    shares: candidate.shares,
    saves: candidate.saves,
    reachMultiplier:
      candidate.reachMultiplier != null ? Number(candidate.reachMultiplier) : null,
    engagementRate:
      candidate.engagementRate != null ? Number(candidate.engagementRate) : null,
    viewsPerHour:
      candidate.viewsPerHour != null ? Number(candidate.viewsPerHour) : null,
    trendStatus:
      (candidate.trendStatus as AdaptedCandidate["trendStatus"]) || "unknown",
    relevanceHint: relevanceScoreForCandidate({
      candidate: {
        caption: candidate.caption,
        hook,
        hashtags: candidate.hashtags ?? [],
        contentPillar: extras.contentPillar,
      },
      pillarConfidence,
      activePillar: extras.contentPillar,
    }),
    contentPillar: extras.contentPillar,
    pillarConfidence,
    relevanceLabel: extras.relevanceLabel,
    relevanceReason: extras.relevanceReason,
    hook,
    format,
    hashtagKey: (candidate.hashtags ?? [])[0] || null,
    rawProviderPayload: {},
  };
}

function personalPlatformEnabled(candidate: AdaptedCandidate): boolean {
  if (candidate.platform === "tiktok") return isViralPostsTiktokEnabled;
  if (candidate.platform === "youtube") return isViralPostsYoutubeEnabled;
  return isViralPostsInstagramEnabled;
}

function sourceForCandidate(args: {
  adapted: AdaptedCandidate;
  row: ViralPostCandidate;
  pooledKeys: Set<string>;
}): ViralBenchmarkSource {
  const key = canonicalCandidateKey(args.adapted);
  if (args.pooledKeys.has(key)) {
    if (rawProviderSource(args.row) === "featured_catalog") {
      return "transferable_featured";
    }
    if (args.adapted.platform === "tiktok") return "direct_tiktok_seed";
    if (args.adapted.platform === "youtube") return "direct_youtube_seed";
    return "direct_instagram_pool";
  }
  if (args.adapted.relevanceLabel === "From your Collected reels") {
    return "collected";
  }
  if (args.adapted.relevanceLabel === "From Creator Radar") {
    return "creator_radar";
  }
  if (args.adapted.relevanceLabel === "Similar creator") {
    return "similar_creator";
  }
  return "personal_other";
}

function todayScoreInput(
  candidate: AdaptedCandidate,
  personalization?: ViralPersonalizationSignals
): ScoredCandidateInput {
  const storedConfidence = candidate.pillarConfidence;
  const pillarConfidence =
    storedConfidence != null && Number.isFinite(storedConfidence)
      ? storedConfidence
      : classifyCandidatePillars({
          caption: candidate.caption,
          hook: candidate.hook,
          hashtags: candidate.hashtags,
          activePillars: candidate.contentPillar ? [candidate.contentPillar] : undefined,
          fallbackNiche: candidate.contentPillar,
        }).confidence;
  const baseRelevance = relevanceScoreForCandidate({
    candidate,
    pillarConfidence,
    activePillar: candidate.contentPillar,
  });
  const personalBoost = personalization
    ? personalizationRelevanceBoost(candidate, personalization)
    : 0;
  return {
    views: candidate.views,
    likes: candidate.likes,
    comments: candidate.comments,
    shares: candidate.shares,
    saves: candidate.saves,
    creatorFollowers: candidate.creatorFollowers,
    publishedAt: candidate.publishedAt,
    relevanceScore: Math.min(100, baseRelevance + personalBoost),
    adaptabilityScore: remakeabilityScoreForCandidate(candidate),
  };
}

function rejectReasonFor(
  evaluated: EvaluatedCandidate,
  selectedIds: Set<number>
): ViralBenchmarkRejectReason | null {
  if (selectedIds.has(evaluated.row.id)) return null;
  if (evaluated.hidden) return "hidden_creator";
  if (evaluated.dismissed) return "recently_dismissed";
  if (evaluated.recentlyShown) return "recently_shown_90d";
  if (evaluated.scored.finalScore < DAILY_PICK_MIN_FINAL_SCORE) {
    return "below_quality_floor";
  }
  return "diversity_or_rank";
}

function toBenchmarkCandidate(
  evaluated: EvaluatedCandidate,
  selectedIds: Set<number>
): ViralBenchmarkCandidate {
  return {
    candidateId: evaluated.row.id,
    platform: evaluated.adapted.platform,
    sourceId: evaluated.adapted.sourceId,
    source: evaluated.source,
    sourceUrl: evaluated.adapted.sourceUrl,
    creatorHandle: evaluated.adapted.creatorHandle,
    creatorName: evaluated.adapted.creatorName,
    pillar: evaluated.adapted.contentPillar || "unknown",
    format: evaluated.adapted.format,
    hook: evaluated.adapted.hook,
    caption: evaluated.adapted.caption,
    views: evaluated.adapted.views,
    followers: evaluated.adapted.creatorFollowers,
    finalScore: Number(evaluated.scored.finalScore.toFixed(4)),
    relevanceScore: Number(evaluated.scoreInput.relevanceScore.toFixed(2)),
    adaptabilityScore: Number(evaluated.scoreInput.adaptabilityScore.toFixed(2)),
    trendStatus: evaluated.scored.trendStatus,
    selected: selectedIds.has(evaluated.row.id),
    rejectReason: rejectReasonFor(evaluated, selectedIds),
  };
}

/**
 * Stored-supply benchmark for Today’s Picks. It intentionally does not create a
 * daily feed, mark exposure history, mirror media, schedule refreshes, or call a
 * provider. Missing personal public identities may be inserted into the existing
 * canonical Viral candidate store through the same safe bridge used in production.
 */
export async function benchmarkViralTodayPicks(args: {
  userId: number;
  now?: Date;
}): Promise<ViralPostsBenchmarkReport> {
  const now = args.now ?? new Date();
  const profile = await loadUserBenchmarkProfile(args.userId);
  const niche = inferNicheForBenchmark(profile.businessDescription);
  const pillars = inferPillarsForBenchmark(profile.businessDescription, niche);
  const pools = await ensureBenchmarkPools({ niche, pillars });

  const [poolRows, hidden, dismissed, recentlyShown] = await Promise.all([
    poolRepo.loadPoolCandidatesForAssembly({
      poolIds: pools.map((pool) => pool.id),
      limit: VIRAL_POOL_DEFAULTS.assemblyCandidateLimit,
    }),
    repo.getHiddenCreatorKeys(args.userId),
    repo.getRecentlyDismissedCandidateIds(args.userId),
    repo.getRecentlyShownCandidateIds(args.userId),
  ]);

  const adapted: AdaptedCandidate[] = poolRows.map((poolRow) =>
    candidateRowToAdapted(poolRow.candidate, {
      contentPillar: poolRow.primaryPillar,
      pillarConfidence: poolRow.pillarConfidence,
      relevanceLabel: `Matches ${poolRow.primaryPillar}`,
      relevanceReason:
        poolRow.pillarReason ||
        `Selected from shared ${niche} / ${poolRow.primaryPillar} pool`,
    })
  );
  const rows = poolRows.map((poolRow) => poolRow.candidate);
  const pooledKeys = new Set(
    adapted.map((candidate) => canonicalCandidateKey(candidate))
  );
  const keys = new Set(pooledKeys);

  let personalization: ViralPersonalizationSignals | undefined;
  let personalCandidatesOffered = 0;
  let personalCandidatesAdded = 0;
  let canonicalReused = 0;
  let canonicalInserted = 0;
  let counts = {
    collectedRead: 0,
    collectedCandidates: 0,
    explicitCreatorHandles: 0,
    radarSearchesRead: 0,
    radarCreatorsRead: 0,
    radarCandidates: 0,
    similarNicheSlugs: 0,
    similarCreatorsRead: 0,
    similarCandidates: 0,
  };

  try {
    const context = await loadViralPersonalizationContext({
      userId: args.userId,
      niche,
      pillars,
      now,
    });
    personalization = context.signals;
    counts = context.counts;
    const eligible = context.personalCandidates.filter(personalPlatformEnabled);
    personalCandidatesOffered = eligible.length;
    const resolved = await resolvePersonalCandidates(eligible);
    canonicalReused = resolved.reusedCanonical;
    canonicalInserted = resolved.insertedCanonical;

    for (let index = 0; index < resolved.adapted.length; index += 1) {
      const candidate = resolved.adapted[index]!;
      const row = resolved.rows[index];
      if (!row) continue;
      const key = canonicalCandidateKey(candidate);
      if (keys.has(key)) continue;
      keys.add(key);
      adapted.push(candidate);
      rows.push(row);
      personalCandidatesAdded += 1;
    }
  } catch (error) {
    console.warn("[viralPosts.benchmark] personalization_failed_open", {
      userId: args.userId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const byKey = new Map(
    rows.map((row) => [
      canonicalCandidateKey({ platform: row.platform, sourceId: row.sourceId }),
      row,
    ])
  );
  const poolInputs = adapted.map((candidate) =>
    todayScoreInput(candidate, personalization)
  );
  const evaluated: EvaluatedCandidate[] = adapted.flatMap((candidate, index) => {
    const row = byKey.get(canonicalCandidateKey(candidate));
    if (!row) return [];
    const scoreInput = poolInputs[index]!;
    const scored = scoreCandidate(
      scoreInput,
      poolInputs,
      now,
      TODAY_PICKS_SCORE_WEIGHTS
    );
    return [
      {
        adapted: candidate,
        row,
        source: sourceForCandidate({
          adapted: candidate,
          row,
          pooledKeys,
        }),
        scoreInput,
        scored,
        hidden: hidden.has(creatorKeyOf(candidate)),
        dismissed: dismissed.has(row.id),
        recentlyShown: recentlyShown.has(row.id),
      },
    ];
  });

  const diversityRows = evaluated.map((entry) => ({
    candidateId: entry.row.id,
    sourceId: entry.adapted.sourceId,
    creatorKey: creatorKeyOf(entry.adapted),
    caption: entry.adapted.caption || "",
    hook: entry.adapted.hook || "",
    contentPillar: entry.adapted.contentPillar,
    format: entry.adapted.format,
    finalScore: entry.scored.finalScore,
    trendStatus: entry.scored.trendStatus,
    hidden: entry.hidden,
    recentlyDismissed: entry.dismissed,
    recentlyShown: entry.recentlyShown,
    hashtagKey: entry.adapted.hashtagKey,
    platform: entry.adapted.platform,
  }));
  const selectedBeforePillar = selectDiverseFeed(diversityRows, {
    min: VIRAL_DAILY_FEED_MIN,
    max: VIRAL_DAILY_FEED_MAX,
    minFinalScore: DAILY_PICK_MIN_FINAL_SCORE,
  });
  const evaluatedById = new Map(
    evaluated.map((entry) => [entry.row.id, entry])
  );
  let picked = selectedBeforePillar
    .map((selected) => evaluatedById.get(selected.candidateId))
    .filter((entry): entry is EvaluatedCandidate => Boolean(entry));
  picked = diversifyByPillar(
    picked.map((entry) => ({
      ...entry,
      contentPillar: entry.adapted.contentPillar,
      finalScore: entry.scored.finalScore,
    })),
    { max: VIRAL_DAILY_FEED_MAX, minPillars: 2 }
  ) as typeof picked;

  const selectedIds = new Set(picked.map((entry) => entry.row.id));
  const sourceCounts = { ...EMPTY_SOURCE_COUNTS };
  const platformCounts: Record<string, number> = {};
  for (const entry of evaluated) {
    sourceCounts[entry.source] += 1;
    platformCounts[entry.adapted.platform] =
      (platformCounts[entry.adapted.platform] ?? 0) + 1;
  }

  const eligibleBeforeFloor = evaluated.filter(
    (entry) => !entry.hidden && !entry.dismissed && !entry.recentlyShown
  );
  const aboveFloor = eligibleBeforeFloor.filter(
    (entry) => entry.scored.finalScore >= DAILY_PICK_MIN_FINAL_SCORE
  );

  const selected = picked.map((entry) =>
    toBenchmarkCandidate(entry, selectedIds)
  );
  const topRejected = evaluated
    .filter((entry) => !selectedIds.has(entry.row.id))
    .sort((a, b) => b.scored.finalScore - a.scored.finalScore)
    .slice(0, 12)
    .map((entry) => toBenchmarkCandidate(entry, selectedIds));

  return {
    userId: args.userId,
    generatedAt: now.toISOString(),
    benchmarkMode: "stored_supply_only",
    providerCalls: 0,
    mutatesDailyFeed: false,
    marksCandidatesShown: false,
    niche,
    pillars,
    poolCount: pools.length,
    sourceCounts,
    platformCounts,
    funnel: {
      pooledCandidates: poolRows.length,
      personalCandidatesOffered,
      personalCandidatesAddedAfterCanonicalDedupe: personalCandidatesAdded,
      canonicalUniverse: evaluated.length,
      hiddenCreators: evaluated.filter((entry) => entry.hidden).length,
      recentlyDismissed: evaluated.filter((entry) => entry.dismissed).length,
      recentlyShown90d: evaluated.filter((entry) => entry.recentlyShown).length,
      eligibleBeforeQualityFloor: eligibleBeforeFloor.length,
      aboveQualityFloor: aboveFloor.length,
      selectedBeforePillarDiversity: selectedBeforePillar.length,
      finalSelected: selected.length,
    },
    personalization: {
      canonicalReused,
      canonicalInserted,
      ...counts,
    },
    selected,
    topRejected,
  };
}
