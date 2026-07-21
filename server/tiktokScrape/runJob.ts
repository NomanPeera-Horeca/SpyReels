import { and, eq } from "drizzle-orm";
import { tiktokScrapeJobs, tiktokVideos } from "../../drizzle/schema";
import { getDb } from "../db";
import { scrapeTikTokVideos } from "../tiktok";
import { mirrorTiktokThumbnailsBounded } from "./mediaMirror";

function failureMessageForHandle(handle: string, message: string): string {
  const cleanHandle = handle.replace(/^@/, "").trim();
  if (/private/i.test(message)) {
    return `The account @${cleanHandle} is private. Only public accounts can be scraped.`;
  }
  if (/not found|does not exist|no such user/i.test(message)) {
    return `User "@${cleanHandle}" not found. Please check the username and try again.`;
  }
  return message;
}

export async function runTikTokScrapeJob(
  jobId: number,
  userId: number,
  workspaceId: string,
  handle: string,
  options?: { maxVideos?: number; timeoutMs?: number; timeframeDays?: number }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
  const pendingWrites: Promise<void>[] = [];
  const timeframeDays = options?.timeframeDays ?? 30;
  const cutoff = new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000);
  let videosInWindowCount = 0;

  try {
    console.log(
      `[runTikTokScrapeJob ${jobId}] start userId=${userId} workspaceId=${workspaceId} handle=@${cleanHandle}`
    );

    await db
      .update(tiktokScrapeJobs)
      .set({
        status: "running",
        currentStep: "fetching_profile",
        progressPercent: 15,
        errorMessage: null,
      })
      .where(eq(tiktokScrapeJobs.id, jobId));

    const result = await scrapeTikTokVideos(
      cleanHandle,
      (count, pageBatch) => {
        const videosInWindow =
          pageBatch?.filter((video) => video.postedAt >= cutoff) ?? [];
        videosInWindowCount += videosInWindow.length;
        const currentVideosInWindowCount = videosInWindowCount;
        const write = (async () => {
          await db
            .update(tiktokScrapeJobs)
            .set({
              currentStep: "pulling_videos",
              totalVideos: currentVideosInWindowCount,
              videosFound: currentVideosInWindowCount,
              progressPercent: Math.min(
                20 + Math.floor((count / 30) * 60),
                80
              ),
            })
            .where(eq(tiktokScrapeJobs.id, jobId));

          if (videosInWindow.length > 0) {
            await db.insert(tiktokVideos).values(
              videosInWindow.map((video) => ({
                jobId,
                workspaceId,
                awemeId: video.awemeId,
                caption: video.caption,
                viewCount: video.viewCount,
                likeCount: video.likeCount,
                commentCount: video.commentCount,
                shareCount: video.shareCount,
                thumbnailUrl: video.thumbnailUrl,
                videoUrl: video.videoUrl,
                videoPageUrl: video.videoPageUrl,
                durationSec: Math.round(video.durationSec),
                postedAt: video.postedAt,
                ownerUsername: video.ownerUsername,
              }))
            );
          }
        })();

        pendingWrites.push(write);
        void write.catch((error) => {
          console.error(
            `[runTikTokScrapeJob ${jobId}] incremental write failed:`,
            error
          );
        });
      },
      {
        maxVideos: options?.maxVideos ?? 500,
        timeoutMs: options?.timeoutMs ?? 5 * 60 * 1000,
      }
    );

    await Promise.all(pendingWrites);
    const videosInWindow = result.videos.filter(
      (video) => video.postedAt >= cutoff
    );

    const mirroredThumbnails = await mirrorTiktokThumbnailsBounded(
      videosInWindow.map((video) => ({
        awemeId: video.awemeId,
        thumbnailUrl: video.thumbnailUrl,
      }))
    );

    for (const video of videosInWindow) {
      const thumbnailUrl = mirroredThumbnails.get(video.awemeId);
      if (thumbnailUrl === undefined) continue;
      await db
        .update(tiktokVideos)
        .set({ thumbnailUrl })
        .where(
          and(
            eq(tiktokVideos.jobId, jobId),
            eq(tiktokVideos.awemeId, video.awemeId)
          )
        );
    }

    await db
      .update(tiktokScrapeJobs)
      .set({
        status: "completed",
        totalVideos: videosInWindow.length,
        videosFound: videosInWindow.length,
        followerCount: result.followerCount,
        profilePicUrl: result.profilePicUrl,
        currentStep: "complete",
        progressPercent: 100,
        errorMessage: null,
      })
      .where(eq(tiktokScrapeJobs.id, jobId));

    console.log(
      `[runTikTokScrapeJob ${jobId}] completed handle=@${cleanHandle} videos=${videosInWindow.length} timeframeDays=${timeframeDays} followers=${result.followerCount}`
    );
  } catch (error) {
    await Promise.allSettled(pendingWrites);
    const rawMessage =
      error instanceof Error ? error.message : "Unknown TikTok scrape error";
    const errorMessage = failureMessageForHandle(handle, rawMessage);

    console.warn(
      `[runTikTokScrapeJob ${jobId}] failed handle=@${cleanHandle}: ${errorMessage}`
    );

    try {
      await db
        .update(tiktokScrapeJobs)
        .set({
          status: "failed",
          currentStep: "failed",
          errorMessage,
        })
        .where(eq(tiktokScrapeJobs.id, jobId));
    } catch (updateError) {
      console.error(
        `[runTikTokScrapeJob ${jobId}] failed to mark job failed:`,
        updateError
      );
    }
  }
}
