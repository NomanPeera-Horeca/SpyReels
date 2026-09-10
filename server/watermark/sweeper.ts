import {
  listStaleProcessingWatermarkJobs,
  markWatermarkJobFailed,
} from "./db";
import { alertOwnerThrottled } from "../monitoring/alerts";

export const WATERMARK_JOB_STALE_MS = 10 * 60 * 1000;
export const WATERMARK_JOB_ZOMBIE_MESSAGE =
  "Watermark render interrupted, please retry";

/**
 * Mark stale `processing` watermark jobs as failed. updatedAt freezes when the
 * cron/ffmpeg process dies mid-run (OOM / deploy / crash).
 */
export async function sweepZombieWatermarkJobs(): Promise<number> {
  const before = new Date(Date.now() - WATERMARK_JOB_STALE_MS);
  const rows = await listStaleProcessingWatermarkJobs(before);
  for (const r of rows) {
    await markWatermarkJobFailed(r.id, WATERMARK_JOB_ZOMBIE_MESSAGE);
  }
  if (rows.length > 0) {
    console.log(
      `[watermarkSweeper] marked ${rows.length} stale processing row(s) as failed`
    );
    alertOwnerThrottled({
      kind: "sweeper",
      message: `${rows.length} stale watermark job(s) auto-failed (render process likely died)`,
    });
  }
  return rows.length;
}
