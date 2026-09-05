import { hostname } from "os";
import type { ViralPostPool } from "../../drizzle/schema";
import { scrapeTikTokVideos } from "../tiktok";
import { scrapeYouTubeShorts } from "../youtube";
import type { AdaptedCandidate } from "./candidateAdapter";
import { VIRAL_POOL_DEFAULTS, VIRAL_SEED_POOL_PILLAR } from "./constants";
import {
  isViralPostsLive,
  isViralPostsPoolRefresherEnabled,
  viralPostsPoolRefreshMs,
} from "./featureFlag";
import { loadFeaturedTransferableCandidates } from "./featuredSupply";
import { discoverInstagramPoolCandidates } from "./instagramPoolDiscovery";
import { classifyCandidatePillars } from "./pillarClassify";
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

function isFeaturedCatalogCandidate(candidate: AdaptedCandidate): boolean {
  return candidate.rawProviderPayload?.source === "featured_catalog";
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
  const bySource = new Map(upserted.map((c) => [c.sourceId, c]));
  const assignPillar =
    pool.pillar === VIRAL_SEED_POOL_PILLAR ? pool.niche : pool.pillar;

  const links = adapted
    .map((a) => {
      const row = bySource.get(a.sourceId);
      if (!row) return null;
      const classification = classifyCandidatePillars({
        caption: a.caption,
        hook: a.hook,
        hashtags: a.hashtags,
        activePillars: [assignPillar],
        fallbackNiche: pool.niche,
      });
      if (classification.confidence < 0.5) {
        classification.primaryPillar = assignPillar;
        if (isFeaturedCatalogCandidate(a)) {
          // Transferable Featured rows belong in this recommendation pool, but
          // they must not masquerade as an exact niche/pillar match.
          const rawConfidence = Number(
            a.rawProviderPayload?.classificationConfidence ?? classification.confidence
          );
          classification.confidence = Number.isFinite(rawConfidence)
            ? Math.max(0.35, Math.min(0.49, rawConfidence))
            : 0.35;
          classification.reason =
            a.relevanceReason || `Transferable Featured format for ${assignPillar}`;
        } else {
          classification.reason = `Assigned to pool ${pool.platform}/${assignPillar}`;
          classification.confidence = 0.55;
        }
      }
      return { candidateId: row.id, classification };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

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
  const result = await discoverInstagramPoolCandidates({
    niche: pool.niche,
    pillar: pool.pillar,
    maxScCalls,
  });
  const providerCandidateCount = await persistAdaptedToPool({
    pool,
    adapted: result.adapted,
    scCalls: result.totalScCalls,
    costEstimateUsd: result.costEstimateUsd,
  });
  const featuredCandidateCount = await hydrateFeaturedSupply(pool);
  console.info("[viralPosts.pool] instagram_supply_mix", {
    poolId: pool.id,
    providerCandidates: providerCandidateCount,
    featuredCandidates: featuredCandidateCount,
    providerCalls: result.totalScCalls,
    shallowCalls: result.shallowScCalls,
    drillCalls: result.drillScCalls,
    hashtags: result.hashtagsUsed,
    shallowCandidates: result.shallowCandidateCount,
    uniqueShallowCreators: result.uniqueShallowCreators,
    selectedCreators: result.selectedCreators.map((creator) => creator.handle),
    drilledCreators: result.drilledCreatorHandles,
    drilledReelsRead: result.drilledReelsRead,
    drilledViralCandidates: result.drilledViralCandidates,
  });
  return {
    scCalls: result.totalScCalls,
    candidateCount: providerCandidateCount + featuredCandidateCount,
    featuredCandidateCount,
    costEstimateUsd: result.costEstimateUsd,
  };
}

async function refreshSeedPlatformPool(
  pool: ViralPostPool,
  platform: "tiktok" | "youtube",
  remainingBudget: number
): Promise<{ scCalls: number; candidateCount: number }> {
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
    await persistAdaptedToPool({ pool, adapted: [], scCalls: 0 });
    return { scCalls: 0, candidateCount: 0 };
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

  const candidateCount = await persistAdaptedToPool({
    pool,
    adapted,
    scCalls,
  });
  return { scCalls, candidateCount };
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
      const result = await refreshSeedPlatformPool(pool, "tiktok", remaining);
      scCalls = result.scCalls;
      candidateCount = result.candidateCount;
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
