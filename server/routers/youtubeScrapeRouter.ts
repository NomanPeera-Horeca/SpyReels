import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { youtubeScrapeJobs, youtubeVideos } from "../../drizzle/schema";
import { getDb } from "../db";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { runYouTubeScrapeJob } from "../youtubeScrape/runJob";
import { not, eq, desc, sql, and, inArray } from "drizzle-orm";



export const youtubeScrapeRouter = router({
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

        runYouTubeScrapeJob(
          jobId,
          ctx.user.id,
          ctx.workspaceId,
          handle,
          { timeframeDays }
        ).catch((error) => {
          console.error(`YouTube scrape job ${jobId} failed:`, error);
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
