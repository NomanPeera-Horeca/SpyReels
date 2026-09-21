import { and, eq, lt, or, sql } from "drizzle-orm";
import {
  scrapeJobs,
  tiktokScrapeJobs,
  tiktokVideos,
  youtubeScrapeJobs,
  youtubeVideos,
} from "../drizzle/schema";
import {
  capturePostHogEvent,
  posthogDistinctIdForUser,
} from "./analytics/posthogServer";
import { countReelsForJob, getDb } from "./db";
import { alertOwnerThrottled } from "./monitoring/alerts";

export const SCRAPE_JOB_RUNNING_STALE_MS = 10 * 60 * 1000;
export const SCRAPE_JOB_PENDING_STALE_MS = 30 * 60 * 1000;
/** Backwards-compatible alias used by request-time stale checks. */
export const SCRAPE_JOB_STALE_MS = SCRAPE_JOB_RUNNING_STALE_MS;
export const SCRAPE_JOB_ZOMBIE_MESSAGE =
  "Research was interrupted. Please retry.";
export const SCRAPE_REFRESH_RECOVERED_MESSAGE =
  "Refresh was interrupted. Your previous reels are safe — retry when ready.";

export type StaleScrapeRecovery = {
  status: "completed" | "failed";
  currentStep: "complete" | "failed";
  progressPercent: number;
  errorMessage: string;
  failureReason: "unknown";
};

export type StalePlatformScrapeRecovery = Omit<
  StaleScrapeRecovery,
  "failureReason"
>;

export function stalePlatformScrapeRecoveryForItemCount(
  existingItemCount: number
): StalePlatformScrapeRecovery {
  if (existingItemCount > 0) {
    return {
      status: "completed",
      currentStep: "complete",
      progressPercent: 100,
      errorMessage: SCRAPE_REFRESH_RECOVERED_MESSAGE,
    };
  }
  return {
    status: "failed",
    currentStep: "failed",
    progressPercent: 0,
    errorMessage: SCRAPE_JOB_ZOMBIE_MESSAGE,
  };
}

export function staleScrapeRecoveryForReelCount(
  existingReelCount: number
): StaleScrapeRecovery {
  return {
    ...stalePlatformScrapeRecoveryForItemCount(existingReelCount),
    failureReason: "unknown",
  };
}

async function sweepPlatformScrapeJobs(
  platform: "tiktok" | "youtube",
  runningBefore: Date,
  pendingBefore: Date
): Promise<{ swept: number; restored: number; failed: number }> {
  const db = await getDb();
  if (!db) return { swept: 0, restored: 0, failed: 0 };

  const jobs: any =
    platform === "tiktok" ? tiktokScrapeJobs : youtubeScrapeJobs;
  const videos: any = platform === "tiktok" ? tiktokVideos : youtubeVideos;
  const rows = await db
    .select({
      id: jobs.id,
      userId: jobs.userId,
      workspaceId: jobs.workspaceId,
      handle: jobs.handle,
      status: jobs.status,
      updatedAt: jobs.updatedAt,
    })
    .from(jobs)
    .where(
      or(
        and(eq(jobs.status, "running"), lt(jobs.updatedAt, runningBefore)),
        and(eq(jobs.status, "pending"), lt(jobs.updatedAt, pendingBefore))
      )
    );

  let restored = 0;
  let failed = 0;
  for (const row of rows) {
    const countRows = await db
      .select({ count: sql<number>`count(*)` })
      .from(videos)
      .where(eq(videos.jobId, row.id));
    const itemCount = Number(countRows[0]?.count ?? 0);
    const recovery = stalePlatformScrapeRecoveryForItemCount(itemCount);
    const staleBefore =
      row.status === "running" ? runningBefore : pendingBefore;
    const result = await db
      .update(jobs)
      .set(recovery)
      .where(
        and(
          eq(jobs.id, row.id),
          eq(jobs.status, row.status),
          lt(jobs.updatedAt, staleBefore)
        )
      );
    if (Number(result[0]?.affectedRows ?? 0) === 0) continue;

    if (recovery.status === "completed") restored += 1;
    else failed += 1;

    void capturePostHogEvent({
      distinctId: posthogDistinctIdForUser(row.userId),
      event: "scrape_job_zombie_swept",
      properties: {
        platform,
        job_id: row.id,
        handle: row.handle,
        workspace_id: row.workspaceId,
        stale_status: row.status,
        existing_item_count: itemCount,
        recovery_status: recovery.status,
      },
    });
  }
  return { swept: restored + failed, restored, failed };
}

