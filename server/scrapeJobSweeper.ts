import { and, eq, lt, or } from "drizzle-orm";
import { scrapeJobs } from "../drizzle/schema";
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

export function staleScrapeRecoveryForReelCount(
  existingReelCount: number
): StaleScrapeRecovery {
  if (existingReelCount > 0) {
    return {
      status: "completed",
      currentStep: "complete",
      progressPercent: 100,
      errorMessage: SCRAPE_REFRESH_RECOVERED_MESSAGE,
      failureReason: "unknown",
    };
  }
  return {
    status: "failed",
    currentStep: "failed",
    progressPercent: 0,
    errorMessage: SCRAPE_JOB_ZOMBIE_MESSAGE,
    failureReason: "unknown",
  };
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
    await db.update(scrapeJobs).set(recovery).where(eq(scrapeJobs.id, row.id));

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

  if (rows.length > 0) {
    console.log(
      "[scrapeJobSweeper] recovered " + rows.length + " stale row(s): " +
        restoredRefreshes + " refresh(es) restored, " +
        failedNewJobs + " new job(s) failed"
    );
    alertOwnerThrottled({
      kind: "sweeper",
      message:
        rows.length + " stale scrape job(s) recovered (" +
        restoredRefreshes + " refreshes restored, " +
        failedNewJobs + " failed)",
    });
  }
  return rows.length;
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
