import { and, eq, inArray } from "drizzle-orm";
import { reels as reelsTable } from "../drizzle/schema";
import { getDb } from "./db";
import { classifyReelsByIds } from "./services/classifyReels";
import { mirrorReelVideosToR2ByIds } from "./reelVideoR2";

/**
 * Non-blocking enrichment after a scrape job is marked completed.
 * Video mirroring and classification must not gate the user dashboard.
 */
export function scheduleScrapeJobPostCompleteWork(jobId: number): void {
  void (async () => {
    const db = await getDb();
    if (!db) return;

    const reelIds = await db
      .select({ id: reelsTable.id })
      .from(reelsTable)
      .where(eq(reelsTable.jobId, jobId))
      .then((rows) => rows.map((r) => r.id));

    if (reelIds.length === 0) return;

    scheduleScrapeReelPostCompleteWork(reelIds, `runScrapeJob ${jobId}`);
  })();
}

export function scheduleScrapeReelPostCompleteWork(reelIds: number[], logPrefix: string): void {
  const uniqueIds = [...new Set(reelIds.filter((id) => Number.isFinite(id)))];
  if (uniqueIds.length === 0) return;

  void mirrorReelVideosToR2ByIds(uniqueIds)
    .then((r) =>
      console.log(
        `[${logPrefix}] mirror-videos ok=${r.ok} failed=${r.failed} skipped=${r.skipped}`
      )
    )
    .catch((err) => console.error(`[${logPrefix}] mirror-videos error:`, err));

  void classifyReelsByIds(uniqueIds)
    .then((r) =>
      console.log(`[${logPrefix}] auto-classify ok=${r.ok} failed=${r.failed}`)
    )
    .catch((err) => console.error(`[${logPrefix}] auto-classify error:`, err));
}

export async function reelIdsForJobShortcodes(
  jobId: number,
  shortcodes: string[]
): Promise<number[]> {
  if (shortcodes.length === 0) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({ id: reelsTable.id })
    .from(reelsTable)
    .where(and(eq(reelsTable.jobId, jobId), inArray(reelsTable.shortcode, shortcodes)));
  return rows.map((r) => r.id);
}
