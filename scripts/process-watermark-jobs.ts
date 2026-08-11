/**
 * Render Cron entrypoint: sweep stuck watermark jobs, then claim and process
 * exactly one pending row (concurrency capped at 1 per run).
 *
 * Deploy note: configure this as a Render Cron Job on Standard (2GB), not the
 * Starter/512MB tier. See docs/deploy-notes/watermark-cron.md.
 *
 * Run:
 *   pnpm tsx scripts/process-watermark-jobs.ts
 */
import "dotenv/config";
import { claimNextPendingWatermarkJob } from "../server/watermark/db";
import { processWatermarkJob } from "../server/watermark/processJob";
import { sweepZombieWatermarkJobs } from "../server/watermark/sweeper";

async function main(): Promise<void> {
  const swept = await sweepZombieWatermarkJobs();
  console.log(`[watermark-cron] swept=${swept}`);

  const job = await claimNextPendingWatermarkJob();
  if (!job) {
    console.log("[watermark-cron] no pending jobs");
    return;
  }

  console.log(
    `[watermark-cron] claimed jobId=${job.id} source=${job.sourceClipUrl.slice(0, 80)}…`
  );
  try {
    await processWatermarkJob(job.id);
  } catch (err) {
    // processWatermarkJob already marks failed; exit non-zero so Render logs it.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[watermark-cron] job ${job.id} errored:`, message);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("[watermark-cron] fatal:", err);
  process.exit(1);
});
