/**
 * One-shot Viral Posts pool refresher for production scheduling.
 *
 * This intentionally runs outside the web request path. `refreshStalePools`
 * already owns the hard safety controls: freshness checks, provider budgets,
 * per-pool DB leases, unsupported-platform guards, and provider-call accounting.
 *
 * Intended Render Cron command:
 *   pnpm viral-posts:refresh-pools
 */
import "dotenv/config";
import { refreshStalePools } from "../server/viralPosts/poolRefresh";

const DEFAULT_BATCH_SIZE = 4;
const MAX_BATCH_SIZE = 10;

function resolveBatchSize(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_BATCH_SIZE;
  return Math.min(MAX_BATCH_SIZE, Math.floor(parsed));
}

async function main(): Promise<void> {
  const batchSize = resolveBatchSize(process.env.VIRAL_POSTS_REFRESH_BATCH_SIZE);
  const startedAt = Date.now();
  console.info("[viralPosts.cron] refresh_start", { batchSize });

  const results = await refreshStalePools(batchSize);
  const summary = {
    batchSize,
    attempted: results.length,
    refreshed: results.filter((result) => result.status === "refreshed").length,
    skippedFresh: results.filter((result) => result.status === "skipped_fresh").length,
    skippedBudget: results.filter((result) => result.status === "skipped_budget").length,
    skippedLocked: results.filter((result) => result.status === "skipped_locked").length,
    skippedUnsupported: results.filter(
      (result) => result.status === "skipped_unsupported_platform"
    ).length,
    errors: results.filter((result) => result.status === "error").length,
    scCalls: results.reduce((total, result) => total + result.scCalls, 0),
    costEstimateUsd: results.reduce(
      (total, result) => total + (result.costEstimateUsd ?? 0),
      0
    ),
    durationMs: Date.now() - startedAt,
  };

  console.info("[viralPosts.cron] refresh_done", summary);

  if (summary.errors > 0) {
    const failedPools = results
      .filter((result) => result.status === "error")
      .map((result) => ({
        poolId: result.poolId,
        poolKey: result.poolKey,
        error: result.error ?? "unknown_error",
      }));
    console.error("[viralPosts.cron] refresh_failed", { failedPools });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[viralPosts.cron] fatal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
