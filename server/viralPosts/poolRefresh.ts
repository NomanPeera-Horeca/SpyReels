import { hostname } from "os";
import type { ViralPostPool } from "../../drizzle/schema";
import { scrapeTikTokVideos } from "../tiktok";
import { scrapeYouTubeShorts } from "../youtube";
import type { AdaptedCandidate } from "./candidateAdapter";
import { VIRAL_POOL_DEFAULTS } from "./constants";
import {
  isViralPostsLive,
  isViralPostsPoolRefresherEnabled,
  viralPostsPoolRefreshMs,
} from "./featureFlag";
import { loadFeaturedTransferableCandidates } from "./featuredSupply";
import { discoverInstagramPoolCandidates } from "./instagramPoolDiscovery";
import {
  dedupeAdaptedCandidates,
  dedupeSemanticReroutes,
  discoverInstagramPopularFirstCandidates,
  planInstagramAdaptiveBudgets,
  shouldRunInstagramHashtagFallback,
  shouldUseInstagramPopularDiscovery,
  type InstagramPopularDiscoveryResult,
} from "./instagramPopularDiscovery";
import {
  discoverTikTokPoolCandidates,
  shouldRunTikTokSeedFallback,
  shouldUseTikTokSearchDiscovery,
} from "./tiktokPoolDiscovery";
import { classifyCandidateForPoolAdmission } from "./poolAdmission";
import type { SemanticPoolReroute } from "./semanticPoolRelevance";
import {
  adaptTikTokVideos,
  adaptYouTubeShorts,
} from "./platformAdapters";
import * as poolRepo from "./poolRepository";
import * as repo from "./repository";
import { scheduleThumbnailMirroring } from "./mediaMirror";
import { listActiveSeedCreators } from "./seedRepository";

export type PoolRefreshResult = {
  poolId: number;
  poolKey: string;
  status:
    | "refreshed"
    | "skipped_budget"
    | "skipped_fresh"
    | "skipped_locked"
    | "error";
  scCalls: number;
  candidateCount: number;
  costEstimateUsd?: number;
  error?: string;
};

function workerOwnerId(): string {
  const configured = process.env.VIRAL_POSTS_WORKER_ID?.trim();
  if (configured) return configured.slice(0, 120);
  return `${hostname()}:${process.pid}:${Math.random().toString(36).slice(2, 8)}`;
}

export function groupSemanticReroutes(
  reroutes: SemanticPoolReroute[]
): Map<string, AdaptedCandidate[]> {
  const byPillar = new Map<string, AdaptedCandidate[]>();
  for (const row of reroutes) {
    const existing = byPillar.get(row.targetPillar) ?? [];
    existing.push(row.candidate);
    byPillar.set(row.targetPillar, existing);
  }
  return byPillar;
}

export function buildAdmittedPoolLinks(args: {
  pool: Pick<ViralPostPool, "platform" | "niche" | "pillar">;
  adapted: AdaptedCandidate[];
  candidateIdsBySource: Map<string, number>;
}): Array<{
  candidateId: number;
  classification: ReturnType<
    typeof classifyCandidateForPoolAdmission
  >["classification"];
}> {
  const links: Array<{
    candidateId: number;
    classification: ReturnType<
      typeof classifyCandidateForPoolAdmission
    >["classification"];
  }> = [];

  for (const candidate of args.adapted) {
    const candidateId = args.candidateIdsBySource.get(candidate.sourceId);
    if (candidateId == null) continue;
    const decision = classifyCandidateForPoolAdmission({
      pool: {
        platform: args.pool.platform,
        niche: args.pool.niche,
        pillar: args.pool.pillar,
      },
      candidate,
    });
    if (!decision.admit) {
      console.info("[viralPosts.pool] pool_link_rejected", {
        platform: args.pool.platform,
        pillar: args.pool.pillar,
        sourceId: candidate.sourceId,
        reason: decision.reason,
        confidence: decision.classification.confidence,
      });
      continue;
    }
    links.push({
      candidateId,
      classification: decision.classification,
    });
  }
  return links;
}

