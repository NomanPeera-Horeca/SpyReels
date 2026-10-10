/**
 * One-shot featured demo catalog refresher for production scheduling.
 *
 * Scrapes allow-listed TikTok + YouTube demo handles (≤8 items each),
 * mirrors web-optimized thumbs to R2, and upserts `featured_demo_*`.
 * On failure, last-good rows are kept. Never runs on a visitor request.
 *
 * Intended Render Cron command (same model as viral-posts pool refresh):
 *   pnpm featured-demo:refresh
 *
 * Schedule: daily. Telegram alerts on per-handle failure and 3-day stale.
 */
import "dotenv/config";
import {
  createDefaultFeaturedDemoRefreshDeps,
  refreshFeaturedDemoCatalog,
} from "../server/featuredDemo/refresh";

async function main(): Promise<void> {
  const startedAt = Date.now();
  console.info("[featuredDemo.cron] refresh_start");

  const deps = await createDefaultFeaturedDemoRefreshDeps();
  const summary = await refreshFeaturedDemoCatalog(deps);

  console.info("[featuredDemo.cron] refresh_done", {
    ...summary,
    wallMs: Date.now() - startedAt,
  });

  if (summary.errors > 0 || summary.staleAlerts > 0) {
    console.error("[featuredDemo.cron] refresh_degraded", {
      errors: summary.errors,
      staleAlerts: summary.staleAlerts,
      failed: summary.results.filter(
        (r) =>
          r.status === "error" ||
          r.status === "kept_last_good" ||
          r.status === "skipped_empty"
      ),
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[featuredDemo.cron] fatal", {
    error: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
