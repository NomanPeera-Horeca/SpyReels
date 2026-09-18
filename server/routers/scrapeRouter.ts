import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { featuredAccounts, reels as reelsTable, scrapeJobs } from "../../drizzle/schema";
import { getScrapeJobsByWorkspace, updateScrapeJob, getDb, createScrapeJob, seedFeaturedReelsIntoJob, getScrapeJob, deleteScrapeJob, insertReels, dedupeReelsForJob, countReelsForJob, updateReelsForJobFromScrape, getExistingShortcodes, updateScrapeJobResync } from "../db";
import { resolveInstagramIdentity, scrapeReels, fetchProfile, runWithScrapeCallContext } from "../instagram";
import { ensureProfilePicOnR2 } from "../profilePicR2";
import { ensureReelThumbnailOnR2 } from "../reelThumbnailR2";
import { refreshViralFlagsForScrapeJob } from "../reelViralFlag";
import { classifyThrownInstagramError, classifyScrapeFailureMessage, instagramFailureLogReason, shouldRefundInstagramFailure } from "../scrapeFailureReason";
import { SCRAPE_JOB_STALE_MS, SCRAPE_JOB_ZOMBIE_MESSAGE } from "../scrapeJobSweeper";
import { scheduleScrapeJobPostCompleteWork, reelIdsForJobShortcodes, scheduleScrapeReelPostCompleteWork } from "../scrapePostComplete";
import { tryAcquireScrapeSlot, releaseScrapeSlot } from "../scrapeSemaphore";
import { checkUsageLimit, incrementUsage, decrementUsage } from "../stripe/stripe-service";
import { normalizeInstagramHandle, isValidInstagramHandleNormalized, INSTAGRAM_HANDLE_INVALID_MESSAGE } from "@shared/instagramHandle";
import { and, not, sql, eq, inArray, or } from "drizzle-orm";
import { maybeMarkFirstSpyCompleted } from "./_shared";
import { enqueueCreatorRadarRefresh } from "../creatorRadarRefreshQueue";

async function uploadReelThumbnailsBounded(
  items: Array<{ shortcode: string; thumbnailUrl: string }>,
  concurrency = 5
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (items.length === 0) return out;

  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        const item = items[i]!;
        const stable = await ensureReelThumbnailOnR2(
          item.shortcode,
          item.thumbnailUrl ?? ""
        );
        out.set(item.shortcode, stable);
      }
    })
  );
  return out;
}


async function runScrapeJob(
  jobId: number,
  userId: number,
  handle: string,
  timeframeDays: number
): Promise<void> {
  try {
    await runScrapeJobInner(jobId, userId, handle, timeframeDays);
  } finally {
    releaseScrapeSlot();
  }
}