/**
 * Canonical persistence/linking shared by live provider supply and the existing
 * zero-provider-call Featured catalog. This does not spend budget or mark a
 * provider refresh complete; callers own those lifecycle decisions.
 */
async function linkAdaptedToPool(args: {
  pool: ViralPostPool;
  adapted: AdaptedCandidate[];
}): Promise<number> {
  const { pool, adapted } = args;
  if (adapted.length === 0) return 0;

  const upserted = await repo.upsertCandidates(adapted);
  const links = buildAdmittedPoolLinks({
    pool,
    adapted,
    candidateIdsBySource: new Map(upserted.map((c) => [c.sourceId, c.id])),
  });

  await poolRepo.linkCandidatesToPool({ poolId: pool.id, links });

  scheduleThumbnailMirroring(
    upserted.map((c) => ({
      sourceId: c.sourceId,
      sourceThumbnailUrl: c.sourceThumbnailUrl ?? c.thumbnailUrl,
    })),
    async (results) => {
      const platformBySource = new Map(
        upserted.map((c) => [c.sourceId, c.platform || "instagram"])
      );
      for (const r of results) {
        try {
          await repo.updateCandidateMedia({
            sourceId: r.sourceId,
            platform: platformBySource.get(r.sourceId),
            thumbnailUrl: r.thumbnailUrl,
            mediaStatus: r.mediaStatus,
          });
        } catch {
          // best-effort
        }
      }
    }
  );

  return links.length;
}

/**
 * Link semantically rerouted candidates into the correct sibling pool on the
 * same platform. The source refresh already spent the provider budget; the
 * sibling receives inventory only and is not marked as independently refreshed.
 */
export async function persistSemanticReroutes(args: {
  sourcePool: ViralPostPool;
  reroutes: SemanticPoolReroute[];
}): Promise<number> {
  if (args.reroutes.length === 0) return 0;
  let linkedTotal = 0;
  for (const [targetPillar, candidates] of groupSemanticReroutes(args.reroutes)) {
    const sibling = await poolRepo.ensurePool({
      niche: args.sourcePool.niche,
      pillar: targetPillar,
      platform: args.sourcePool.platform,
      language: args.sourcePool.language,
      region: args.sourcePool.region,
    });
    const linked = await linkAdaptedToPool({
      pool: sibling,
      adapted: candidates,
    });
    linkedTotal += linked;
    console.info("[viralPosts.pool] instagram_semantic_reroute", {
      sourcePoolId: args.sourcePool.id,
      sourcePillar: args.sourcePool.pillar,
      targetPoolId: sibling.id,
      targetPillar,
      linked,
      providerCalls: 0,
      siblingRefreshMarked: false,
    });
  }
  return linkedTotal;
}

async function persistAdaptedToPool(args: {
  pool: ViralPostPool;
  adapted: AdaptedCandidate[];
  scCalls: number;
  costEstimateUsd?: number;
}): Promise<number> {
  const { pool, adapted, scCalls, costEstimateUsd } = args;
  const linked = await linkAdaptedToPool({ pool, adapted });
  await poolRepo.addBudgetUsage(pool.id, scCalls);
  await poolRepo.markPoolRefreshed({
    poolId: pool.id,
    status: "refreshed",
    scCalls,
    candidateCount: linked,
  });
  void costEstimateUsd;
  return linked;
}

/**
 * Pull strong, production-feasible rows from the existing global Featured
 * catalog into the same canonical Viral candidate/pool store. Zero provider
 * calls and no separate recommendation system.
 */
