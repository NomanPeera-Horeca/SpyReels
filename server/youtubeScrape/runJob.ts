import { eq } from "drizzle-orm";
import { youtubeScrapeJobs, youtubeVideos } from "../../drizzle/schema";
import { getDb } from "../db";
import { scrapeYouTubeShorts } from "../youtube";

function failureMessageForHandle(handle: string, message: string): string {
  const cleanHandle = handle.replace(/^@/, "").trim();
  if (/not found|does not exist|no such channel|channel not found/i.test(message)) {
    return `Channel "@${cleanHandle}" not found. Please check the handle and try again.`;
  }
  return message;
}

export async function runYouTubeScrapeJob(
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
  let pastFetchingProfile = false;
  let videosPersistedCount = 0;

  try {
    console.log(
      `[runYouTubeScrapeJob ${jobId}] start userId=${userId} workspaceId=${workspaceId} handle=@${cleanHandle} timeframeDays=${timeframeDays}`
    );

    await db
      .update(youtubeScrapeJobs)
      .set({
        status: "running",
        currentStep: "connecting",
        progressPercent: 15,
        errorMessage: null,
      })
      .where(eq(youtubeScrapeJobs.id, jobId));

    const result = await scrapeYouTubeShorts(
      cleanHandle,
      (count, pageBatch) => {
        const batch = pageBatch ?? [];
        videosPersistedCount += batch.length;
        const currentVideosFound = videosPersistedCount;
        const shouldMarkFetchingProfile = !pastFetchingProfile;
        if (shouldMarkFetchingProfile) {
          pastFetchingProfile = true;
        }
        const write = (async () => {
          if (shouldMarkFetchingProfile) {
            await db
              .update(youtubeScrapeJobs)
              .set({
                currentStep: "fetching_profile",
                progressPercent: 15,
              })
              .where(eq(youtubeScrapeJobs.id, jobId));
          }

          await db
            .update(youtubeScrapeJobs)
            .set({
              currentStep: "pulling_videos",
              totalVideos: currentVideosFound,
              videosFound: currentVideosFound,
              progressPercent: Math.min(
                20 + Math.floor((count / 30) * 60),
                80
              ),
            })
            .where(eq(youtubeScrapeJobs.id, jobId));

          if (batch.length > 0 && !options?.replaceExisting) {
            await db.insert(youtubeVideos).values(
              batch.map((video) => ({
                jobId,
                workspaceId,
                videoId: video.videoId,
                title: video.title,
                description: video.description,
                viewCount: video.viewCount,
                likeCount: video.likeCount,
                commentCount: video.commentCount,
                thumbnailUrl: video.thumbnailUrl,
                videoPageUrl: video.videoPageUrl,
                durationSec: Math.round(video.durationSec),
                postedAt: video.postedAt,
                ownerHandle: video.ownerHandle,
                outsideSpyWindow: video.outsideSpyWindow === true ? true : null,
              }))
            );
          }
        })();

        pendingWrites.push(write);
        void write.catch((error) => {
          console.error(
            `[runYouTubeScrapeJob ${jobId}] incremental write failed:`,
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
        await tx.delete(youtubeVideos).where(eq(youtubeVideos.jobId, jobId));
        if (result.videos.length > 0) {
          await tx.insert(youtubeVideos).values(
            result.videos.map((video) => ({
              jobId,
              workspaceId,
              videoId: video.videoId,
              title: video.title,
              description: video.description,
              viewCount: video.viewCount,
              likeCount: video.likeCount,
              commentCount: video.commentCount,
              thumbnailUrl: video.thumbnailUrl,
              videoPageUrl: video.videoPageUrl,
              durationSec: Math.round(video.durationSec),
              postedAt: video.postedAt,
              ownerHandle: video.ownerHandle,
              outsideSpyWindow: video.outsideSpyWindow === true ? true : null,
            }))
          );
        }
      });
    }

    const inWindowCount = result.videos.filter(
      (video) => video.outsideSpyWindow !== true
    ).length;

    await db
      .update(youtubeScrapeJobs)
      .set({
        status: "completed",
        totalVideos: result.videos.length,
        videosFound: result.videos.length,
        subscriberCount: result.subscriberCount,
        profilePicUrl: result.profilePicUrl,
        currentStep: "complete",
        progressPercent: 100,
        errorMessage: null,
      })
      .where(eq(youtubeScrapeJobs.id, jobId));

    console.log(
      `[runYouTubeScrapeJob ${jobId}] completed handle=@${cleanHandle} videos=${result.videos.length} in_window=${inWindowCount} timeframeDays=${timeframeDays} subscribers=${result.subscriberCount}`
    );
  } catch (error) {
    await Promise.allSettled(pendingWrites);
    const rawMessage =
      error instanceof Error ? error.message : "Unknown YouTube scrape error";
    const errorMessage = failureMessageForHandle(handle, rawMessage);

    console.warn(
      `[runYouTubeScrapeJob ${jobId}] failed handle=@${cleanHandle}: ${errorMessage}`
    );

    try {
      await db
        .update(youtubeScrapeJobs)
        .set({
          status: "failed",
          currentStep: "failed",
          errorMessage,
        })
        .where(eq(youtubeScrapeJobs.id, jobId));
    } catch (updateError) {
      console.error(
        `[runYouTubeScrapeJob ${jobId}] failed to mark job failed:`,
        updateError
      );
    }
  }
}
