import type {
  ViralDailyFeedResponse,
  ViralFeedHistoryResponse,
  ViralMediaStatus,
  ViralPost,
  ViralPostPlatform,
  ViralSearchResponse,
} from "@shared/viralPosts";
import { VIRAL_DAILY_FEED_MAX, VIRAL_DAILY_FEED_MIN, isViralPostsV1Platform } from "@shared/viralPosts";
import { eq } from "drizzle-orm";
import {
  users,
  type ViralPostCandidate,
  type ViralPostDailyFeed,
} from "../../drizzle/schema";
import { getDb, getReelById } from "../db";
import { runDiscoveryPipeline } from "../discovery/pipeline";
import {
  adaptabilityScoreForCandidate,
  adaptDiscoveryResult,
  inferFormatFromCopy,
  type AdaptedCandidate,
} from "./candidateAdapter";
import {
  relevanceScoreForCandidate,
  remakeabilityScoreForCandidate,
} from "./rankingSignals";
import {
  DEFAULT_CONTENT_PILLARS,
  VIRAL_POOL_DEFAULTS,
  VIRAL_SEED_POOL_PILLAR,
} from "./constants";
import { DAILY_PICK_MIN_FINAL_SCORE, selectDiverseFeed } from "./diversity";
import {
  isAnyViralPostsPlatformEnabled,
  isViralPostsInstagramEnabled,
  isViralPostsLive,
  isViralPostsTiktokEnabled,
  isViralPostsYoutubeEnabled,
} from "./featureFlag";
import { getPersonalWorkspaceId } from "../personalWorkspace";
import { isDurableReelVideoUrl } from "../reelVideoR2";
import { ensureViralMirrorReelsForFeed } from "./ensureMirrorReel";
import { resolveThumbnailFallback, scheduleThumbnailMirroring } from "./mediaMirror";
import {
  classifyCandidatePillars,
  diversifyByPillar,
} from "./pillarClassify";
import * as poolRepo from "./poolRepository";
import { schedulePoolRefresh } from "./poolRefresh";
import * as repo from "./repository";
import { scoreCandidate, TODAY_PICKS_SCORE_WEIGHTS } from "./scoring";
import {
  canonicalCandidateKey,
  loadViralPersonalizationContext,
  personalizationRelevanceBoost,
  type ViralPersonalizationSignals,
} from "./personalization";
import { resolvePersonalCandidates } from "./personalCandidateBridge";

const searchCache = new Map<
  string,
  { at: number; items: ViralPost[]; fromCache: boolean }
>();
const SEARCH_CACHE_MS = VIRAL_POOL_DEFAULTS.exploreCacheMs;
const EXPLORE_RESULT_LIMIT = 24;
/** Bump when Explore ranking rules change so stale empty caches cannot stick. */
const EXPLORE_CACHE_VERSION = "v2";

function creatorKeyOf(c: {
  creatorId?: string | null;
  creatorHandle?: string | null;
}): string {
  return (c.creatorId || c.creatorHandle || "unknown")
    .toLowerCase()
    .replace(/^@/, "");
}