async function hydrateFeaturedSupply(pool: ViralPostPool): Promise<number> {
  if (pool.platform !== "instagram") return 0;
  try {
    const adapted = await loadFeaturedTransferableCandidates({
      pillar: pool.pillar,
      niche: pool.niche,
      limit: 12,
    });
    const linked = await linkAdaptedToPool({ pool, adapted });
    console.info("[viralPosts.pool] featured_supply", {
      poolId: pool.id,
      poolKey: pool.poolKey,
      candidates: adapted.length,
      linked,
      providerCalls: 0,
    });
    return linked;
  } catch (err) {
    // Catalog enrichment must never take down live/provider refresh.
    console.warn("[viralPosts.pool] featured_supply_failed", {
      poolId: pool.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}

async function refreshInstagramPool(
  pool: ViralPostPool,
  maxScCalls: number
): Promise<{
  scCalls: number;
  candidateCount: number;
  featuredCandidateCount: number;
  costEstimateUsd?: number;
}> {
  let popular: InstagramPopularDiscoveryResult | null = null;
  let popularScCalls = 0;

  if (shouldUseInstagramPopularDiscovery(pool.pillar)) {
    const { popularBudget } = planInstagramAdaptiveBudgets(maxScCalls);
    popular = await discoverInstagramPopularFirstCandidates({
      niche: pool.niche,
      pillar: pool.pillar,
      maxScCalls: popularBudget,
    });
    popularScCalls = popular.totalScCalls;
  }

  const leftover = Math.max(0, maxScCalls - popularScCalls);
  const fallbackTriggered = shouldRunInstagramHashtagFallback({
    admittedCount: popular?.adapted.length ?? 0,
    remainingBudget: leftover,
  });
  // Non-restaurant Instagram pools always use the existing hashtag/drill path.
  const runFallback =
    !shouldUseInstagramPopularDiscovery(pool.pillar) || fallbackTriggered;

  const fallback = runFallback
    ? await discoverInstagramPoolCandidates({
        niche: pool.niche,
        pillar: pool.pillar,
        maxScCalls: leftover,
      })
    : null;

  const adapted = dedupeAdaptedCandidates([
    ...(popular?.adapted ?? []),
    ...(fallback?.adapted ?? []),
  ]);
  const reroutes = dedupeSemanticReroutes([
    ...(popular?.reroutedCandidates ?? []),
    ...(fallback?.reroutedCandidates ?? []),
  ]);
  const scCalls = popularScCalls + (fallback?.totalScCalls ?? 0);
  const costEstimateUsd =
    (popular?.costEstimateUsd ?? 0) + (fallback?.costEstimateUsd ?? 0);

  const providerCandidateCount = await persistAdaptedToPool({
    pool,
    adapted,
    scCalls,
    costEstimateUsd,
  });
  const reroutedCandidateCount = await persistSemanticReroutes({
    sourcePool: pool,
    reroutes,
  });
  const featuredCandidateCount = await hydrateFeaturedSupply(pool);
  console.info("[viralPosts.pool] instagram_supply_mix", {
    poolId: pool.id,
    popularFirst: Boolean(popular),
    popularCalls: popular?.popularCalls ?? 0,
    popularSuccesses: popular?.popularSuccesses ?? 0,
    popularFailures: popular?.popularFailures ?? 0,
    popularAdmitted: popular?.adapted.length ?? 0,
    popularStrict: popular?.strictViral ?? 0,
    popularScCalls,
    fallbackTriggered: runFallback,
    fallbackScCalls: fallback?.totalScCalls ?? 0,
    providerCandidates: providerCandidateCount,
    reroutedCandidates: reroutedCandidateCount,
    featuredCandidates: featuredCandidateCount,
    providerCalls: scCalls,
    shallowCalls: fallback?.shallowScCalls ?? 0,
    drillCalls: fallback?.drillScCalls ?? 0,
    hashtags: fallback?.hashtagsUsed ?? [],
    shallowCandidates: fallback?.shallowCandidateCount ?? 0,
    uniqueShallowCreators: fallback?.uniqueShallowCreators ?? 0,
    selectedCreators: fallback?.selectedCreators.map((creator) => creator.handle) ?? [],
    drilledCreators: fallback?.drilledCreatorHandles ?? [],
    drilledReelsRead: fallback?.drilledReelsRead ?? 0,
    drilledViralCandidates: fallback?.drilledViralCandidates ?? 0,
  });
  return {
    scCalls,
    candidateCount: providerCandidateCount + featuredCandidateCount,
    featuredCandidateCount,
    costEstimateUsd,
  };
}

async function collectSeedPlatformCandidates(
  pool: ViralPostPool,
  platform: "tiktok" | "youtube",
  remainingBudget: number
): Promise<{ adapted: AdaptedCandidate[]; scCalls: number }> {
  const maxHandles = Math.min(
    VIRAL_POOL_DEFAULTS.seedMaxHandlesPerRefresh,
    Math.max(
      1,
      Math.floor(remainingBudget / VIRAL_POOL_DEFAULTS.seedScCallsPerHandle)
    )
  );
  const seeds = await listActiveSeedCreators({
    platform,
    niche: pool.niche,
    limit: maxHandles,
  });
  if (seeds.length === 0) {
    console.info("[viralPosts.pool] seed_supply_empty", {
      poolId: pool.id,
      platform,
      niche: pool.niche,
    });
    return { adapted: [], scCalls: 0 };
  }

  const adapted: AdaptedCandidate[] = [];
  let scCalls = 0;
  const maxVideos = VIRAL_POOL_DEFAULTS.seedMaxVideosPerHandle;

  for (const seed of seeds) {
    if (scCalls + VIRAL_POOL_DEFAULTS.seedScCallsPerHandle > remainingBudget) {
      break;
    }
    try {
      if (platform === "tiktok") {
        const result = await scrapeTikTokVideos(
          seed.handle,
          undefined,
          {
            maxVideos,
            timeoutMs: 90_000,
          }
        );
        scCalls += VIRAL_POOL_DEFAULTS.seedScCallsPerHandle;
        adapted.push(
          ...adaptTikTokVideos(result.videos.slice(0, maxVideos), {
            niche: pool.niche,
            creatorFollowers: result.followerCount,
            creatorAvatarUrl: result.profilePicUrl,
          })
        );
      } else {
        const result = await scrapeYouTubeShorts(
          seed.handle,
          undefined,
          {
            maxVideos,
            timeoutMs: 90_000,
          }
        );
        scCalls += VIRAL_POOL_DEFAULTS.seedScCallsPerHandle;
        adapted.push(
          ...adaptYouTubeShorts(result.videos.slice(0, maxVideos), {
            niche: pool.niche,
            creatorFollowers: result.subscriberCount,
            creatorAvatarUrl: result.profilePicUrl,
          })
        );
      }
    } catch (err) {
      scCalls += 1;
      console.warn("[viralPosts.pool] seed_handle_failed", {
        poolId: pool.id,
        platform,
        handle: seed.handle,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { adapted, scCalls };
}

async function refreshSeedPlatformPool(
  pool: ViralPostPool,
  platform: "tiktok" | "youtube",
  remainingBudget: number
): Promise<{ scCalls: number; candidateCount: number }> {
  const collected = await collectSeedPlatformCandidates(
    pool,
    platform,
    remainingBudget
  );
  const candidateCount = await persistAdaptedToPool({
    pool,
    adapted: collected.adapted,
    scCalls: collected.scCalls,
  });
  return { scCalls: collected.scCalls, candidateCount };
}

async function refreshTikTokPool(
  pool: ViralPostPool,
  remainingBudget: number
): Promise<{ scCalls: number; candidateCount: number; costEstimateUsd?: number }> {
  if (!shouldUseTikTokSearchDiscovery(pool.pillar)) {
    return refreshSeedPlatformPool(pool, "tiktok", remainingBudget);
  }

  const searchBudget = Math.min(
    VIRAL_POOL_DEFAULTS.tiktokPoolMaxSearchCalls,
    remainingBudget
  );
  const search = await discoverTikTokPoolCandidates({
    niche: pool.niche,
    pillar: pool.pillar,
    maxScCalls: searchBudget,
    region: pool.region || undefined,
  });

  const leftover = Math.max(0, remainingBudget - search.totalScCalls);
  const seedFallbackRan = shouldRunTikTokSeedFallback({
    admittedCount: search.adapted.length,
    remainingBudget: leftover,
  });
  const seeds = seedFallbackRan
    ? await collectSeedPlatformCandidates(pool, "tiktok", leftover)
    : { adapted: [] as AdaptedCandidate[], scCalls: 0 };

  const scCalls = search.totalScCalls + seeds.scCalls;
  const providerCandidateCount = await persistAdaptedToPool({
    pool,
    adapted: [...search.adapted, ...seeds.adapted],
    scCalls,
    costEstimateUsd: search.costEstimateUsd,
  });
  const reroutedCandidateCount = await persistSemanticReroutes({
    sourcePool: pool,
    reroutes: search.reroutedCandidates,
  });
  console.info("[viralPosts.pool] tiktok_supply_mix", {
    poolId: pool.id,
    searchCalls: search.totalScCalls,
    seedCalls: seeds.scCalls,
    seedFallbackRan,
    providerCandidates: providerCandidateCount,
    reroutedCandidates: reroutedCandidateCount,
    searchAdmitted: search.adapted.length,
    semanticRejected: search.semanticRejected,
    keywordTopOverlap: search.keywordTopOverlap,
    siblingRefreshMarked: false,
  });
  return {
    scCalls,
    candidateCount: providerCandidateCount,
    costEstimateUsd: search.costEstimateUsd,
  };
}

/**
 * Refresh one shared niche/pillar pool with a hard provider budget.
 * Uses a DB lease so multiple app instances cannot duplicate provider calls.
 */
export async function refreshPoolById(
  poolId: number,
  opts?: { force?: boolean; owner?: string }
): Promise<PoolRefreshResult> {
  const { getDb } = await import("../db");
  const { viralPostPools } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  if (!db) {
    return {
      poolId,
      poolKey: "unknown",
      status: "error",
      scCalls: 0,
      candidateCount: 0,
      error: "db_unavailable",
    };
  }
  const [pool] = await db
    .select()
    .from(viralPostPools)
    .where(eq(viralPostPools.id, poolId))
    .limit(1);
  if (!pool) {
    return {
      poolId,
      poolKey: "unknown",
      status: "error",
      scCalls: 0,
      candidateCount: 0,
      error: "pool_not_found",
    };
  }

  const fresh = await poolRepo.countFreshPoolCandidates(pool.id);
  if (!opts?.force && fresh >= pool.minFreshCandidates) {
    const featuredCandidateCount = await hydrateFeaturedSupply(pool);
    console.info("[viralPosts.pool] lock_skip", {
      poolId: pool.id,
      reason: "fresh_enough",
      fresh,
      featuredCandidateCount,
    });
    return {
      poolId: pool.id,
      poolKey: pool.poolKey,
      status: "skipped_fresh",
      scCalls: 0,
      candidateCount: fresh + featuredCandidateCount,
    };
  }

  const used = await poolRepo.getBudgetUsed(pool.id);
  const remaining = Math.max(0, pool.dailyCallBudget - used);
  const minBudget =
    pool.platform === "tiktok" || pool.platform === "youtube" ? 3 : 5;
  if (remaining < minBudget) {
    const featuredCandidateCount = await hydrateFeaturedSupply(pool);
    console.info("[viralPosts.pool] lock_skip", {
      poolId: pool.id,
      reason: "budget",
      used,
      featuredCandidateCount,
    });
    return {
      poolId: pool.id,
      poolKey: pool.poolKey,
      status: "skipped_budget",
      scCalls: 0,
      candidateCount: fresh + featuredCandidateCount,
    };
  }

  const owner = opts?.owner || workerOwnerId();
  const acquired = await poolRepo.tryAcquirePoolRefreshLock({
    poolId: pool.id,
    owner,
  });
  if (!acquired) {
    console.info("[viralPosts.pool] lock_skip", {
      poolId: pool.id,
      poolKey: pool.poolKey,
      reason: "held_by_other",
      owner,
    });
    return {
      poolId: pool.id,
      poolKey: pool.poolKey,
      status: "skipped_locked",
      scCalls: 0,
      candidateCount: fresh,
      error: "lock_held",
    };
  }

  const maxScCalls = Math.min(
    VIRAL_POOL_DEFAULTS.refreshMaxScCalls,
    remaining
  );

  const started = Date.now();
  try {
    console.info("[viralPosts.pool] refresh_start", {
      poolId: pool.id,
      poolKey: pool.poolKey,
      platform: pool.platform,
      owner,
      maxScCalls,
      freshBefore: fresh,
    });

    let scCalls = 0;
    let candidateCount = 0;
    let costEstimateUsd: number | undefined;

    if (pool.platform === "tiktok") {
      const result = await refreshTikTokPool(pool, remaining);
      scCalls = result.scCalls;
      candidateCount = result.candidateCount;
      costEstimateUsd = result.costEstimateUsd;
    } else if (pool.platform === "youtube") {
      const result = await refreshSeedPlatformPool(pool, "youtube", remaining);
      scCalls = result.scCalls;
      candidateCount = result.candidateCount;
    } else {
      const result = await refreshInstagramPool(pool, maxScCalls);
      scCalls = result.scCalls;
      candidateCount = result.candidateCount;
      costEstimateUsd = result.costEstimateUsd;
    }

    console.info("[viralPosts.pool] refresh_done", {
      poolId: pool.id,
      poolKey: pool.poolKey,
      platform: pool.platform,
      owner,
      scCalls,
      costEstimateUsd,
      candidates: candidateCount,
      acceptedCandidates: candidateCount,
      durationMs: Date.now() - started,
    });

    return {
      poolId: pool.id,
      poolKey: pool.poolKey,
      status: "refreshed",
      scCalls,
      candidateCount,
      costEstimateUsd,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[viralPosts.pool] refresh_error", {
      poolId: pool.id,
      owner,
      error: message,
    });
    await poolRepo.markPoolRefreshed({
      poolId: pool.id,
      status: "error",
      scCalls: 0,
      candidateCount: 0,
    });
    return {
      poolId: pool.id,
      poolKey: pool.poolKey,
      status: "error",
      scCalls: 0,
      candidateCount: 0,
      error: message,
    };
  } finally {
    await poolRepo.releasePoolRefreshLock({ poolId: pool.id, owner });
  }
}

export function schedulePoolRefresh(poolId: number, force = false): void {
  void refreshPoolById(poolId, { force }).catch((err) => {
    console.error("[viralPosts.pool] schedule_refresh_failed", {
      poolId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
}

/**
 * Refresh a small batch of stale/high-priority pools.
 * Intended for dedicated worker or external cron (production),
 * or process-local interval when VIRAL_POSTS_POOL_REFRESHER=true.
 */
export async function refreshStalePools(limit = 3): Promise<PoolRefreshResult[]> {
  const needing = await poolRepo.listPoolsNeedingRefresh(limit);
  const results: PoolRefreshResult[] = [];
  for (const pool of needing) {
    results.push(await refreshPoolById(pool.id));
  }
  console.info("[viralPosts.pool] refresh_batch_done", {
    attempted: results.length,
    refreshed: results.filter((r) => r.status === "refreshed").length,
    skippedLocked: results.filter((r) => r.status === "skipped_locked").length,
    scCalls: results.reduce((n, r) => n + r.scCalls, 0),
    costEstimateUsd: results.reduce((n, r) => n + (r.costEstimateUsd || 0), 0),
  });
  return results;
}

/**
 * Process-local refresher for local development only.
 * Requires VIRAL_POSTS_POOL_REFRESHER=true (explicit opt-in).
 * Production web instances must leave this false and use cron/worker.
 */
export function startViralPostsPoolRefresher(): void {
  if (!isViralPostsLive) {
    console.info("[viralPosts.pool] refresher disabled", { reason: "feature_off" });
    return;
  }
  if (!isViralPostsPoolRefresherEnabled) {
    console.info("[viralPosts.pool] refresher disabled", {
      reason: "VIRAL_POSTS_POOL_REFRESHER not true (use cron/worker in production)",
    });
    return;
  }
  const intervalMs = viralPostsPoolRefreshMs;
  console.info("[viralPosts.pool] refresher_started", {
    mode: "process_local",
    intervalMs,
    note: "DB lease still prevents duplicate refreshes across instances",
  });
  setInterval(() => {
    void refreshStalePools(2).catch((e) =>
      console.error("[viralPosts.pool] refresher_tick_error", {
        error: e instanceof Error ? e.message : String(e),
      })
    );
  }, intervalMs);
  setTimeout(() => {
    void refreshStalePools(1).catch(() => undefined);
  }, 45_000);
}
