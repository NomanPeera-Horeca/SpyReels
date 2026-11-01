import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { youtubeScrapeJobs, youtubeVideos } from "../../drizzle/schema";
import { getDb } from "../db";
import { clientIpFromRequest, isPublicIpRateLimited } from "../publicRateLimit";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { runYouTubeScrapeJob } from "../youtubeScrape/runJob";
import { scheduleCreatorRadarRefresh } from "../creatorRadarRefreshQueue";
import {
  loadFeaturedDemoProfilePreview,
  loadFeaturedDemoPublicPayload,
} from "../featuredDemo/publicDemo";
import { not, eq, desc, sql, and, inArray } from "drizzle-orm";
import { seedFromRecentResearch } from "../research/recentResearchSeed";



export const youtubeScrapeRouter = router({
    /**
     * Logged-out YouTube Shorts finder preview. DB-only catalog read from
     * `featured_demo_*` (daily refresh job). Never scrapes or mirrors on GET.
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

        const payload = await loadFeaturedDemoPublicPayload(
          "youtube",
          input?.handle
        );
        if (!payload) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This creator isn't available",
          });
        }
        return payload;
      }),

    /**
     * Unauthenticated YouTube channel card for the public finder hero.
     * Allow-listed demo handles only (featured_demo catalog). Never scrapes.
     */
    publicProfilePreview: publicProcedure
      .input(z.object({ handle: z.string().min(1).max(128) }))
      .query(async ({ ctx, input }) => {
        const ip = clientIpFromRequest(ctx.req);
        if (isPublicIpRateLimited(ip)) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: "Too many requests. Please try again in a minute.",
          });
        }
        return loadFeaturedDemoProfilePreview("youtube", input.handle);
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
        const insertResult = await db.insert(youtubeScrapeJobs).values({
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
            message: "Failed to create YouTube scrape job",
          });
        }

        await incrementUsage(ctx.user.id, "scrapeCount");

        // Anyone researched this creator recently: show those videos now. The
        // live run then replaces them in one step (keeping them if it fails).
        const seeded =
          (await seedFromRecentResearch({
            platform: "youtube",
            handle,
            jobId,
            workspaceId: ctx.workspaceId,
            timeframeDays,
          })) > 0;

        runYouTubeScrapeJob(
          jobId,
          ctx.user.id,
          ctx.workspaceId,
          handle,
          { timeframeDays, replaceExisting: seeded }
        ).catch((error) => {
          console.error(`YouTube scrape job ${jobId} failed:`, error);
        });

        return seeded ? { jobId, seededFromRecent: true as const } : { jobId };
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
          .from(youtubeScrapeJobs)
          .where(eq(youtubeScrapeJobs.id, input.jobId))
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
        .from(youtubeScrapeJobs)
        .where(eq(youtubeScrapeJobs.workspaceId, ctx.workspaceId))
        .orderBy(desc(youtubeScrapeJobs.createdAt));

      type Rollup = {
        reelCountRollup: number;
        totalViews: number;
        totalLikes: number;
        totalComments: number;
        avgEngagementPct: number | null;
      };
      const rollupMap = new Map<number, Rollup>();
      const jobIds = jobs.map((job) => job.id);

      if (jobIds.length > 0) {
        const rollupRows = await db
          .select({
            jobId: youtubeVideos.jobId,
            reelCount: sql<number>`cast(count(*) as signed)`.mapWith(Number),
            totalViews: sql<number>`coalesce(sum(cast(${youtubeVideos.viewCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalLikes: sql<number>`coalesce(sum(cast(${youtubeVideos.likeCount} as signed)), 0)`.mapWith(
              Number
            ),
            totalComments: sql<number>`coalesce(sum(cast(${youtubeVideos.commentCount} as signed)), 0)`.mapWith(
              Number
            ),
            avgEngagementPct: sql<number | null>`avg(
              (
                cast(${youtubeVideos.likeCount} as signed)
                + cast(${youtubeVideos.commentCount} as signed)
              )
              / nullif(cast(${youtubeScrapeJobs.subscriberCount} as signed), 0) * 100
            )`,
          })
          .from(youtubeVideos)
          .innerJoin(
            youtubeScrapeJobs,
            eq(youtubeVideos.jobId, youtubeScrapeJobs.id)
          )
          .where(
            and(
              inArray(youtubeVideos.jobId, jobIds),
              eq(youtubeScrapeJobs.workspaceId, ctx.workspaceId)
            )
          )
          .groupBy(youtubeVideos.jobId);

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
            avgEngagementPct: n != null && Number.isFinite(n) ? n : null,
          });
        }
      }

      return jobs.map((job) => ({
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
          .from(youtubeScrapeJobs)
          .where(eq(youtubeScrapeJobs.id, input.jobId))
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
          .from(youtubeVideos)
          .where(eq(youtubeVideos.jobId, input.jobId))
          .orderBy(desc(youtubeVideos.postedAt));

        return {
          subscriberCount: job.subscriberCount,
          videos: rows.map((video) => {
            const raw =
              job.subscriberCount > 0
                ? ((video.likeCount + video.commentCount) /
                    job.subscriberCount) *
                  100
                : 0;
            return {
              ...video,
              engagementRate: Math.round(raw * 100) / 100,
            };
          }),
        };
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
          .from(youtubeScrapeJobs)
          .where(eq(youtubeScrapeJobs.id, input.jobId))
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
          .update(youtubeScrapeJobs)
          .set({
            status: "pending",
            currentStep: "pending",
            progressPercent: 0,
            errorMessage: null,
          })
          .where(eq(youtubeScrapeJobs.id, job.id));

        try {
          await scheduleCreatorRadarRefresh({
            payload: {
              platform: "youtube",
              jobId: job.id,
              userId: ctx.user.id,
              workspaceId: ctx.workspaceId,
              handle: job.handle,
              timeframeDays: job.timeframeDays ?? 30,
            },
            runInline: () =>
              runYouTubeScrapeJob(
                job.id,
                ctx.user.id,
                ctx.workspaceId,
                job.handle,
                {
                  timeframeDays: job.timeframeDays ?? 30,
                  replaceExisting: true,
                }
              ),
          });
        } catch (error) {
          if (
            error instanceof TRPCError &&
            error.code === "TOO_MANY_REQUESTS"
          ) {
            await db
              .update(youtubeScrapeJobs)
              .set({
                status: "completed",
                currentStep: "complete",
                progressPercent: 100,
                errorMessage: "Refresh queue is busy. Please try again shortly.",
              })
              .where(eq(youtubeScrapeJobs.id, job.id));
          }
          throw error;
        }

        return { jobId: job.id, daysSinceSync, queued: true as const };
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
          .from(youtubeScrapeJobs)
          .where(eq(youtubeScrapeJobs.id, input.jobId))
          .limit(1);
        const job = jobRows[0];
        if (!job) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        }
        if (job.workspaceId !== ctx.workspaceId) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        await db
          .delete(youtubeVideos)
          .where(eq(youtubeVideos.jobId, input.jobId));
        await db
          .delete(youtubeScrapeJobs)
          .where(eq(youtubeScrapeJobs.id, input.jobId));
        return { success: true };
      }),
});
