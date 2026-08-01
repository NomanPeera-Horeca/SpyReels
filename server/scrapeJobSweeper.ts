import { and, eq, lt } from "drizzle-orm";
import { scrapeJobs } from "../drizzle/schema";
import {
  capturePostHogEvent,
  posthogDistinctIdForUser,
} from "./analytics/posthogServer";
import { getDb } from "./db";

export const SCRAPE_JOB_STALE_MS = 10 * 60 * 1000;
export const SCRAPE_JOB_ZOMBIE_MESSAGE =
  "Scrape process interrupted, please retry";

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
  const before = new Date(Date.now() - SCRAPE_JOB_STALE_MS);
  const rows = await db
    .select({
      id: scrapeJobs.id,
      userId: scrapeJobs.userId,
      workspaceId: scrapeJobs.workspaceId,
      handle: scrapeJobs.handle,
      updatedAt: scrapeJobs.updatedAt,
    })
    .from(scrapeJobs)
    .where(and(eq(scrapeJobs.status, "running"), lt(scrapeJobs.updatedAt, before)));
  for (const r of rows) {
    await db
      .update(scrapeJobs)
      .set({
        status: "failed",
        errorMessage: SCRAPE_JOB_ZOMBIE_MESSAGE,
        currentStep: "failed",
        failureReason: "unknown",
      })
      .where(eq(scrapeJobs.id, r.id));

    void capturePostHogEvent({
      distinctId: posthogDistinctIdForUser(r.userId),
      event: "scrape_job_zombie_swept",
      properties: {
        job_id: r.id,
        handle: r.handle,
        workspace_id: r.workspaceId,
        stale_updated_at: r.updatedAt?.toISOString?.() ?? String(r.updatedAt),
      },
    });
  }
  if (rows.length > 0) {
    console.log(
      `[scrapeJobSweeper] marked ${rows.length} stale running row(s) as failed`
    );
  }
  return rows.length;
}

export function startScrapeJobZombieSweeper(): void {
  const INTERVAL_MS = 2 * 60 * 1000;
  setInterval(() => {
    sweepZombieScrapeJobs().catch((e) => console.error("[scrapeJobSweeper]", e));
  }, INTERVAL_MS);
  void sweepZombieScrapeJobs();
}