/**
 * Mark stale `running` scrape jobs as failed. Progress updates touch
 * `updatedAt` during the pull; if that freezes past the threshold the
 * Node process almost certainly died mid-run (OOM / deploy / crash).
 * Post-launch: run from a real cron or worker if you scale to multiple
 * app instances.
 */
export async function sweepZombieScrapeJobs(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const runningBefore = new Date(Date.now() - SCRAPE_JOB_RUNNING_STALE_MS);
  const pendingBefore = new Date(Date.now() - SCRAPE_JOB_PENDING_STALE_MS);
  const rows = await db
    .select({
      id: scrapeJobs.id,
      userId: scrapeJobs.userId,
      workspaceId: scrapeJobs.workspaceId,
      handle: scrapeJobs.handle,
      status: scrapeJobs.status,
      updatedAt: scrapeJobs.updatedAt,
    })
    .from(scrapeJobs)
    .where(
      or(
        and(eq(scrapeJobs.status, "running"), lt(scrapeJobs.updatedAt, runningBefore)),
        and(eq(scrapeJobs.status, "pending"), lt(scrapeJobs.updatedAt, pendingBefore))
      )
    );

  let restoredRefreshes = 0;
  let failedNewJobs = 0;
  for (const row of rows) {
    const existingReelCount = await countReelsForJob(row.id);
    const recovery = staleScrapeRecoveryForReelCount(existingReelCount);
    const staleBefore =
      row.status === "running" ? runningBefore : pendingBefore;
    const result = await db
      .update(scrapeJobs)
      .set(recovery)
      .where(
        and(
          eq(scrapeJobs.id, row.id),
          eq(scrapeJobs.status, row.status),
          lt(scrapeJobs.updatedAt, staleBefore)
        )
      );
    if (Number(result[0]?.affectedRows ?? 0) === 0) continue;

    if (recovery.status === "completed") restoredRefreshes += 1;
    else failedNewJobs += 1;

    void capturePostHogEvent({
      distinctId: posthogDistinctIdForUser(row.userId),
      event: "scrape_job_zombie_swept",
      properties: {
        job_id: row.id,
        handle: row.handle,
        workspace_id: row.workspaceId,
        stale_status: row.status,
        stale_updated_at: row.updatedAt?.toISOString?.() ?? String(row.updatedAt),
        existing_reel_count: existingReelCount,
        recovery_status: recovery.status,
      },
    });
  }

  const [tiktok, youtube] = await Promise.all([
    sweepPlatformScrapeJobs("tiktok", runningBefore, pendingBefore),
    sweepPlatformScrapeJobs("youtube", runningBefore, pendingBefore),
  ]);
  restoredRefreshes += tiktok.restored + youtube.restored;
  failedNewJobs += tiktok.failed + youtube.failed;
  const total = restoredRefreshes + failedNewJobs;

  if (total > 0) {
    console.log(
      "[scrapeJobSweeper] recovered " + total + " stale row(s): " +
        restoredRefreshes + " refresh(es) restored, " +
        failedNewJobs + " new job(s) failed"
    );
    alertOwnerThrottled({
      kind: "sweeper",
      message:
        total + " stale scrape job(s) recovered (" +
        restoredRefreshes + " refreshes restored, " +
        failedNewJobs + " failed)",
    });
  }
  return total;
}

export function startScrapeJobZombieSweeper(): void {
  const INTERVAL_MS = 2 * 60 * 1000;
  setInterval(() => {
    sweepZombieScrapeJobs().catch((e) => {
      console.error("[scrapeJobSweeper]", e);
      alertOwnerThrottled({ kind: "sweeper", message: "scrapeJobSweeper crashed", error: e });
    });
  }, INTERVAL_MS);
  void sweepZombieScrapeJobs();
}
