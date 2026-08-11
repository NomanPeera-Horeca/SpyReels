/**
 * Always-on watermark Background Worker entrypoint.
 *
 * Serial loop: idle sweep (throttled) → claim at most one job → process →
 * repeat. Never claims while a job is still processing.
 *
 * Deploy as a Render Background Worker on Standard (2GB), not a Cron Job
 * and not on the web dyno. See docs/deploy-notes/watermark-worker.md.
 *
 * Run:
 *   pnpm tsx scripts/watermark-worker.ts
 *   pnpm watermark:worker
 */
import "dotenv/config";
import { claimNextPendingWatermarkJob } from "../server/watermark/db";
import { processWatermarkJob } from "../server/watermark/processJob";
import { sweepZombieWatermarkJobs } from "../server/watermark/sweeper";

const IDLE_MS = Number(process.env.WATERMARK_WORKER_IDLE_MS ?? 5000);
const SWEEP_EVERY_IDLE_MS = Number(
  process.env.WATERMARK_WORKER_SWEEP_EVERY_MS ?? 60_000
);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const idleMs = Number.isFinite(IDLE_MS) && IDLE_MS > 0 ? IDLE_MS : 5000;
  const sweepEveryMs =
    Number.isFinite(SWEEP_EVERY_IDLE_MS) && SWEEP_EVERY_IDLE_MS > 0
      ? SWEEP_EVERY_IDLE_MS
      : 60_000;

  console.log(
    `[watermark-worker] starting idleMs=${idleMs} sweepEveryMs=${sweepEveryMs}`
  );

  let lastSweepAt = 0;

  while (true) {
    try {
      const now = Date.now();
      const dueForSweep = now - lastSweepAt >= sweepEveryMs;

      // Claim first so we never sweep while about to encode; when a job is
      // claimed we skip sweep this tick (idle-only sweeper).
      const job = await claimNextPendingWatermarkJob();

      if (job) {
        console.log(
          `[watermark-worker] claimed jobId=${job.id} source=${job.sourceClipUrl.slice(0, 80)}…`
        );
        try {
          await processWatermarkJob(job.id);
        } catch (err) {
          // processWatermarkJob already marks failed; keep the loop alive.
          const message = err instanceof Error ? err.message : String(err);
          console.error(
            `[watermark-worker] job ${job.id} errored:`,
            message
          );
        }
        continue;
      }

      if (dueForSweep) {
        try {
          const swept = await sweepZombieWatermarkJobs();
          lastSweepAt = Date.now();
          if (swept > 0) {
            console.log(`[watermark-worker] swept=${swept}`);
          }
        } catch (err) {
          lastSweepAt = Date.now();
          console.error("[watermark-worker] sweep failed:", err);
        }
      }

      await sleep(idleMs);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        "[watermark-worker] unexpected iteration error (continuing):",
        message
      );
      await sleep(idleMs);
    }
  }
}

main().catch((err) => {
  console.error("[watermark-worker] fatal startup error:", err);
  process.exit(1);
});
