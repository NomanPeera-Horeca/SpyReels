import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { tiktokScrapeJobs, tiktokVideos } from "../../drizzle/schema";
import { getDb } from "../db";
import { clientIpFromRequest, isPublicIpRateLimited } from "../publicRateLimit";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { scrapeTikTokVideos, fetchTikTokVideoInfo } from "../tiktok";
import { mirrorTiktokThumbnailsBounded } from "../tiktokScrape/mediaMirror";
import { repairTikTokProfilePicsBounded } from "../tiktokScrape/repairProfilePics";
import { runTikTokScrapeJob } from "../tiktokScrape/runJob";
import { isDurableTiktokVideoUrl, scheduleTiktokVideoMirror } from "../tiktokVideoR2";
import { PUBLIC_TIKTOK_DEMO_HANDLES, PUBLIC_TIKTOK_DEMO_VIDEO_LIMIT, isPublicTikTokDemoHandle } from "@shared/publicTikTokDemoAccounts";
import { not, eq, desc, sql, and, inArray, or } from "drizzle-orm";
import { PUBLIC_TIKTOK_DEMO_CACHE_TTL_MS, PUBLIC_TIKTOK_DEMO_EMPTY_CACHE_TTL_MS, PublicTikTokDemoPayload, publicTikTokDemoCache, emptyPublicTikTokDemoPayload, readPublicTikTokDemoCache, writePublicTikTokDemoCache } from "./_shared";