async function runScrapeJobInner(
  jobId: number,
  userId: number,
  handle: string,
  timeframeDays: number
): Promise<void> {
  // Centralized refund helper so the multiple failure paths stay in sync.
  // Only safe to call once per job (we never enter more than one failure
  // branch in a single run).
  const refundScrapeQuota = async (reason: string) => {
    try {
      await decrementUsage(userId, "scrapeCount");
      console.warn(
        `[runScrapeJob ${jobId}] refunded scrapeCount for user ${userId} (reason: ${reason})`
      );
    } catch (refundErr) {
      console.error(
        `[runScrapeJob ${jobId}] failed to refund scrapeCount for user ${userId}:`,
        refundErr
      );
    }
  };

  // Schedule deletion of this scrape_jobs row after the client has had
  // enough time to poll the failed status. The progress page polls every
  // 1.5s and stops polling once it sees status=failed, so 30s is plenty
  // of buffer. Keeps the DB and Creator Radar free of stale "tried it,
  // didn't work" rows.
  const scheduleFailedJobCleanup = (reason: string) => {
    setTimeout(async () => {
      try {
        await deleteScrapeJob(jobId);
        console.log(
          `[runScrapeJob ${jobId}] cleaned up failed-zero-reel row (reason: ${reason})`
        );
      } catch (cleanupErr) {
        console.error(
          `[runScrapeJob ${jobId}] failed to clean up row:`,
          cleanupErr
        );
      }
    }, 30_000);
  };

  try {
    const cleanHandleForLog = handle.replace(/^@/, "").trim().toLowerCase();
    console.log(
      `[runScrapeJob ${jobId}] start handle=@${cleanHandleForLog} timeframeDays=${timeframeDays}`
    );

    // Stage 1: connecting → about to call Instagram for the profile.
    await updateScrapeJob(jobId, {
      status: "running",
      currentStep: "connecting",
      progressPercent: 5,
    });

    // Stage 2: fetching_profile → scrapeReels will call fetchProfile as its
    // first step; we can't peek inside the function, so we mark the stage at
    // the boundary.
    await updateScrapeJob(jobId, {
      currentStep: "fetching_profile",
      progressPercent: 15,
    });

    const {
      reels: reelData,
      followerCount,
      profilePicUrl,
      totalParsedItems,
      mostRecentItemAt,
      reelsInWindow,
      canonicalUsername,
    } = await runWithScrapeCallContext(
      { source: "scrape_job", jobId, handle: cleanHandleForLog },
      () =>
        scrapeReels(
          handle,
          timeframeDays,
          (count, pageBatch) => {
            // Stage 3: pulling_reels → scales 20→80 against a visual baseline
            // of 30 reels; caps at 80 so we always leave headroom for ranking.
            updateScrapeJob(jobId, {
              currentStep: "pulling_reels",
              totalReels: count,
              reelsFound: count,
              progressPercent: Math.min(20 + Math.floor((count / 30) * 60), 80),
            }).catch(() => {});

            if (pageBatch && pageBatch.length > 0) {
              insertReels(
                pageBatch.map((r) => ({
                  jobId,
                  shortcode: r.shortcode,
                  caption: r.caption,
                  viewCount: r.viewCount,
                  likeCount: r.likeCount,
                  commentCount: r.commentCount,
                  thumbnailUrl: r.thumbnailUrl,
                  videoUrl: r.videoUrl ?? "",
                  reelUrl: r.reelUrl,
                  duration: r.duration,
                  postedAt: r.postedAt,
                  ownerUsername: r.ownerUsername,
                }))
              ).catch((err) => {
                console.error(
                  `[runScrapeJob ${jobId}] incremental insert failed:`,
                  err
                );
              });
            }
          },
          { maxReels: 500, timeoutMs: 5 * 60 * 1000 }
        )
    );

    // Stage 4: ranking → insert + finalize. Set before pic proxy so the UI
    // has a visible "analyzing" beat even when the proxy work is quick.
    await updateScrapeJob(jobId, {
      currentStep: "ranking",
      progressPercent: 85,
    });

    const cleanHandle = normalizeInstagramHandle(canonicalUsername || handle);
    if (cleanHandle && cleanHandle !== cleanHandleForLog) {
      const currentJob = await getScrapeJob(jobId);
      const siblings = currentJob
        ? await getScrapeJobsByWorkspace(currentJob.workspaceId)
        : [];
      const handleTaken = siblings.some(
        (j) =>
          j.id !== jobId &&
          j.handle.toLowerCase() === cleanHandle &&
          (j.status === "completed" || j.status === "running")
      );
      if (handleTaken) {
        console.warn(
          `[runScrapeJob ${jobId}] skipped canonical handle update @${cleanHandleForLog} -> @${cleanHandle}: another Radar job already uses that handle`
        );
      } else {
        await updateScrapeJob(jobId, { handle: cleanHandle });
      }
    }
    const proxiedPicUrl = await ensureProfilePicOnR2(
      cleanHandle,
      profilePicUrl
    );

    if (reelData.length === 0) {
      await dedupeReelsForJob(jobId);
      const seededReelCount = await countReelsForJob(jobId);
      if (seededReelCount > 0) {
        const priorJob = await getScrapeJob(jobId);
        await updateScrapeJob(jobId, {
          status: "completed",
          totalReels: seededReelCount,
          followerCount: followerCount || priorJob?.followerCount || 0,
          profilePicUrl: proxiedPicUrl || undefined,
          currentStep: "complete",
          reelsFound: seededReelCount,
          progressPercent: 100,
          errorMessage: null,
          failureReason: null,
        });
        await maybeMarkFirstSpyCompleted(jobId);
        console.log(
          `[runScrapeJob ${jobId}] completed with seeded catalog (live pull returned 0) handle=@${cleanHandleForLog} reels=${seededReelCount}`
        );
        return;
      }

      if (followerCount > 0) {
        // Two distinct sub-cases land here:
        //
        //  A. Vendor returned items but ALL were older than the user's
        //     timeframe window. The account simply has not posted reels
        //     recently. Show a friendly "expand timeframe" message rather
        //     than blaming Instagram, and refund the quota since the
        //     scrape did its job (we just found nothing in the window).
        //
        //  B. Vendor returned zero items at all (or only unparseable
        //     items). That is the Bug #64 "empty success" envelope: a
        //     transient vendor-pool issue. Keep the existing rate-limited
        //     label and refund.
        const itemsExisted = totalParsedItems > 0;
        const ageDays =
          itemsExisted && mostRecentItemAt
            ? Math.max(
                0,
                Math.floor(
                  (Date.now() - mostRecentItemAt.getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              )
            : null;

        if (itemsExisted) {
          const ageCopy =
            ageDays != null
              ? ` Most recent reel was posted ${ageDays} day${ageDays === 1 ? "" : "s"} ago.`
              : "";
          await updateScrapeJob(jobId, {
            status: "failed",
            totalReels: 0,
            followerCount,
            profilePicUrl: proxiedPicUrl || undefined,
            currentStep: "failed",
            reelsFound: 0,
            progressPercent: 100,
            errorMessage: `@${handle.replace(/^@/, "")} has not posted reels in the last ${timeframeDays} days.${ageCopy} Try expanding the timeframe.`,
            failureReason: "unknown",
          });
          await refundScrapeQuota("no_reels_in_window");
          scheduleFailedJobCleanup("no_reels_in_window");
          console.warn(
            `[runScrapeJob ${jobId}] failed handle=@${cleanHandleForLog} reason=no_reels_in_window followers=${followerCount}`
          );
          return;
        }

        await updateScrapeJob(jobId, {
          status: "failed",
          totalReels: 0,
          followerCount,
          profilePicUrl: proxiedPicUrl || undefined,
          currentStep: "failed",
          reelsFound: 0,
          progressPercent: 100,
          errorMessage: `Scraper returned 0 reels for an account with ${followerCount} followers. This usually means a temporary Instagram session issue. Please retry in a few minutes.`,
          failureReason: "instagram_rate_limited",
        });
        await refundScrapeQuota("zero_reels_with_followers");
        scheduleFailedJobCleanup("zero_reels_with_followers");
        console.warn(
          `[runScrapeJob ${jobId}] failed handle=@${cleanHandleForLog} reason=zero_reels_with_followers followers=${followerCount} totalParsedItems=${totalParsedItems}`
        );
        return;
      }

      await updateScrapeJob(jobId, {
        status: "completed",
        totalReels: 0,
        followerCount,
        profilePicUrl: proxiedPicUrl || undefined,
        currentStep: "complete",
        progressPercent: 100,
        errorMessage: null,
        failureReason: null,
      });
      await maybeMarkFirstSpyCompleted(jobId);
      console.log(
        `[runScrapeJob ${jobId}] completed handle=@${cleanHandleForLog} reels=0 followers=${followerCount}`
      );
      return;
    }

    // Move IG-CDN thumbnails to R2 before inserting. Raw IG URLs carry a
    // signed query string that expires every 24–48h, so persisting them
    // directly to `reels.thumbnailUrl` is what causes blank tiles in the
    // dashboard a day or two after the scrape. ensureReelThumbnailOnR2
    // is best-effort: on any failure it returns the source URL unchanged
    // so the insert always succeeds.
    const stableThumbs = await uploadReelThumbnailsBounded(
      reelData.map((r) => ({ shortcode: r.shortcode, thumbnailUrl: r.thumbnailUrl }))
    );

    const mappedReels = reelData.map((r) => ({
      jobId,
      shortcode: r.shortcode,
      caption: r.caption,
      viewCount: r.viewCount,
      likeCount: r.likeCount,
      commentCount: r.commentCount,
      thumbnailUrl: stableThumbs.get(r.shortcode) ?? r.thumbnailUrl,
      videoUrl: r.videoUrl ?? "",
      reelUrl: r.reelUrl,
      duration: r.duration,
      postedAt: r.postedAt,
      ownerUsername: r.ownerUsername,
    }));

    await updateReelsForJobFromScrape(jobId, mappedReels);
    await insertReels(mappedReels);
    await dedupeReelsForJob(jobId);
    await refreshViralFlagsForScrapeJob(jobId);
    const finalReelCount = await countReelsForJob(jobId);

    await updateScrapeJob(jobId, {
      status: "completed",
      totalReels: finalReelCount,
      reelsInWindow,
      followerCount,
      profilePicUrl: proxiedPicUrl || undefined,
      currentStep: "complete",
      reelsFound: finalReelCount,
      progressPercent: 100,
      errorMessage: null,
      failureReason: null,
    });
    await maybeMarkFirstSpyCompleted(jobId);
    scheduleScrapeJobPostCompleteWork(jobId);
    console.log(
      `[runScrapeJob ${jobId}] completed handle=@${cleanHandleForLog} reels=${finalReelCount} followers=${followerCount}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const failureReason =
      classifyThrownInstagramError(error) ??
      classifyScrapeFailureMessage(message);
    const logReason = instagramFailureLogReason(error, failureReason);
    console.warn(
      `[runScrapeJob ${jobId}] failed handle=@${handle.replace(/^@/, "").trim().toLowerCase()} reason=${logReason}: ${message}`
    );
    // Failure preserves the last progressPercent the UI saw — just flip the
    // terminal flags so the client can show the error state.
    await updateScrapeJob(jobId, {
      status: "failed",
      errorMessage: message,
      currentStep: "failed",
      failureReason,
    });
    // Refund vendor-side failures so quotas aren't burned on flakes the
    // user can't control. Keep the quota when the failure is the user's
    // input (handle_not_found, account_private, account_too_large).
    // Restricted media is Instagram withholding content after we found the
    // creator; refund so the user is not charged for an unusable result.
    if (shouldRefundInstagramFailure(error, failureReason)) {
      await refundScrapeQuota(`exception:${logReason}`);
    }
    // Schedule cleanup of the row ONLY when nothing useful was inserted.
    // If reels were already persisted before the exception, we must keep
    // the row so the user doesn't lose their data.
    const reelCountAfterFailure = await countReelsForJob(jobId);
    if (reelCountAfterFailure === 0) {
      scheduleFailedJobCleanup(`exception:${failureReason}`);
    }
  }
}


async function runResyncJob(
  jobId: number,
  handle: string,
  daysSinceSync: number
): Promise<void> {
  const cleanHandleForLog = handle.replace(/^@/, "").trim().toLowerCase();
  try {
    console.log(
      `[runResyncJob ${jobId}] start handle=@${cleanHandleForLog} daysSinceSync=${daysSinceSync}`
    );
    await updateScrapeJob(jobId, {
      currentStep: "connecting",
      progressPercent: 5,
    });
    await updateScrapeJob(jobId, {
      currentStep: "fetching_profile",
      progressPercent: 15,
    });

    const { reels: reelData, followerCount, profilePicUrl } =
      await runWithScrapeCallContext(
        { source: "resync_job", jobId, handle: cleanHandleForLog },
        () =>
          scrapeReels(
            handle,
            daysSinceSync,
            (count) => {
              updateScrapeJob(jobId, {
                currentStep: "pulling_reels",
                totalReels: count,
                reelsFound: count,
                progressPercent: Math.min(20 + Math.floor((count / 30) * 60), 80),
              }).catch(() => {});
            },
            { maxReels: 500, timeoutMs: 5 * 60 * 1000 }
          )
      );

    await updateScrapeJob(jobId, {
      currentStep: "ranking",
      progressPercent: 85,
    });

    const cleanHandle = handle.replace(/^@/, "").trim().toLowerCase();
    const proxiedPicUrl = await ensureProfilePicOnR2(
      cleanHandle,
      profilePicUrl
    );

    // Get existing shortcodes to deduplicate
    const existingShortcodes = new Set(await getExistingShortcodes(jobId));
    const newReels = reelData.filter(r => !existingShortcodes.has(r.shortcode));

    if (newReels.length > 0) {
      const stableThumbs = await uploadReelThumbnailsBounded(
        newReels.map((r) => ({ shortcode: r.shortcode, thumbnailUrl: r.thumbnailUrl }))
      );

      await insertReels(
        newReels.map((r) => ({
          jobId,
          shortcode: r.shortcode,
          caption: r.caption,
          viewCount: r.viewCount,
          likeCount: r.likeCount,
          commentCount: r.commentCount,
          thumbnailUrl: stableThumbs.get(r.shortcode) ?? r.thumbnailUrl,
          videoUrl: r.videoUrl ?? "",
          reelUrl: r.reelUrl,
          duration: r.duration,
          postedAt: r.postedAt,
          ownerUsername: r.ownerUsername,
        }))
      );
    }

    // Update total count (existing + new)
    const totalReels = existingShortcodes.size + newReels.length;
    await updateScrapeJobResync(jobId, {
      totalReels,
      followerCount,
      status: "completed",
      profilePicUrl: proxiedPicUrl || undefined,
    });
    await updateScrapeJob(jobId, {
      currentStep: "complete",
      reelsFound: totalReels,
      progressPercent: 100,
      errorMessage: null,
      failureReason: null,
    });

    console.log(`[Resync] @${handle}: ${newReels.length} new reels added (${totalReels} total)`);

    if (newReels.length > 0) {
      const insertedIds = await reelIdsForJobShortcodes(
        jobId,
        newReels.map((r) => r.shortcode)
      );
      if (insertedIds.length > 0) {
        scheduleScrapeReelPostCompleteWork(insertedIds, `runResyncJob ${jobId}`);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const failureReason =
      classifyThrownInstagramError(error) ??
      classifyScrapeFailureMessage(message);
    const existingReelCount = await countReelsForJob(jobId);
    console.warn(
      `[runResyncJob ${jobId}] failed handle=@${cleanHandleForLog} reason=${instagramFailureLogReason(error, failureReason)} existingReels=${existingReelCount}: ${message}`
    );
    await updateScrapeJob(jobId, {
      status: existingReelCount > 0 ? "completed" : "failed",
      errorMessage: message,
      currentStep: existingReelCount > 0 ? "complete" : "failed",
      failureReason,
      progressPercent: existingReelCount > 0 ? 100 : 0,
    });
  }
}


export const scrapeRouter = router({
    start: protectedProcedure
      .input(
        z
          .object({
            handle: z.string().min(1).max(128),
            timeframeDays: z.number().refine((v) => [30, 90, 180].includes(v)),
          })
          .superRefine((data, ctx) => {
            const norm = normalizeInstagramHandle(data.handle);
            if (!isValidInstagramHandleNormalized(norm)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: INSTAGRAM_HANDLE_INVALID_MESSAGE,
                path: ["handle"],
              });
            }
          })
      )
      .mutation(async ({ ctx, input }) => {
        // Check if handle already exists in monitoring
        const normalizedHandle = normalizeInstagramHandle(input.handle);
        const existingJobs = await getScrapeJobsByWorkspace(ctx.workspaceId);
        const existingRunningJob = existingJobs.find(
          (j) => j.handle.toLowerCase() === normalizedHandle && j.status === "running"
        );
        if (existingRunningJob) {
          const staleBefore = Date.now() - SCRAPE_JOB_STALE_MS;
          const lastTouch = new Date(existingRunningJob.updatedAt).getTime();
          if (Number.isFinite(lastTouch) && lastTouch >= staleBefore) {
            return { jobId: existingRunningJob.id, resumed: true as const };
          }
          // Zombie: process likely died mid-scrape. Fail it and start fresh.
          await updateScrapeJob(existingRunningJob.id, {
            status: "failed",
            errorMessage: SCRAPE_JOB_ZOMBIE_MESSAGE,
            currentStep: "failed",
            failureReason: "unknown",
          });
          console.warn(
            `[scrape.start] marked stale running job ${existingRunningJob.id} (@${normalizedHandle}) failed before starting a new scrape`
          );
        }
        const existingCompletedJob = existingJobs.find(
          (j) => j.handle.toLowerCase() === normalizedHandle && j.status === "completed"
        );
        if (existingCompletedJob) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `@${normalizedHandle} is already in your Creator Radar. Open Creator Radar and tap Refresh to pull new reels (fresh window from your last sync, not a full archive backfill).`,
          });
        }

        // Featured handles: seed cached catalog reels into the user's job
        // for instant dashboard display, then pull live reels in background.
        let featuredAccountId: number | undefined;
        const db = await getDb();
        if (db) {
          const featuredMatch = await db
            .select({ id: featuredAccounts.id })
            .from(featuredAccounts)
            .where(
              and(
                sql`LOWER(${featuredAccounts.handle}) = ${normalizedHandle}`,
                eq(featuredAccounts.isActive, true)
              )
            )
            .limit(1);
          if (featuredMatch.length > 0) {
            featuredAccountId = featuredMatch[0].id;
          }
        }

        // Check usage limit before starting
        const usageCheck = await checkUsageLimit(ctx.user.id, "scrapeCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You have reached your monthly account research limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }

        // Process-local OOM guard: refuse rather than queue a job that never starts.
        if (!tryAcquireScrapeSlot()) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message:
              "Too many scrapes running right now, try again in a few minutes",
          });
        }

        let launched = false;
        try {
          const jobId = await createScrapeJob({
            userId: ctx.user.id,
            handle: normalizedHandle,
            timeframeDays: input.timeframeDays,
            status: "running",
            currentStep: "connecting",
          });

          // Track usage. Refunded inside runScrapeJob when the failure is
          // vendor-side (rate limit / temporary restriction) so flaky scrapes
          // don't burn the user's monthly quota.
          await incrementUsage(ctx.user.id, "scrapeCount");

          let seededFromFeatured = false;
          if (featuredAccountId != null) {
            await seedFeaturedReelsIntoJob(
              jobId,
              featuredAccountId,
              input.timeframeDays
            );
            seededFromFeatured = true;
          }

          // Run scraping in background (releases the semaphore in finally).
          runScrapeJob(jobId, ctx.user.id, normalizedHandle, input.timeframeDays).catch((err) => {
            console.error(`Scrape job ${jobId} failed:`, err);
          });
          launched = true;

          return seededFromFeatured ? { jobId, seededFromFeatured: true as const } : { jobId };
        } finally {
          if (!launched) releaseScrapeSlot();
        }
      }),

    status: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        return job;
      }),

    /** Cancel an in-flight scrape owned by the current user. */
    cancel: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.userId !== ctx.user.id || job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
        if (job.status !== "running" && job.status !== "pending") {
          return { jobId: job.id, status: job.status };
        }
        await updateScrapeJob(job.id, {
          status: "failed",
          errorMessage: "Cancelled by user",
          currentStep: "failed",
          failureReason: "unknown",
        });
        return { jobId: job.id, status: "failed" as const };
      }),

    /**
     * Lightweight progress poll used by the dedicated scraping UI. Returns
     * just the fields needed for the multi-step view so we can hit this on
     * a 1.5s interval without shipping the full job row every time.
     */
    progress: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });
        return {
          status: job.status,
          currentStep: job.currentStep,
          reelsFound: job.reelsFound,
          estimatedTotal: job.estimatedTotal,
          progressPercent: job.progressPercent,
          errorMessage: job.errorMessage,
          failureReason: job.failureReason,
          handle: job.handle,
          timeframeDays: job.timeframeDays,
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const jobs = await getScrapeJobsByWorkspace(ctx.workspaceId);
      const db = await getDb();
      const jobIds = jobs.map((j) => j.id);

      type Rollup = {
        reelCountRollup: number;
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        avgEngagementPct: number | null;
      };
      const rollupMap = new Map<number, Rollup>();

      if (db && jobIds.length > 0) {
        const rollupRows = await db
          .select({
            jobId: reelsTable.jobId,
            reelCount: sql<number>`cast(count(*) as signed)`.mapWith(Number),
            totalViews: sql<number>`coalesce(sum(cast(${reelsTable.viewCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalLikes: sql<number>`coalesce(sum(cast(${reelsTable.likeCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalComments: sql<number>`coalesce(sum(cast(${reelsTable.commentCount} as signed)), 0)`.mapWith(
              Number
            ),
            avgEngagementPct: sql<number | null>`avg(
              (cast(${reelsTable.likeCount} as signed) + cast(${reelsTable.commentCount} as signed))
              / nullif(cast(${scrapeJobs.followerCount} as signed), 0) * 100
            )`,
          })
          .from(reelsTable)
          .innerJoin(scrapeJobs, eq(reelsTable.jobId, scrapeJobs.id))
          .where(and(inArray(reelsTable.jobId, jobIds), eq(scrapeJobs.workspaceId, ctx.workspaceId)))
          .groupBy(reelsTable.jobId);

        for (const row of rollupRows) {
          if (row.jobId == null) continue;
          const raw = row.avgEngagementPct;
          const n =
            raw == null ? null : typeof raw === "number" ? raw : Number.parseFloat(String(raw));
          rollupMap.set(row.jobId, {
            reelCountRollup: row.reelCount,
            totalViews: row.totalViews,
            totalLikes: row.totalLikes,
            totalComments: row.totalComments,
            avgEngagementPct: n != null && Number.isFinite(n) ? n : null,
          });
        }
      }

      // Hide failed scrapes that never produced reels — they're just
      // noise on Creator Radar (no metrics, no insights, retry path is
      // already available via "Spy A Creator"). Failed jobs that DID
      // collect reels (e.g. a refresh that failed after a successful
      // initial scrape) stay visible so the user keeps their data.
      // Running and completed jobs always pass through.
      return jobs
        .map((j) => ({
          ...j,
          reelStats: rollupMap.get(j.id) ?? null,
        }))
        .filter((j) => {
          if (j.status !== "failed") return true;
          const reelCount = j.reelStats?.reelCountRollup ?? 0;
          return reelCount > 0;
        });
    }),

    /** Delete a scrape job and its associated reels */
    delete: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });
        await deleteScrapeJob(input.jobId);
        return { success: true };
      }),

    /** Re-sync a completed scrape job — fetches only new reels since last sync */
    resync: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });
        if (job.status === "running") throw new TRPCError({ code: "BAD_REQUEST", message: "Job is already running" });

        // Calculate days since last sync (updatedAt) — only fetch reels from that period
        const lastSyncDate = new Date(job.updatedAt);
        const now = new Date();
        const daysSinceSync = Math.max(1, Math.ceil((now.getTime() - lastSyncDate.getTime()) / (1000 * 60 * 60 * 24)));

        await updateScrapeJob(input.jobId, {
          status: "pending",
          currentStep: "pending",
          progressPercent: 0,
          errorMessage: null,
          failureReason: null,
        });

        const queued = enqueueCreatorRadarRefresh(() =>
          runResyncJob(input.jobId, job.handle, daysSinceSync)
        );
        if (!queued) {
          await updateScrapeJob(input.jobId, {
            status: "completed",
            currentStep: "complete",
            progressPercent: 100,
            errorMessage: "Refresh queue is busy. Please try again shortly.",
          });
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many refreshes are queued. Please try again shortly.",
          });
        }

        return { jobId: input.jobId, daysSinceSync, queued: true as const };
      }),

    /** Preview an Instagram profile before scraping */
    profilePreview: protectedProcedure
      .input(z.object({ handle: z.string().min(1).max(128) }))
      .query(async ({ input }) => {
        try {
          const profile = await resolveInstagramIdentity(input.handle);
          const cleanHandle = normalizeInstagramHandle(profile.username);
          const proxiedPicUrl = await ensureProfilePicOnR2(
            cleanHandle,
            profile.profilePicUrl
          );
          return {
            found: true as const,
            username: profile.username,
            fullName: profile.fullName,
            biography: profile.biography,
            profilePicUrl: proxiedPicUrl,
            followerCount: profile.followerCount,
            followingCount: profile.followingCount,
            postCount: profile.postCount,
            isVerified: profile.isVerified,
            isPrivate: profile.isPrivate,
            category: profile.category,
            externalUrl: profile.externalUrl,
          };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Profile not found";
          return {
            found: false as const,
            error: message,
          };
        }
      }),
});
