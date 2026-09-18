import { and, eq } from "drizzle-orm";
import { tiktokScrapeJobs, tiktokVideos } from "../../drizzle/schema";
import { getDb } from "../db";
import { scrapeTikTokVideos } from "../tiktok";
import { ensureProfilePicOnR2 } from "../profilePicR2";
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
  options?: { maxVideos?: number; timeoutMs?: number; timeframeDays?: number; replaceExisting?: boolean }
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
  const pendingWrites: Promise<void>[] = [];
  const timeframeDays = options?.timeframeDays ?? 30;
  const sinceDate = new Date(
    Date.now() - timeframeDays * 24 * 60 * 60 * 1000
  );
  let videosPersistedCount = 0;

  try {
    console.log(
      `[runTikTokScrapeJob ${jobId}] start userId=${userId} workspaceId=${workspaceId} handle=@${cleanHandle} timeframeDays=${timeframeDays}`
    );

    await db
      .update(tiktokScrapeJobs)
      .set({
        status: "running",
        currentStep: "connecting",
        progressPercent: 15,
        errorMessage: null,
      })
      .where(eq(tiktokScrapeJobs.id, jobId));

    const result = await scrapeTikTokVideos(
      cleanHandle,
      (count, pageBatch) => {
        const batch = pageBatch ?? [];
        videosPersistedCount += batch.length;
        const currentVideosCount = videosPersistedCount;
        const write = (async () => {
          await db
            .update(tiktokScrapeJobs)
            .set({
              currentStep: "pulling_videos",
              totalVideos: currentVideosCount,
              videosFound: currentVideosCount,
              progressPercent: Math.min(
                20 + Math.floor((count / 30) * 60),
                80
              ),
            })
            .where(eq(tiktokScrapeJobs.id, jobId));

          if (batch.length > 0 && !options?.replaceExisting) {
            await db.insert(tiktokVideos).values(
              batch.map((video) => ({
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
                outsideSpyWindow: video.outsideSpyWindow === true ? true : null,
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
        sinceDate,
      }
    );

    await Promise.all(pendingWrites);

    if (options?.replaceExisting) {
      await db.transaction(async (tx) => {
        await tx.delete(tiktokVideos).where(eq(tiktokVideos.jobId, jobId));
        if (result.videos.length > 0) {
          await tx.insert(tiktokVideos).values(
            result.videos.map((video) => ({
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
              outsideSpyWindow: video.outsideSpyWindow === true ? true : null,
            }))
          );
        }
      });
    }

    const mirroredThumbnails = await mirrorTiktokThumbnailsBounded(
      result.videos.map((video) => ({
        awemeId: video.awemeId,
        thumbnailUrl: video.thumbnailUrl,
      }))
    );

    for (const video of result.videos) {
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

    const inWindowCount = result.videos.filter(
      (video) => video.outsideSpyWindow !== true
    ).length;

    // TikTok CDN avatars expire (x-expires). Mirror like Instagram so Creator Radar stays durable.
    const durableProfilePic =
      (await ensureProfilePicOnR2(
        cleanHandle,
        result.profilePicUrl,
        "tiktok"
      )) || result.profilePicUrl || "";

    await db
      .update(tiktokScrapeJobs)
      .set({
        status: "completed",
        totalVideos: result.videos.length,
        videosFound: result.videos.length,
        followerCount: result.followerCount,
        profilePicUrl: durableProfilePic,
        currentStep: "complete",
        progressPercent: 100,
        errorMessage: null,
      })
      .where(eq(tiktokScrapeJobs.id, jobId));

    console.log(
      `[runTikTokScrapeJob ${jobId}] completed handle=@${cleanHandle} videos=${result.videos.length} in_window=${inWindowCount} timeframeDays=${timeframeDays} followers=${result.followerCount}`
    );
  } catch (error) {
    await Promise.allSettled(pendingWrites);
    const rawMessage =
      error instanceof Error ? error.message : "Unknown TikTok scrape error";
    const errorMessage = failureMessageForHandle(handle, rawMessage);

    console.warn(
      `[runTikTokScrapeJob ${jobId}] ${options?.replaceExisting ? "refresh failed; preserving existing data" : "failed"} handle=@${cleanHandle}: ${errorMessage}`
    );

    try {
      await db
        .update(tiktokScrapeJobs)
        .set({
          status: options?.replaceExisting ? "completed" : "failed",
          currentStep: options?.replaceExisting ? "complete" : "failed",
          progressPercent: options?.replaceExisting ? 100 : 0,
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