export const tiktokScrapeRouter = router({
    /**
     * Logged-out TikTok finder landing preview. Allow-list only
     * (`PUBLIC_TIKTOK_DEMO_HANDLES`), capped at `PUBLIC_TIKTOK_DEMO_VIDEO_LIMIT`,
     * display fields only — never videoUrl / download URLs.
     */
    publicDemo: publicProcedure
      .input(z.object({ handle: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const ip = clientIpFromRequest(ctx.req);
        if (isPublicIpRateLimited(ip)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many requests. Please try again in a minute.",
          });
        }

        const requested = (input?.handle ?? "")
          .replace(/^@/, "")
          .trim()
          .toLowerCase();
        const tryOrder: string[] = [];
        if (isPublicTikTokDemoHandle(requested)) tryOrder.push(requested);
        for (const h of PUBLIC_TIKTOK_DEMO_HANDLES) {
          if (!tryOrder.includes(h)) tryOrder.push(h);
        }

        for (const handle of tryOrder) {
          const cached = readPublicTikTokDemoCache(handle);
          if (cached) {
            if (cached.videos.length > 0) return cached;
            continue;
          }

          try {
            const result = await scrapeTikTokVideos(handle, undefined, {
              maxVideos: Math.max(PUBLIC_TIKTOK_DEMO_VIDEO_LIMIT * 3, 24),
              timeoutMs: 45_000,
            });

            const sorted = [...result.videos].sort(
              (a, b) => b.viewCount - a.viewCount
            );
            const top = sorted.slice(0, PUBLIC_TIKTOK_DEMO_VIDEO_LIMIT);
            if (top.length === 0) {
              writePublicTikTokDemoCache(handle, emptyPublicTikTokDemoPayload(handle));
              continue;
            }

            const mirrored = await mirrorTiktokThumbnailsBounded(
              top.map((v) => ({
                awemeId: v.awemeId,
                thumbnailUrl: v.thumbnailUrl,
              }))
            );

            const viewCounts = result.videos
              .map((v) => v.viewCount)
              .filter((n) => Number.isFinite(n) && n > 0)
              .sort((a, b) => a - b);
            let medianViewCount = 0;
            if (viewCounts.length > 0) {
              const mid = Math.floor(viewCounts.length / 2);
              medianViewCount =
                viewCounts.length % 2 === 0
                  ? Math.round(
                      (viewCounts[mid - 1]! + viewCounts[mid]!) / 2
                    )
                  : viewCounts[mid]!;
            }

            const followerCount = result.followerCount || 0;
            const payload: PublicTikTokDemoPayload = {
              handle: result.videos[0]?.ownerUsername || handle,
              totalVideoCount: result.videos.length,
              medianViewCount,
              followerCount,
              videos: top.map((v) => ({
                id: v.awemeId,
                awemeId: v.awemeId,
                caption: v.caption ?? "",
                viewCount: v.viewCount,
                likeCount: v.likeCount,
                commentCount: v.commentCount,
                shareCount: v.shareCount,
                engagementRate:
                  followerCount > 0
                    ? Math.round(
                        ((v.likeCount + v.commentCount + v.shareCount) /
                          followerCount) *
                          10000
                      ) / 100
                    : 0,
                thumbnailUrl: mirrored.get(v.awemeId) || v.thumbnailUrl || "",
                durationSec: v.durationSec,
                postedAt: v.postedAt,
                videoPageUrl: v.videoPageUrl,
              })),
            };

            writePublicTikTokDemoCache(handle, payload);
            return payload;
          } catch (err) {
            console.warn(
              `[tiktokScrape.publicDemo] handle=@${handle} failed:`,
              err instanceof Error ? err.message : err
            );
            writePublicTikTokDemoCache(handle, emptyPublicTikTokDemoPayload(handle));
            continue;
          }
        }

        throw new TRPCError({
          code: "NOT_FOUND",
          message: "This creator isn't available",
        });
      }),

    start: protectedProcedure
      .input(
        z.object({
          handle: z.string().min(1).max(128),
          timeframe: z.enum(["30", "90", "180"]).default("30"),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const usageCheck = await checkUsageLimit(
          ctx.user.id,
          "scrapeCount",
          ctx.user.openId
        );
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You have reached your monthly account research limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
          });
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const handle = input.handle.replace(/^@/, "").trim().toLowerCase();
        const timeframeDays = Number(input.timeframe);
        const insertResult = await db.insert(tiktokScrapeJobs).values({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          handle,
          status: "pending",
          timeframeDays,
        });
        const jobId = insertResult[0].insertId;
        if (!jobId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create TikTok scrape job",
          });
        }

        await incrementUsage(ctx.user.id, "scrapeCount");

        runTikTokScrapeJob(
          jobId,
          ctx.user.id,
          ctx.workspaceId,
          handle,
          { timeframeDays }
        ).catch((error) => {
          console.error(`TikTok scrape job ${jobId} failed:`, error);
        });

        return { jobId };
      }),

    progress: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const rows = await db
          .select()
          .from(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, input.jobId))
          .limit(1);
        const job = rows[0];
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        return {
          status: job.status,
          currentStep: job.currentStep,
          videosFound: job.videosFound,
          estimatedTotal: job.estimatedTotal,
          progressPercent: job.progressPercent,
          errorMessage: job.errorMessage,
          handle: job.handle,
          timeframeDays: job.timeframeDays,
        };
      }),

    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Database not available",
        });
      }

      const jobs = await db
        .select()
        .from(tiktokScrapeJobs)
        .where(eq(tiktokScrapeJobs.workspaceId, ctx.workspaceId))
        .orderBy(desc(tiktokScrapeJobs.createdAt));

      type Rollup = {
        reelCountRollup: number;
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        totalShares: number;
        avgEngagementPct: number | null;
      };
      const rollupMap = new Map<number, Rollup>();
      const jobIds = jobs.map((job) => job.id);

      if (jobIds.length > 0) {
        const rollupRows = await db
          .select({
            jobId: tiktokVideos.jobId,
            reelCount: sql<number>`cast(count(*) as signed)`.mapWith(Number),
            totalViews: sql<number>`coalesce(sum(cast(${tiktokVideos.viewCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalLikes: sql<number>`coalesce(sum(cast(${tiktokVideos.likeCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalComments: sql<number>`coalesce(sum(cast(${tiktokVideos.commentCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalShares: sql<number>`coalesce(sum(cast(${tiktokVideos.shareCount} as signed)), 0)`.mapWith(
              Number
            ),
            avgEngagementPct: sql<number | null>`avg(
              (
                cast(${tiktokVideos.likeCount} as signed)
                + cast(${tiktokVideos.commentCount} as signed)
                + cast(${tiktokVideos.shareCount} as signed)
              )
              / nullif(cast(${tiktokScrapeJobs.followerCount} as signed), 0) * 100
            )`,
          })
          .from(tiktokVideos)
          .innerJoin(tiktokScrapeJobs, eq(tiktokVideos.jobId, tiktokScrapeJobs.id))
          .where(
            and(
              inArray(tiktokVideos.jobId, jobIds),
              eq(tiktokScrapeJobs.workspaceId, ctx.workspaceId)
            )
          )
          .groupBy(tiktokVideos.jobId);

        for (const row of rollupRows) {
          if (row.jobId == null) continue;
          const raw = row.avgEngagementPct;
          const n =
            raw == null
              ? null
              : typeof raw === "number"
                ? raw
                : Number.parseFloat(String(raw));
          rollupMap.set(row.jobId, {
            reelCountRollup: row.reelCount,
            totalViews: row.totalViews,
            totalLikes: row.totalLikes,
            totalComments: row.totalComments,
            totalShares: row.totalShares,
            avgEngagementPct: n != null && Number.isFinite(n) ? n : null,
          });
        }
      }

      const repaired = await repairTikTokProfilePicsBounded(jobs);
      const jobsWithPics = repaired.size
        ? jobs.map((job) => {
            const next = repaired.get(job.id);
            return next ? { ...job, profilePicUrl: next } : job;
          })
        : jobs;

      return jobsWithPics.map((job) => ({
        ...job,
        reelStats: rollupMap.get(job.id) ?? null,
      }));
    }),

    videos: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .query(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const jobRows = await db
          .select()
          .from(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, input.jobId))
          .limit(1);
        const job = jobRows[0];
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const rows = await db
          .select()
          .from(tiktokVideos)
          .where(eq(tiktokVideos.jobId, input.jobId))
          .orderBy(desc(tiktokVideos.postedAt));

        return {
          followerCount: job.followerCount,
          videos: rows.map((video) => {
            const raw =
              job.followerCount > 0
                ? ((video.likeCount +
                    video.commentCount +
                    video.shareCount) /
                    job.followerCount) *
                  100
                : 0;
            return {
              ...video,
              engagementRate: Math.round(raw * 100) / 100,
            };
          }),
        };
      }),

    /** Fresh TikTok play URL for modal preview; mirror to R2 in the background. */
    refreshVideoUrl: protectedProcedure
      .input(
        z.object({
          videoId: z.number().optional(),
          videoPageUrl: z.string().url().optional(),
        }).refine(
          (v) => v.videoId != null || Boolean(v.videoPageUrl?.trim()),
          { message: "videoId or videoPageUrl required" }
        )
      )
      .mutation(async ({ ctx, input }) => {
        const pageOnly = (input.videoPageUrl ?? "").trim();
        if (input.videoId == null) {
          if (!pageOnly) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "videoPageUrl required",
            });
          }
          const fresh = await fetchTikTokVideoInfo(pageOnly, {
            mode: "interactive",
          });
          const videoUrl = fresh?.videoUrl?.trim() || "";
          if (!videoUrl) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Could not retrieve a fresh video URL for this TikTok.",
            });
          }
          return { videoUrl };
        }

        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const [video] = await db
          .select()
          .from(tiktokVideos)
          .where(eq(tiktokVideos.id, input.videoId))
          .limit(1);
        if (!video) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
        }

        const [job] = await db
          .select()
          .from(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, video.jobId))
          .limit(1);
        if (!job || job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const existing = (video.videoUrl ?? "").trim();
        const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(
          /\/+$/,
          ""
        );
        if (
          (publicBase && existing.startsWith(publicBase)) ||
          isDurableTiktokVideoUrl(existing)
        ) {
          return { videoUrl: existing };
        }

        const pageCandidates = [
          pageOnly,
          (video.videoPageUrl ?? "").trim(),
          video.ownerUsername && video.awemeId
            ? `https://www.tiktok.com/@${video.ownerUsername.replace(/^@/, "")}/video/${video.awemeId}`
            : "",
        ].filter((u, i, arr) => u && arr.indexOf(u) === i);

        let freshUrl = "";
        for (const pageUrl of pageCandidates) {
          const fresh = await fetchTikTokVideoInfo(pageUrl, {
            mode: "interactive",
          });
          if (fresh?.videoUrl?.trim()) {
            freshUrl = fresh.videoUrl.trim();
            break;
          }
        }

        if (!freshUrl) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not retrieve a fresh video URL for this TikTok.",
          });
        }

        const videoUrl = freshUrl;
        scheduleTiktokVideoMirror(video.id, video.awemeId, videoUrl);
        await db
          .update(tiktokVideos)
          .set({ videoUrl })
          .where(eq(tiktokVideos.id, video.id));

        return { videoUrl };
      }),

    /** Refresh an existing Creator Radar session without losing its last good data. */
    resync: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const [job] = await db
          .select()
          .from(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, input.jobId))
          .limit(1);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });
        if (job.status === "running" || job.status === "pending") {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Refresh is already running" });
        }

        const daysSinceSync = Math.max(
          1,
          Math.ceil((Date.now() - new Date(job.updatedAt).getTime()) / 86_400_000)
        );
        await db
          .update(tiktokScrapeJobs)
          .set({
            status: "running",
            currentStep: "connecting",
            progressPercent: 5,
            errorMessage: null,
          })
          .where(eq(tiktokScrapeJobs.id, job.id));

        runTikTokScrapeJob(
          job.id,
          ctx.user.id,
          ctx.workspaceId,
          job.handle,
          {
            timeframeDays: job.timeframeDays ?? 30,
            replaceExisting: true,
          }
        ).catch((error) => {
          console.error(`TikTok refresh job ${job.id} failed:`, error);
        });

        return { jobId: job.id, daysSinceSync };
      }),

    delete: protectedProcedure
      .input(z.object({ jobId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }

        const jobRows = await db
          .select()
          .from(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, input.jobId))
          .limit(1);
        const job = jobRows[0];
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        await db
          .delete(tiktokVideos)
          .where(eq(tiktokVideos.jobId, input.jobId));
        await db
          .delete(tiktokScrapeJobs)
          .where(eq(tiktokScrapeJobs.id, input.jobId));
        return { success: true };
      }),
});
