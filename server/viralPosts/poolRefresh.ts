import { hostname } from "os";
import { runDiscoveryPipeline } from "../discovery/pipeline";
import { adaptDiscoveryResult } from "./candidateAdapter";
import { VIRAL_POOL_DEFAULTS } from "./constants";
import {
  isViralPostsLive,
  isViralPostsPoolRefresherEnabled,
  viralPostsPoolRefreshMs,
} from "./featureFlag";
import { classifyCandidatePillars } from "./pillarClassify";
import * as poolRepo from "./poolRepository";
import * as repo from "./repository";
import { scheduleThumbnailMirroring } from "./mediaMirror";

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
    console.info("[viralPosts.pool] lock_skip", {
      poolId: pool.id,
      reason: "fresh_enough",
      fresh,
    });
    return {
      poolId: pool.id,
      poolKey: pool.poolKey,
      status: "skipped_fresh",
      scCalls: 0,
      candidateCount: fresh,
    };
  }

  const used = await poolRepo.getBudgetUsed(pool.id);
  const remaining = Math.max(0, pool.dailyCallBudget - used);
  if (remaining < 5) {
    console.info("[viralPosts.pool] lock_skip", {
      poolId: pool.id,
      reason: "budget",
      used,
    });
    return {
      poolId: pool.id,
      poolKey: pool.poolKey,
      status: "skipped_budget",
      scCalls: 0,
      candidateCount: fresh,
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
      owner,
      maxScCalls,
      freshBefore: fresh,
    });

    const description = `Find Instagram Reels about ${pool.pillar} for creators in the ${pool.niche} niche. Prefer practical, remakeable talking-head and educational formats.`;
    const result = await runDiscoveryPipeline(description, undefined, {
      skipMediaMirroring: true,
      maxScCalls,
      skipProfileDrilling: VIRAL_POOL_DEFAULTS.refreshSkipProfileDrilling,
      skipRelevanceFilter: VIRAL_POOL_DEFAULTS.refreshSkipProfileDrilling,
      earlyStopCandidateCount: VIRAL_POOL_DEFAULTS.refreshEarlyStopCandidates,
    });

    const adapted = adaptDiscoveryResult(result);
    const upserted = await repo.upsertCandidates(adapted);
    const bySource = new Map(upserted.map((c) => [c.sourceId, c]));

    const links = adapted
      .map((a) => {
        const row = bySource.get(a.sourceId);
        if (!row) return null;
        const classification = classifyCandidatePillars({
          caption: a.caption,
          hook: a.hook,
          hashtags: a.hashtags,
          activePillars: [pool.pillar],
          fallbackNiche: pool.niche,
        });
        if (classification.confidence < 0.5) {
          classification.primaryPillar = pool.pillar;
          classification.reason = `Assigned to pool pillar ${pool.pillar}`;
          classification.confidence = 0.55;
        }
        return { candidateId: row.id, classification };
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));

    await poolRepo.linkCandidatesToPool({ poolId: pool.id, links });
    await poolRepo.addBudgetUsage(pool.id, result.scCallCount || 0);
    await poolRepo.markPoolRefreshed({
      poolId: pool.id,
      status: "refreshed",
      scCalls: result.scCallCount || 0,
      candidateCount: links.length,
    });

    scheduleThumbnailMirroring(
      upserted.map((c) => ({
        sourceId: c.sourceId,
        sourceThumbnailUrl: c.sourceThumbnailUrl ?? c.thumbnailUrl,
      })),
      async (results) => {
        for (const r of results) {
          try {
            await repo.updateCandidateMedia({
              sourceId: r.sourceId,
              thumbnailUrl: r.thumbnailUrl,
              mediaStatus: r.mediaStatus,
            });
          } catch {
            // best-effort
          }
        }
      }
    );

    console.info("[viralPosts.pool] refresh_done", {
      poolId: pool.id,
      poolKey: pool.poolKey,
      owner,
      scCalls: result.scCallCount,
      costEstimateUsd: result.costEstimateUsd,
      candidates: links.length,
      acceptedCandidates: links.length,
      durationMs: Date.now() - started,
    });

    return {
      poolId: pool.id,
      poolKey: pool.poolKey,
      status: "refreshed",
      scCalls: result.scCallCount || 0,
      candidateCount: links.length,
      costEstimateUsd: result.costEstimateUsd,
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
