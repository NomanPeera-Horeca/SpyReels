import { sql } from "drizzle-orm";
import {
  isViralByViewCount,
  medianViewCount,
  normalizeCreatorKey,
  VIRAL_MIN_VIEWS,
  VIRAL_MEDIAN_MULTIPLIER,
} from "../shared/reelViralFlag";
import { getDb, getReelsByJobId, getScrapeJob } from "./db";

/** All view counts for a creator across every scrape job (matches backfill script). */
export async function getCreatorViewCounts(creatorKey: string): Promise<number[]> {
  if (!creatorKey) return [];
  const db = await getDb();
  if (!db) return [];

  const rows = await db.execute<{ viewCount: number | string | bigint }>(sql`
    SELECT r.viewCount AS viewCount
    FROM reels r
    INNER JOIN scrape_jobs j ON j.id = r.jobId
    WHERE LOWER(TRIM(COALESCE(NULLIF(TRIM(r.ownerUsername), ''), j.handle))) = ${creatorKey}
  `);

  const list = Array.isArray(rows) ? rows : (rows as { rows?: unknown[] }).rows ?? [];
  return (list as { viewCount: unknown }[])
    .map((r) => Number(r.viewCount))
    .filter((v) => Number.isFinite(v) && v >= 0);
}

export async function refreshViralFlagsForScrapeJob(
  jobId: number
): Promise<{ updated: number; medianViews: number; creatorKey: string }> {
  const job = await getScrapeJob(jobId);
  if (!job) return { updated: 0, medianViews: 0, creatorKey: "" };

  const jobReels = await getReelsByJobId(jobId);
  if (jobReels.length === 0) return { updated: 0, medianViews: 0, creatorKey: "" };

  const creatorKey = normalizeCreatorKey(
    jobReels[0]?.ownerUsername ?? null,
    job.handle
  );
  const allViews = await getCreatorViewCounts(creatorKey);
  const medianViews = medianViewCount(
    allViews.length > 0 ? allViews : jobReels.map((r) => r.viewCount)
  );
  const threshold = VIRAL_MEDIAN_MULTIPLIER * medianViews;

  const db = await getDb();
  if (!db) return { updated: 0, medianViews, creatorKey };

  await db.execute(sql`
    UPDATE reels
    SET viralFlag = CASE
      WHEN viewCount > ${threshold} AND viewCount > ${VIRAL_MIN_VIEWS} THEN 1
      ELSE 0
    END
    WHERE jobId = ${jobId}
  `);

  const viralCount = jobReels.filter((r) =>
    isViralByViewCount(r.viewCount, medianViews)
  ).length;

  console.log(
    `[refreshViralFlagsForScrapeJob ${jobId}] creator=@${creatorKey} medianViews=${Math.round(medianViews)} reels=${jobReels.length} viral=${viralCount}`
  );

  return { updated: jobReels.length, medianViews, creatorKey };
}
