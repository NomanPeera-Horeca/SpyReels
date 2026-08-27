import type {
  ViralDailyFeedResponse,
  ViralMediaStatus,
  ViralPost,
  ViralPostPlatform,
  ViralSearchResponse,
} from "@shared/viralPosts";
import { VIRAL_DAILY_FEED_MAX, VIRAL_DAILY_FEED_MIN } from "@shared/viralPosts";
import { eq } from "drizzle-orm";
import { users, type ViralPostCandidate } from "../../drizzle/schema";
import { getDb } from "../db";
import { runDiscoveryPipeline } from "../discovery/pipeline";
import {
  adaptabilityScoreForCandidate,
  adaptDiscoveryResult,
  type AdaptedCandidate,
} from "./candidateAdapter";
import {
  DEFAULT_CONTENT_PILLARS,
  VIRAL_POOL_DEFAULTS,
  VIRAL_SEED_POOL_PILLAR,
} from "./constants";
import { selectDiverseFeed } from "./diversity";
import {
  isAnyViralPostsPlatformEnabled,
  isViralPostsInstagramEnabled,
  isViralPostsLive,
  isViralPostsTiktokEnabled,
  isViralPostsYoutubeEnabled,
} from "./featureFlag";
import { resolveThumbnailFallback, scheduleThumbnailMirroring } from "./mediaMirror";
import {
  classifyCandidatePillars,
  diversifyByPillar,
} from "./pillarClassify";
import * as poolRepo from "./poolRepository";
import { schedulePoolRefresh } from "./poolRefresh";
import * as repo from "./repository";
import { scoreCandidate } from "./scoring";

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

  return {
    id: String(candidate.id),
    sourceId: candidate.sourceId,
    platform: (candidate.platform as ViralPostPlatform) || "instagram",
    creatorId: candidate.creatorId,
    creatorName: candidate.creatorName,
    creatorHandle: candidate.creatorHandle,
    creatorAvatarUrl: candidate.creatorAvatarUrl,
    creatorFollowers: candidate.creatorFollowers,
    sourceUrl: candidate.sourceUrl,
    thumbnailUrl: media.thumbnailUrl,
    videoUrl: candidate.videoUrl,
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

function scoreAndSelect(
  adapted: AdaptedCandidate[],
  rows: ViralPostCandidate[],
  opts: {
    hidden: Set<string>;
    dismissed: Set<number>;
    recentlyShown: Set<number>;
  }
) {
  const bySource = new Map(rows.map((r) => [r.sourceId, r]));
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

  const diversityInput = adapted
    .map((a, idx) => {
      const row = bySource.get(a.sourceId);
      if (!row) return null;
      const scored = scoreCandidate(poolInputs[idx], poolInputs);
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

  // Persist scored trend onto in-memory view (DB already has adapter trend)
  const selected = selectDiverseFeed(
    diversityInput.map((d) => d.diversity),
    { min: VIRAL_DAILY_FEED_MIN, max: VIRAL_DAILY_FEED_MAX }
  );

  const byId = new Map(diversityInput.map((d) => [d.row.id, d]));
  return selected
    .map((s) => byId.get(s.candidateId))
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
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

  // Concurrency lock: unique (userId, localDate). Loser waits for winner.
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
    const poolIds = pools.map((p) => p.id);

    const poolRows = await poolRepo.loadPoolCandidatesForAssembly({
      poolIds,
      limit: VIRAL_POOL_DEFAULTS.assemblyCandidateLimit,
    });

    const adaptedLike: AdaptedCandidate[] = poolRows.map((row) =>
      candidateRowToAdapted(row.candidate, {
        contentPillar: row.primaryPillar,
        relevanceLabel: `Matches ${row.primaryPillar}`,
        relevanceReason:
          row.pillarReason ||
          `Selected from shared ${niche} / ${row.primaryPillar} pool`,
      })
    );
    const upserted = poolRows.map((r) => r.candidate);

    let picked = scoreAndSelect(adaptedLike, upserted, {
      hidden,
      dismissed,
      recentlyShown,
    });

    // Re-apply pillar preference after diversity
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
      const seedPools = pools.filter(
        (p) => p.platform === "tiktok" || p.platform === "youtube"
      );
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
        adaptabilityScore: adaptabilityScoreForCandidate(p.adapted),
        finalScore: p.scored.finalScore,
      }))
    );

    const status = !enough
      ? picked.length === 0
        ? "refreshing"
        : "refreshing"
      : "ready";
    const generationReason = enough
      ? "pool_assembly"
      : "cold_start_pool_refresh";

    const [, saved] = await Promise.all([
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
      })
    );

    const durationMs = Date.now() - requestStarted;
    console.info("[viralPosts] daily_feed_assembled", {
      userId: args.userId,
      feedId: feed.id,
      selected: items.length,
      poolCandidateCount: poolRows.length,
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
  existing: NonNullable<Awaited<ReturnType<typeof repo.getDailyFeedByUserDate>>>,
  userId: number,
  fromCache: boolean
): Promise<ViralDailyFeedResponse> {
  const [rows, saved, hidden, dismissed] = await Promise.all([
    repo.getFeedItemsWithCandidates(existing.id),
    repo.getSavedCandidateIds(userId),
    repo.getHiddenCreatorKeys(userId),
    repo.getRecentlyDismissedCandidateIds(userId),
  ]);
  const items = rows
    .filter(({ candidate }) => {
      if (dismissed.has(candidate.id)) return false;
      const key = creatorKeyOf(candidate);
      if (key !== "unknown" && hidden.has(key)) return false;
      return true;
    })
    .map(({ item, candidate }) =>
      candidateToViralPost(candidate, {
        relevanceLabel: item.relevanceLabel,
        relevanceReason: item.relevanceReason,
        contentPillar: item.contentPillar,
        saved: saved.has(candidate.id),
        dismissed: dismissed.has(candidate.id),
        shownAt: item.shownAt,
      })
    );
  if (fromCache) {
    console.info("[viralPosts] daily_feed_cache_hit", {
      userId,
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
    fromCache,
    generationReason: existing.generationReason,
    items,
    errorMessage: existing.errorMessage,
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

/**
 * When a cold-start feed is still refreshing, reassemble from pools if they
 * now have enough candidates. Zero provider calls.
 */
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
  const poolRows = await poolRepo.loadPoolCandidatesForAssembly({
    poolIds: pools.map((p) => p.id),
    limit: VIRAL_POOL_DEFAULTS.assemblyCandidateLimit,
  });
  if (poolRows.length < VIRAL_DAILY_FEED_MIN) {
    if (pools[0]) schedulePoolRefresh(pools[0].id, false);
    return null;
  }

  const hidden = await repo.getHiddenCreatorKeys(args.userId);
  const dismissed = await repo.getRecentlyDismissedCandidateIds(args.userId);
  const recentlyShown = await repo.getRecentlyShownCandidateIds(args.userId);
  const adaptedLike = poolRows.map((row) =>
    candidateRowToAdapted(row.candidate, {
      contentPillar: row.primaryPillar,
      relevanceLabel: `Matches ${row.primaryPillar}`,
      relevanceReason:
        row.pillarReason ||
        `Selected from shared ${niche} / ${row.primaryPillar} pool`,
    })
  );
  let picked = scoreAndSelect(
    adaptedLike,
    poolRows.map((r) => r.candidate),
    { hidden, dismissed, recentlyShown }
  );
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
      adaptabilityScore: adaptabilityScoreForCandidate(p.adapted),
      finalScore: p.scored.finalScore,
    }))
  );
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
    poolCandidateCount: poolRows.length,
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
    relevanceLabel: string;
    relevanceReason: string;
  }
): AdaptedCandidate {
  const classification = classifyCandidatePillars({
    caption: candidate.caption,
    hashtags: candidate.hashtags ?? [],
    activePillars: [extras.contentPillar],
    fallbackNiche: extras.contentPillar,
  });
  const platform =
    candidate.platform === "tiktok" || candidate.platform === "youtube"
      ? candidate.platform
      : "instagram";
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
    relevanceHint: 70,
    contentPillar: classification.primaryPillar || extras.contentPillar,
    relevanceLabel: extras.relevanceLabel,
    relevanceReason: extras.relevanceReason,
    hook: deriveHook(candidate.caption),
    format: null,
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

    // Never cache empty Explore results; they poison retries after fixes/deploys.
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

/** Exported for tests: normalize Explore cache keys. */
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
  return rows.map(({ candidate }) =>
    candidateToViralPost(candidate, {
      relevanceLabel: "Saved",
      relevanceReason: "You saved this post for later.",
      saved: true,
    })
  );
}
