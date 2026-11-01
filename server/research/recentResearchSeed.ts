/**
 * Instant creator research (step C2).
 *
 * When someone starts researching a creator that ANY SpyReels user researched
 * recently, copy that research's public videos into the new job straight
 * away, so results show in a second instead of 30-60. The normal live
 * research still runs in the background and refreshes the data (Instagram
 * de-duplicates rows; TikTok and YouTube replace the copied rows at the end,
 * keeping them if the live run fails).
 *
 * Same idea as the existing featured-creator seeding, for every creator.
 * Only public video metadata is copied (no transcripts, notes or anything
 * user-written). Never throws into the caller: a failed copy just means the
 * user waits for live research as before.
 */
import { and, desc, eq, gte, ne } from "drizzle-orm";
import {
  reels,
  scrapeJobs,
  tiktokScrapeJobs,
  tiktokVideos,
  youtubeScrapeJobs,
  youtubeVideos,
} from "../../drizzle/schema";
import { getDb, insertReels, updateScrapeJob } from "../db";

export type ResearchPlatform = "instagram" | "tiktok" | "youtube";

/** How old a research can be and still be copied. */
export const RECENT_RESEARCH_MAX_AGE_DAYS = 14;

export type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

/** Videos inside the user's chosen window. Pure; exported for tests. */
export function withinTimeframe<T extends { postedAt: Date | null }>(rows: T[], timeframeDays: number, now = new Date()): T[] {
  const cutoff = now.getTime() - timeframeDays * 86_400_000;
  return rows.filter(r => !r.postedAt || r.postedAt.getTime() >= cutoff);
}

/** Most recent completed research of this creator in any workspace (last 14 days), or null. */
export async function recentResearchJobId(db: Db, platform: ResearchPlatform, handle: string, newJobId = -1): Promise<number | null> {
  const since = new Date(Date.now() - RECENT_RESEARCH_MAX_AGE_DAYS * 86_400_000);
  if (platform === "instagram") {
    const [row] = await db
      .select({ id: scrapeJobs.id })
      .from(scrapeJobs)
      .where(
        and(
          eq(scrapeJobs.handle, handle),
          eq(scrapeJobs.status, "completed"),
          eq(scrapeJobs.isDemo, false),
          gte(scrapeJobs.updatedAt, since),
          ne(scrapeJobs.id, newJobId)
        )
      )
      .orderBy(desc(scrapeJobs.updatedAt))
      .limit(1);
    return row?.id ?? null;
  }
  if (platform === "tiktok") {
    const [row] = await db
      .select({ id: tiktokScrapeJobs.id })
      .from(tiktokScrapeJobs)
      .where(
        and(
          eq(tiktokScrapeJobs.handle, handle),
          eq(tiktokScrapeJobs.status, "completed"),
          gte(tiktokScrapeJobs.updatedAt, since),
          ne(tiktokScrapeJobs.id, newJobId)
        )
      )
      .orderBy(desc(tiktokScrapeJobs.updatedAt))
      .limit(1);
    return row?.id ?? null;
  }
  const [row] = await db
    .select({ id: youtubeScrapeJobs.id })
    .from(youtubeScrapeJobs)
    .where(
      and(
        eq(youtubeScrapeJobs.handle, handle),
        eq(youtubeScrapeJobs.status, "completed"),
        gte(youtubeScrapeJobs.updatedAt, since),
        ne(youtubeScrapeJobs.id, newJobId)
      )
    )
    .orderBy(desc(youtubeScrapeJobs.updatedAt))
    .limit(1);
  return row?.id ?? null;
}

/**
 * Copy a recent research of the same creator into `jobId`. Returns how many
 * videos were copied (0 when there is no recent research or on any error).
 */
export async function seedFromRecentResearch(args: {
  platform: ResearchPlatform;
  handle: string;
  jobId: number;
  workspaceId: string;
  timeframeDays: number;
}): Promise<number> {
  const handle = args.handle.trim().replace(/^@+/, "").toLowerCase();
  if (!handle) return 0;
  try {
    const db = await getDb();
    if (!db) return 0;
    const donor = await recentResearchJobId(db, args.platform, handle, args.jobId);
    if (donor == null) return 0;
    let copied = 0;

    if (args.platform === "instagram") {
      const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, donor)).limit(1);
      const rows = withinTimeframe(
        await db.select().from(reels).where(eq(reels.jobId, donor)),
        args.timeframeDays
      );
      if (!job || rows.length === 0) return 0;
      await insertReels(
        rows.map(r => ({
          jobId: args.jobId,
          shortcode: r.shortcode,
          caption: r.caption,
          viewCount: r.viewCount,
          likeCount: r.likeCount,
          commentCount: r.commentCount,
          thumbnailUrl: r.thumbnailUrl,
          videoUrl: r.videoUrl,
          reelUrl: r.reelUrl,
          duration: r.duration,
          postedAt: r.postedAt,
          ownerUsername: r.ownerUsername,
        }))
      );
      copied = rows.length;
      await updateScrapeJob(args.jobId, {
        followerCount: job.followerCount,
        profilePicUrl: job.profilePicUrl ?? undefined,
        reelsFound: rows.length,
        totalReels: rows.length,
        currentStep: "pulling_reels",
        progressPercent: 20,
      });
    } else if (args.platform === "tiktok") {
      const [job] = await db.select().from(tiktokScrapeJobs).where(eq(tiktokScrapeJobs.id, donor)).limit(1);
      const rows = withinTimeframe(
        await db.select().from(tiktokVideos).where(eq(tiktokVideos.jobId, donor)),
        args.timeframeDays
      );
      if (!job || rows.length === 0) return 0;
      await db.insert(tiktokVideos).values(
        rows.map(({ id: _id, createdAt: _c, jobId: _j, workspaceId: _w, ...v }) => ({
          ...v,
          jobId: args.jobId,
          workspaceId: args.workspaceId,
        }))
      );
      copied = rows.length;
      await db
        .update(tiktokScrapeJobs)
        .set({
          followerCount: job.followerCount,
          profilePicUrl: job.profilePicUrl,
          videosFound: rows.length,
          totalVideos: rows.length,
        })
        .where(eq(tiktokScrapeJobs.id, args.jobId));
    } else {
      const [job] = await db.select().from(youtubeScrapeJobs).where(eq(youtubeScrapeJobs.id, donor)).limit(1);
      const rows = withinTimeframe(
        await db.select().from(youtubeVideos).where(eq(youtubeVideos.jobId, donor)),
        args.timeframeDays
      );
      if (!job || rows.length === 0) return 0;
      await db.insert(youtubeVideos).values(
        rows.map(({ id: _id, createdAt: _c, jobId: _j, workspaceId: _w, ...v }) => ({
          ...v,
          jobId: args.jobId,
          workspaceId: args.workspaceId,
        }))
      );
      copied = rows.length;
      await db
        .update(youtubeScrapeJobs)
        .set({
          subscriberCount: job.subscriberCount,
          profilePicUrl: job.profilePicUrl,
          videosFound: rows.length,
          totalVideos: rows.length,
        })
        .where(eq(youtubeScrapeJobs.id, args.jobId));
    }
    console.info("[research] seeded_from_recent", { platform: args.platform, jobId: args.jobId, donorJobId: donor, videos: copied });
    return copied;
  } catch (err) {
    console.warn("[research] seed_from_recent_failed", {
      platform: args.platform,
      jobId: args.jobId,
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