function decimalToNumber(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function candidateToViralPost(
  candidate: ViralPostCandidate,
  extras: {
    relevanceLabel: string;
    relevanceReason: string;
    contentPillar?: string | null;
    saved: boolean;
    dismissed?: boolean;
    shownAt?: Date | null;
    hook?: string | null;
    format?: string | null;
    /** Prefer durable video URL from the mirrored reels row when available. */
    mirroredVideoUrl?: string | null;
  }
): ViralPost {
  const ageHours =
    candidate.publishedAt != null
      ? (Date.now() - candidate.publishedAt.getTime()) / (60 * 60 * 1000)
      : null;

  const status =
    (candidate.thumbnailMediaStatus as ViralMediaStatus) || "pending";
  const media =
    status === "mirrored" && candidate.thumbnailUrl
      ? { thumbnailUrl: candidate.thumbnailUrl, mediaStatus: "mirrored" as const }
      : resolveThumbnailFallback({
          mirroredUrl: null,
          sourceThumbnailUrl:
            candidate.sourceThumbnailUrl ?? candidate.thumbnailUrl,
        });

  const platform = (candidate.platform as ViralPostPlatform) || "instagram";
  const isYouTube = platform === "youtube";
  const reelId =
    !isYouTube &&
    candidate.mirroredReelId != null &&
    candidate.mirroredReelId > 0
      ? candidate.mirroredReelId
      : null;

  const mirrored = (extras.mirroredVideoUrl ?? "").trim();
  const candidateVideo = (candidate.videoUrl ?? "").trim();
  const videoUrl = isYouTube
    ? null
    : mirrored && isDurableReelVideoUrl(mirrored)
      ? mirrored
      : candidateVideo || null;

  return {
    id: String(candidate.id),
    sourceId: candidate.sourceId,
    platform,
    creatorId: candidate.creatorId,
    creatorName: candidate.creatorName,
    creatorHandle: candidate.creatorHandle,
    creatorAvatarUrl: candidate.creatorAvatarUrl,
    creatorFollowers: candidate.creatorFollowers,
    sourceUrl: candidate.sourceUrl,
    thumbnailUrl: media.thumbnailUrl,
    videoUrl,
    reelId,
    mediaStatus: media.mediaStatus,
    caption: candidate.caption,
    transcript: candidate.transcript,
    hook: extras.hook ?? deriveHook(candidate.caption),
    hashtags: candidate.hashtags ?? [],
    publishedAt: candidate.publishedAt?.toISOString() ?? null,
    ageHours: ageHours != null && ageHours >= 0 ? ageHours : null,
    views: candidate.views,
    likes: candidate.likes,
    comments: candidate.comments,
    shares: candidate.shares,
    saves: candidate.saves,
    reachMultiplier: decimalToNumber(candidate.reachMultiplier),
    engagementRate: decimalToNumber(candidate.engagementRate),
    viewsPerHour: decimalToNumber(candidate.viewsPerHour),
    trendStatus: (candidate.trendStatus as ViralPost["trendStatus"]) || "unknown",
    contentPillar: extras.contentPillar ?? null,
    relevanceLabel: extras.relevanceLabel,
    relevanceReason: extras.relevanceReason,
    hookMechanism: null,
    format: extras.format ?? null,
    adaptabilityReason: null,
    saved: extras.saved,
    dismissed: extras.dismissed === true,
    remade: false,
    shownAt: extras.shownAt?.toISOString() ?? null,
  };
}

async function resolveMirroredVideoUrls(
  candidates: ViralPostCandidate[]
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const ids = [
    ...new Set(
      candidates
        .map((c) => c.mirroredReelId)
        .filter((id): id is number => id != null && id > 0)
    ),
  ];
  await Promise.all(
    ids.map(async (id) => {
      try {
        const reel = await getReelById(id);
        const url = (reel?.videoUrl ?? "").trim();
        if (url) out.set(id, url);
      } catch {
        // best-effort
      }
    })
  );
  return out;
}

function deriveHook(caption: string | null): string | null {
  if (!caption) return null;
  const cleaned = caption.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return (cleaned.split(/[.!?\n]/)[0] || cleaned).trim().slice(0, 160) || null;
}

async function loadUserProfile(userId: number): Promise<{
  businessDescription: string;
  targetAudience: string | null;
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [user] = await db
    .select({
      businessDescription: users.businessDescription,
      targetAudience: users.targetAudience,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const biz = user?.businessDescription?.trim() || "";
  const audience = user?.targetAudience?.trim() || null;
  if (biz.length >= 20) {
    return { businessDescription: biz, targetAudience: audience };
  }
  const fallback = [
    biz || "Instagram Reels for my niche",
    audience ? `Audience: ${audience}` : "creators and small business owners",
  ]
    .join(". ")
    .slice(0, 1000);
  return {
    businessDescription:
      fallback.length >= 20
        ? fallback
        : "Instagram Reels ideas for small business owners who want practical, remakeable content.",
    targetAudience: audience,
  };
}

function todayPicksScoreInput(
  candidate: AdaptedCandidate,
  personalization?: ViralPersonalizationSignals
) {
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

function scoreAndSelect(
  adapted: AdaptedCandidate[],
  rows: ViralPostCandidate[],
  opts: {
    hidden: Set<string>;
    dismissed: Set<number>;
    recentlyShown: Set<number>;
    personalization?: ViralPersonalizationSignals;
  }
) {
  const bySource = new Map(
    rows.map((r) => [
      canonicalCandidateKey({ platform: r.platform, sourceId: r.sourceId }),
      r,
    ])
  );
  const poolInputs = adapted.map((a) =>
    todayPicksScoreInput(a, opts.personalization)
  );

  const diversityInput = adapted
    .map((a, idx) => {
      const row = bySource.get(canonicalCandidateKey(a));
      if (!row) return null;
      const scored = scoreCandidate(
        poolInputs[idx],
        poolInputs,
        undefined,
        TODAY_PICKS_SCORE_WEIGHTS
      );
      return {
        adapted: a,
        row,
        scored,
        diversity: {
          candidateId: row.id,
          sourceId: a.sourceId,
          creatorKey: creatorKeyOf(a),
          caption: a.caption || "",
          hook: a.hook || "",
          contentPillar: a.contentPillar,
          format: a.format,
          finalScore: scored.finalScore,
          trendStatus: scored.trendStatus,
          hidden: opts.hidden.has(creatorKeyOf(a)),
          recentlyDismissed: opts.dismissed.has(row.id),
          recentlyShown: opts.recentlyShown.has(row.id),
          hashtagKey: a.hashtagKey,
          platform: a.platform,
        },
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  const selected = selectDiverseFeed(
    diversityInput.map((d) => d.diversity),
    {
      min: VIRAL_DAILY_FEED_MIN,
      max: VIRAL_DAILY_FEED_MAX,
      minFinalScore: DAILY_PICK_MIN_FINAL_SCORE,
    }
  );

  const byId = new Map(diversityInput.map((d) => [d.row.id, d]));
  return selected
    .map((s) => byId.get(s.candidateId))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
}

function personalPlatformEnabled(candidate: AdaptedCandidate): boolean {
  if (candidate.platform === "tiktok") return isViralPostsTiktokEnabled;
  if (candidate.platform === "youtube") return isViralPostsYoutubeEnabled;
  return isViralPostsInstagramEnabled;
}

async function loadTodayCandidateUniverse(args: {
  userId: number;
  niche: string;
  pillars: string[];
  poolIds: number[];
}) {
  const poolRows = await poolRepo.loadPoolCandidatesForAssembly({
    poolIds: args.poolIds,
    limit: VIRAL_POOL_DEFAULTS.assemblyCandidateLimit,
  });
  const adapted: AdaptedCandidate[] = poolRows.map((row) =>
    candidateRowToAdapted(row.candidate, {
      contentPillar: row.primaryPillar,
      pillarConfidence: row.pillarConfidence,
      relevanceLabel: `Matches ${row.primaryPillar}`,
      relevanceReason:
        row.pillarReason ||
        `Selected from shared ${args.niche} / ${row.primaryPillar} pool`,
    })
  );
  const rows = poolRows.map((r) => r.candidate);
  const keys = new Set(adapted.map((candidate) => canonicalCandidateKey(candidate)));

  let personalization: ViralPersonalizationSignals | undefined;
  let personalCandidateCount = 0;
  let reusedCanonical = 0;
  let insertedCanonical = 0;
  let personalCounts:
    | Awaited<ReturnType<typeof loadViralPersonalizationContext>>["counts"]
    | undefined;

  try {
    const context = await loadViralPersonalizationContext({
      userId: args.userId,
      niche: args.niche,
      pillars: args.pillars,
    });
    personalization = context.signals;
    personalCounts = context.counts;
    const eligible = context.personalCandidates.filter(personalPlatformEnabled);
    const resolved = await resolvePersonalCandidates(eligible);
    reusedCanonical = resolved.reusedCanonical;
    insertedCanonical = resolved.insertedCanonical;

    for (let index = 0; index < resolved.adapted.length; index++) {
      const candidate = resolved.adapted[index]!;
      const row = resolved.rows[index];
      if (!row) continue;
      const key = canonicalCandidateKey(candidate);
      // When the same public reel is already in a shared pool, keep the richer
      // pool adapter/relevance metadata. Private signals still boost it through
      // `personalization`, so we do not duplicate the candidate in scoring.
      if (keys.has(key)) continue;
      keys.add(key);
      adapted.push(candidate);
      rows.push(row);
      personalCandidateCount += 1;
    }
  } catch (err) {
    // Personalization is additive. A legacy/missing private source must never
    // break the base shared-pool feed.
    console.warn("[viralPosts.personalization] load_failed", {
      userId: args.userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  console.info("[viralPosts.personalization] candidate_universe", {
    userId: args.userId,
    poolCandidates: poolRows.length,
    personalCandidatesAdded: personalCandidateCount,
    candidateUniverse: rows.length,
    reusedCanonical,
    insertedCanonical,
    collectedRead: personalCounts?.collectedRead ?? 0,
    collectedCandidates: personalCounts?.collectedCandidates ?? 0,
    explicitCreatorHandles: personalCounts?.explicitCreatorHandles ?? 0,
    radarSearchesRead: personalCounts?.radarSearchesRead ?? 0,
    radarCreatorsRead: personalCounts?.radarCreatorsRead ?? 0,
    radarCandidates: personalCounts?.radarCandidates ?? 0,
  });

  return {
    poolRows,
    adapted,
    rows,
    personalization,
    personalCandidateCount,
  };
}

export async function getOrCreateDailyFeed(args: {
  userId: number;
  localDate: string;
  timezone: string;
  /** When true, delete any existing feed for this day and assemble fresh. */
  force?: boolean;
}): Promise<ViralDailyFeedResponse> {
  const requestStarted = Date.now();
  if (!isViralPostsLive || !isAnyViralPostsPlatformEnabled) {
    return {
      feedId: 0,
      localDate: args.localDate,
      timezone: args.timezone,
      generatedAt: new Date().toISOString(),
      status: "error",
      fromCache: false,
      generationReason: "disabled",
      items: [],
      errorMessage: !isViralPostsLive
        ? "Viral Posts is not enabled"
        : "Viral Posts is not available right now",
      serverDurationMs: Date.now() - requestStarted,
    };
  }

  if (args.force) {
    await repo.deleteDailyFeedByUserDate(args.userId, args.localDate);
  }

  const existing = args.force
    ? null
    : await repo.getDailyFeedByUserDate(args.userId, args.localDate);
  if (existing) {
    if (existing.status === "assembling") {
      const waited = await waitForFeedReady(
        args.userId,
        args.localDate,
        VIRAL_POOL_DEFAULTS.concurrentAssembleWaitMs
      );
      if (waited) {
        return {
          ...(await loadFeedResponse(waited, args.userId, true)),
          serverDurationMs: Date.now() - requestStarted,
        };
      }
    }
    if (existing.status === "refreshing") {
      const upgraded = await tryUpgradeRefreshingFeed({
        feed: existing,
        userId: args.userId,
        localDate: args.localDate,
        timezone: args.timezone,
        requestStarted,
      });
      if (upgraded) return upgraded;
    }
    return {
      ...(await loadFeedResponse(existing, args.userId, true)),
      serverDurationMs: Date.now() - requestStarted,
    };
  }

  let feed;
  try {
    feed = await repo.createDailyFeed({
      userId: args.userId,
      localDate: args.localDate,
      timezone: args.timezone,
      status: "assembling",
      generationReason: "pool_assembly",
      scCallCount: 0,
      costEstimateUsd: 0,
    });
  } catch (err) {
    if (!repo.isDuplicateKeyError(err)) throw err;
    const waited = await waitForFeedReady(
      args.userId,
      args.localDate,
      VIRAL_POOL_DEFAULTS.concurrentAssembleWaitMs
    );
    if (waited) {
      return {
        ...(await loadFeedResponse(waited, args.userId, true)),
        serverDurationMs: Date.now() - requestStarted,
      };
    }
    const again = await repo.getDailyFeedByUserDate(args.userId, args.localDate);
    if (again) {
      return {
        ...(await loadFeedResponse(again, args.userId, true)),
        serverDurationMs: Date.now() - requestStarted,
      };
    }
    throw err;
  }

  try {
    const profile = await loadUserProfile(args.userId);
    const niche = inferNiche(profile.businessDescription);
    const pillars = inferActivePillars(profile.businessDescription, niche);
    const [pools, hidden, dismissed, recentlyShown] = await Promise.all([
      ensureUserViralPools({ niche, pillars }),
      repo.getHiddenCreatorKeys(args.userId),
      repo.getRecentlyDismissedCandidateIds(args.userId),
      repo.getRecentlyShownCandidateIds(args.userId),
    ]);
    const universe = await loadTodayCandidateUniverse({
      userId: args.userId,
      niche,
      pillars,
      poolIds: pools.map((p) => p.id),
    });

    let picked = scoreAndSelect(universe.adapted, universe.rows, {
      hidden,
      dismissed,
      recentlyShown,
      personalization: universe.personalization,
    });

    const pillarRanked = diversifyByPillar(
      picked.map((p) => ({
        ...p,
        contentPillar: p.adapted.contentPillar,
        finalScore: p.scored.finalScore,
      })),
      { max: VIRAL_DAILY_FEED_MAX, minPillars: 2 }
    );
    picked = pillarRanked as typeof picked;

    const enough = picked.length >= VIRAL_DAILY_FEED_MIN;
    let poolRefreshStarted = false;
    if (!enough) {
      const seedPools = pools.filter((p) => p.platform === "tiktok");
      const igPools = pools.filter((p) => p.platform === "instagram");
      const toRefresh = [...igPools.slice(0, 2), ...seedPools].slice(0, 4);
      if (toRefresh[0]) {
        schedulePoolRefresh(toRefresh[0].id, true);
        poolRefreshStarted = true;
        for (const p of toRefresh.slice(1)) {
          schedulePoolRefresh(p.id, false);
        }
      }
    }

    await repo.insertFeedItems(
      picked.map((p, index) => ({
        feedId: feed.id,
        candidateId: p.row.id,
        rank: index + 1,
        contentPillar: p.adapted.contentPillar,
        relevanceScore: p.scored.finalScore * 100,
        relevanceLabel: p.adapted.relevanceLabel,
        relevanceReason: p.adapted.relevanceReason,
        adaptabilityScore: remakeabilityScoreForCandidate(p.adapted),
        finalScore: p.scored.finalScore,
      }))
    );

    const workspaceId = await getPersonalWorkspaceId(args.userId);
    await ensureViralMirrorReelsForFeed({
      candidates: picked.map((p) => p.row),
      workspaceId,
    });

    const status = !enough
      ? picked.length === 0
        ? "refreshing"
        : "refreshing"
      : "ready";
    const generationReason = enough
      ? "pool_assembly"
      : "cold_start_pool_refresh";

    const [, saved, mirroredVideos] = await Promise.all([
      repo.updateDailyFeedStatus({
        feedId: feed.id,
        status:
          status === "refreshing" && picked.length === 0
            ? "refreshing"
            : status,
        generationReason,
        errorMessage:
          picked.length === 0
            ? "We couldn't find enough strong matches yet. Refreshing your niche pool."
            : null,
        scCallCount: 0,
        costEstimateUsd: 0,
      }),
      repo.getSavedCandidateIds(args.userId),
      resolveMirroredVideoUrls(picked.map((p) => p.row)),
    ]);

    scheduleThumbnailMirroring(
      picked.map((p) => ({
        sourceId: p.row.sourceId,
        sourceThumbnailUrl:
          p.row.sourceThumbnailUrl ?? p.row.thumbnailUrl,
      })),
      async (results) => {
        const platformBySource = new Map(
          picked.map((p) => [p.row.sourceId, p.row.platform || "instagram"])
        );
        for (const result of results) {
          try {
            await repo.updateCandidateMedia({
              sourceId: result.sourceId,
              platform: platformBySource.get(result.sourceId),
              thumbnailUrl: result.thumbnailUrl,
              mediaStatus: result.mediaStatus,
            });
          } catch {
            // best-effort
          }
        }
      }
    );

    const items = picked.map((p) =>
      candidateToViralPost(p.row, {
        relevanceLabel: p.adapted.relevanceLabel,
        relevanceReason: p.adapted.relevanceReason,
        contentPillar: p.adapted.contentPillar,
        saved: saved.has(p.row.id),
        shownAt: new Date(),
        hook: p.adapted.hook,
        format: p.adapted.format,
        mirroredVideoUrl:
          p.row.mirroredReelId != null
            ? mirroredVideos.get(p.row.mirroredReelId) ?? null
            : null,
      })
    );

    const durationMs = Date.now() - requestStarted;
    console.info("[viralPosts] daily_feed_assembled", {
      userId: args.userId,
      feedId: feed.id,
      selected: items.length,
      poolCandidateCount: universe.poolRows.length,
      personalCandidateCount: universe.personalCandidateCount,
      candidateUniverseCount: universe.rows.length,
      providerCalls: 0,
      poolRefreshStarted,
      durationMs,
    });

    return {
      feedId: feed.id,
      localDate: args.localDate,
      timezone: args.timezone,
      generatedAt: new Date().toISOString(),
      status: items.length === 0 ? "refreshing" : enough ? "ready" : "refreshing",
      fromCache: false,
      generationReason,
      items,
      errorMessage:
        items.length === 0
          ? "We couldn't find enough strong matches yet. Refreshing your niche pool."
          : null,
      poolRefreshStarted,
      serverDurationMs: durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[viralPosts] daily_feed_assembly_error", {
      userId: args.userId,
      error: message,
    });
    await repo.updateDailyFeedStatus({
      feedId: feed.id,
      status: "error",
      generationReason: "assembly_error",
      errorMessage: message,
      scCallCount: 0,
    });
    return {
      feedId: feed.id,
      localDate: args.localDate,
      timezone: args.timezone,
      generatedAt: new Date().toISOString(),
      status: "error",
      fromCache: false,
      generationReason: "assembly_error",
      items: [],
      errorMessage: message,
      serverDurationMs: Date.now() - requestStarted,
    };
  }
}

async function loadFeedResponse(
  existing: ViralPostDailyFeed,
  userId: number,
  fromCache: boolean
): Promise<ViralDailyFeedResponse> {
  const [rows, saved, hidden, dismissed] = await Promise.all([
    repo.getFeedItemsWithCandidates(existing.id),
    repo.getSavedCandidateIds(userId),
    repo.getHiddenCreatorKeys(userId),
    repo.getRecentlyDismissedCandidateIds(userId),
  ]);

  const candidates = rows.map((r) => r.candidate);
  const needsMirror = candidates.some(
    (c) =>
      (c.platform || "instagram") !== "youtube" &&
      (c.mirroredReelId == null || c.mirroredReelId <= 0)
  );
  if (needsMirror) {
    try {
      const workspaceId = await getPersonalWorkspaceId(userId);
      await ensureViralMirrorReelsForFeed({ candidates, workspaceId });
    } catch (err) {
      console.error("[viralPosts.mirror] load_ensure_failed", {
        feedId: existing.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const mirroredVideos = await resolveMirroredVideoUrls(candidates);

  return mapDailyFeedToResponse(existing, rows, {
    saved,
    hidden,
    dismissed,
    fromCache,
    userId,
    mirroredVideos,
  });
}

function mapDailyFeedToResponse(
  existing: ViralPostDailyFeed,
  rows: Awaited<ReturnType<typeof repo.getFeedItemsWithCandidates>>,
  opts: {
    saved: Set<number>;
    hidden: Set<string>;
    dismissed: Set<number>;
    fromCache: boolean;
    userId: number;
    mirroredVideos?: Map<number, string>;
  }
): ViralDailyFeedResponse {
  const mirroredVideos = opts.mirroredVideos ?? new Map<number, string>();
  const items = rows
    .filter(({ candidate }) => {
      if (!isViralPostsV1Platform(candidate.platform)) return false;
      if (opts.dismissed.has(candidate.id)) return false;
      const key = creatorKeyOf(candidate);
      if (key !== "unknown" && opts.hidden.has(key)) return false;
      return true;
    })
    .map(({ item, candidate }) =>
      candidateToViralPost(candidate, {
        relevanceLabel: item.relevanceLabel,
        relevanceReason: item.relevanceReason,
        contentPillar: item.contentPillar,
        saved: opts.saved.has(candidate.id),
        dismissed: opts.dismissed.has(candidate.id),
        shownAt: item.shownAt,
        mirroredVideoUrl:
          candidate.mirroredReelId != null
            ? mirroredVideos.get(candidate.mirroredReelId) ?? null
            : null,
      })
    );
  if (opts.fromCache) {
    console.info("[viralPosts] daily_feed_cache_hit", {
      userId: opts.userId,
      localDate: existing.localDate,
      feedId: existing.id,
      itemCount: items.length,
    });
  }
  return {
    feedId: existing.id,
    localDate: existing.localDate,
    timezone: existing.timezone,
    generatedAt: existing.generatedAt.toISOString(),
    status:
      (existing.status as ViralDailyFeedResponse["status"]) || "ready",
    fromCache: opts.fromCache,
    generationReason: existing.generationReason,
    items,
    errorMessage: existing.errorMessage,
  };
}

export async function getFeedHistory(args: {
  userId: number;
  cursor?: string | null;
  excludeLocalDate: string;
  limit?: number;
}): Promise<ViralFeedHistoryResponse> {
  const limit = Math.min(Math.max(args.limit ?? 5, 1), 14);
  const beforeLocalDate =
    args.cursor && args.cursor < args.excludeLocalDate
      ? args.cursor
      : args.excludeLocalDate;

  const rows = await repo.listDailyFeedsBeforeDate({
    userId: args.userId,
    beforeLocalDate,
    limit: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const [saved, hidden, dismissed] = await Promise.all([
    repo.getSavedCandidateIds(args.userId),
    repo.getHiddenCreatorKeys(args.userId),
    repo.getRecentlyDismissedCandidateIds(args.userId),
  ]);

  const feeds: ViralDailyFeedResponse[] = [];
  for (const feed of page) {
    const itemRows = await repo.getFeedItemsWithCandidates(feed.id);
    const candidates = itemRows.map((r) => r.candidate);
    const needsMirror = candidates.some(
      (c) =>
        (c.platform || "instagram") !== "youtube" &&
        (c.mirroredReelId == null || c.mirroredReelId <= 0)
    );
    if (needsMirror) {
      try {
        const workspaceId = await getPersonalWorkspaceId(args.userId);
        await ensureViralMirrorReelsForFeed({ candidates, workspaceId });
      } catch {
        // best-effort; history still returns without reelId
      }
    }
    const mirroredVideos = await resolveMirroredVideoUrls(candidates);
    feeds.push(
      mapDailyFeedToResponse(feed, itemRows, {
        saved,
        hidden,
        dismissed,
        fromCache: true,
        userId: args.userId,
        mirroredVideos,
      })
    );
  }

  const oldest = page.length > 0 ? page[page.length - 1]!.localDate : null;
  return {
    feeds,
    nextCursor: hasMore && oldest ? oldest : null,
    hasMore,
  };
}

async function waitForFeedReady(
  userId: number,
  localDate: string,
  timeoutMs: number
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const row = await repo.getDailyFeedByUserDate(userId, localDate);
    if (row && row.status !== "assembling") return row;
    await new Promise((r) => setTimeout(r, 150));
  }
  return repo.getDailyFeedByUserDate(userId, localDate);
}

async function tryUpgradeRefreshingFeed(args: {
  feed: NonNullable<Awaited<ReturnType<typeof repo.getDailyFeedByUserDate>>>;
  userId: number;
  localDate: string;
  timezone: string;
  requestStarted: number;
}): Promise<ViralDailyFeedResponse | null> {
  const profile = await loadUserProfile(args.userId);
  const niche = inferNiche(profile.businessDescription);
  const pillars = inferActivePillars(profile.businessDescription, niche);
  const pools = await ensureUserViralPools({ niche, pillars });
  const universe = await loadTodayCandidateUniverse({
    userId: args.userId,
    niche,
    pillars,
    poolIds: pools.map((p) => p.id),
  });
  if (universe.rows.length < VIRAL_DAILY_FEED_MIN) {
    if (pools[0]) schedulePoolRefresh(pools[0].id, false);
    return null;
  }

  const hidden = await repo.getHiddenCreatorKeys(args.userId);
  const dismissed = await repo.getRecentlyDismissedCandidateIds(args.userId);
  const recentlyShown = await repo.getRecentlyShownCandidateIds(args.userId);
  let picked = scoreAndSelect(universe.adapted, universe.rows, {
    hidden,
    dismissed,
    recentlyShown,
    personalization: universe.personalization,
  });
  const pillarRanked = diversifyByPillar(
    picked.map((p) => ({
      ...p,
      contentPillar: p.adapted.contentPillar,
      finalScore: p.scored.finalScore,
    })),
    { max: VIRAL_DAILY_FEED_MAX, minPillars: 2 }
  );
  picked = pillarRanked as typeof picked;
  if (picked.length < VIRAL_DAILY_FEED_MIN) return null;

  await repo.replaceFeedItems(
    args.feed.id,
    picked.map((p, index) => ({
      feedId: args.feed.id,
      candidateId: p.row.id,
      rank: index + 1,
      contentPillar: p.adapted.contentPillar,
      relevanceScore: p.scored.finalScore * 100,
      relevanceLabel: p.adapted.relevanceLabel,
      relevanceReason: p.adapted.relevanceReason,
      adaptabilityScore: remakeabilityScoreForCandidate(p.adapted),
      finalScore: p.scored.finalScore,
    }))
  );

  try {
    const workspaceId = await getPersonalWorkspaceId(args.userId);
    await ensureViralMirrorReelsForFeed({
      candidates: picked.map((p) => p.row),
      workspaceId,
    });
  } catch (err) {
    console.error("[viralPosts.mirror] upgrade_ensure_failed", {
      feedId: args.feed.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await repo.updateDailyFeedStatus({
    feedId: args.feed.id,
    status: "ready",
    generationReason: "pool_assembly_upgrade",
    errorMessage: null,
    scCallCount: 0,
    costEstimateUsd: 0,
  });

  const durationMs = Date.now() - args.requestStarted;
  console.info("[viralPosts] daily_feed_upgraded_from_pool", {
    userId: args.userId,
    feedId: args.feed.id,
    selected: picked.length,
    poolCandidateCount: universe.poolRows.length,
    personalCandidateCount: universe.personalCandidateCount,
    candidateUniverseCount: universe.rows.length,
    providerCalls: 0,
    durationMs,
  });

  const refreshed = await repo.getDailyFeedByUserDate(
    args.userId,
    args.localDate
  );
  if (!refreshed) return null;
  return {
    ...(await loadFeedResponse(refreshed, args.userId, false)),
    poolRefreshStarted: false,
    serverDurationMs: durationMs,
  };
}

function inferNiche(businessDescription: string): string {
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

function inferActivePillars(
  businessDescription: string,
  niche: string
): string[] {
  const t = businessDescription.toLowerCase();
  if (/restaurant|cafe|food|kitchen|hospitality|menu|chef/.test(t)) {
    return [...DEFAULT_CONTENT_PILLARS];
  }
  return [niche, `${niche} marketing`, `${niche} operations`].slice(0, 4);
}

async function ensureUserViralPools(args: {
  niche: string;
  pillars: string[];
}) {
  const specs: Array<{
    niche: string;
    pillar: string;
    platform?: string;
  }> = [];
  if (isViralPostsInstagramEnabled) {
    for (const pillar of args.pillars.slice(0, 6)) {
      specs.push({ niche: args.niche, pillar, platform: "instagram" });
    }
  }
  if (isViralPostsTiktokEnabled) {
    for (const pillar of args.pillars.slice(0, 6)) {
      specs.push({ niche: args.niche, pillar, platform: "tiktok" });
    }
    specs.push({
      niche: args.niche,
      pillar: VIRAL_SEED_POOL_PILLAR,
      platform: "tiktok",
    });
  }
  // Viral Posts V1: no YouTube pool ensure (historical rows may remain).
  if (specs.length === 0 && isViralPostsInstagramEnabled) {
    specs.push({
      niche: args.niche,
      pillar: args.pillars[0] || args.niche,
      platform: "instagram",
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
      candidate.reachMultiplier != null
        ? Number(candidate.reachMultiplier)
        : null,
    engagementRate:
      candidate.engagementRate != null
        ? Number(candidate.engagementRate)
        : null,
    viewsPerHour:
      candidate.viewsPerHour != null ? Number(candidate.viewsPerHour) : null,
    trendStatus: (candidate.trendStatus as AdaptedCandidate["trendStatus"]) || "unknown",
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

export async function searchViralPosts(args: {
  userId: number;
  query: string;
}): Promise<ViralSearchResponse> {
  const requestStarted = Date.now();
  if (!isViralPostsLive || !isViralPostsInstagramEnabled) {
    return {
      items: [],
      query: args.query,
      fromCache: false,
      scCallCount: 0,
      serverDurationMs: Date.now() - requestStarted,
    };
  }

  const q = args.query.trim();
  if (q.length < 3) {
    return {
      items: [],
      query: q,
      fromCache: false,
      scCallCount: 0,
      serverDurationMs: Date.now() - requestStarted,
    };
  }

  const cacheKey = normalizeSearchCacheKey(args.userId, q);
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_CACHE_MS) {
    const saved = await repo.getSavedCandidateIds(args.userId);
    const durationMs = Date.now() - requestStarted;
    console.info("[viralPosts] search_cache_hit", {
      userId: args.userId,
      queryLen: q.length,
      results: cached.items.length,
      scCalls: 0,
      durationMs,
    });
    return {
      query: q,
      fromCache: true,
      scCallCount: 0,
      costEstimateUsd: 0,
      serverDurationMs: durationMs,
      items: cached.items.map((i) => ({
        ...i,
        saved: saved.has(Number(i.id)),
      })),
    };
  }

  const description =
    q.length >= 20
      ? q.slice(0, 1000)
      : `Find Instagram Reels about ${q} for creators in this niche who want remakeable content ideas.`;

  try {
    const result = await runDiscoveryPipeline(description, undefined, {
      skipMediaMirroring: true,
      maxScCalls: VIRAL_POOL_DEFAULTS.exploreMaxScCalls,
      skipProfileDrilling: true,
      skipRelevanceFilter: true,
      earlyStopCandidateCount: 30,
    });
    const adapted = adaptDiscoveryResult(result);
    const upserted = await repo.upsertCandidates(adapted);
    const hidden = await repo.getHiddenCreatorKeys(args.userId);
    const dismissed = await repo.getRecentlyDismissedCandidateIds(args.userId);
    const bySource = new Map(upserted.map((r) => [r.sourceId, r]));
    const poolInputs = adapted.map((a) => ({
      views: a.views,
      likes: a.likes,
      comments: a.comments,
      shares: a.shares,
      saves: a.saves,
      creatorFollowers: a.creatorFollowers,
      publishedAt: a.publishedAt,
      relevanceScore: a.relevanceHint,
      adaptabilityScore: adaptabilityScoreForCandidate(a),
    }));

    const ranked = adapted
      .map((a, idx) => {
        const row = bySource.get(a.sourceId);
        if (!row) return null;
        if (dismissed.has(row.id)) return null;
        const key = creatorKeyOf(a);
        if (key !== "unknown" && hidden.has(key)) return null;
        const scored = scoreCandidate(poolInputs[idx], poolInputs);
        return { adapted: a, row, scored };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x))
      .sort((a, b) => {
        if (b.scored.finalScore !== a.scored.finalScore) {
          return b.scored.finalScore - a.scored.finalScore;
        }
        return (b.adapted.views ?? 0) - (a.adapted.views ?? 0);
      })
      .slice(0, EXPLORE_RESULT_LIMIT);

    const saved = await repo.getSavedCandidateIds(args.userId);
    const items = ranked.map((p) =>
      candidateToViralPost(p.row, {
        relevanceLabel: p.adapted.relevanceLabel,
        relevanceReason: p.adapted.relevanceReason,
        contentPillar: p.adapted.contentPillar,
        saved: saved.has(p.row.id),
        hook: p.adapted.hook,
        format: p.adapted.format,
      })
    );

    if (items.length > 0) {
      searchCache.set(cacheKey, { at: Date.now(), items, fromCache: false });
    }
    const durationMs = Date.now() - requestStarted;
    console.info("[viralPosts] search_done", {
      userId: args.userId,
      queryLen: q.length,
      results: items.length,
      adapted: adapted.length,
      pipelineViral: result.viralReels?.length ?? 0,
      scCalls: result.scCallCount,
      fromCache: false,
      costEstimateUsd: result.costEstimateUsd,
      durationMs,
      empty: items.length === 0,
    });

    return {
      items,
      query: q,
      fromCache: false,
      scCallCount: result.scCallCount || 0,
      costEstimateUsd: result.costEstimateUsd,
      serverDurationMs: durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[viralPosts] search_error", {
      userId: args.userId,
      queryLen: q.length,
      error: message,
      durationMs: Date.now() - requestStarted,
    });
    throw err;
  }
}

export function normalizeSearchCacheKey(userId: number, query: string): string {
  const normalized = query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${EXPLORE_CACHE_VERSION}:${userId}:${normalized}`;
}

export async function getSavedViralPosts(userId: number): Promise<ViralPost[]> {
  const rows = await repo.getSavedCandidates(userId);
  return rows
    .filter(({ candidate }) => isViralPostsV1Platform(candidate.platform))
    .map(({ candidate }) =>
      candidateToViralPost(candidate, {
        relevanceLabel: "Saved",
        relevanceReason: "You saved this post for later.",
        saved: true,
      })
    );
}
