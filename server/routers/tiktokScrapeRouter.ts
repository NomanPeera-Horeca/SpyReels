import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "../_core/trpc";
import { tiktokScrapeJobs, tiktokVideos } from "../../drizzle/schema";
import { getDb } from "../db";
import { clientIpFromRequest, isPublicIpRateLimited } from "../publicRateLimit";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { fetchTikTokVideoInfo, fetchTikTokProfile } from "../tiktok";
import { ensureProfilePicOnR2 } from "../profilePicR2";
import { repairTikTokProfilePicsBounded } from "../tiktokScrape/repairProfilePics";
import { runTikTokScrapeJob } from "../tiktokScrape/runJob";
import { scheduleCreatorRadarRefresh } from "../creatorRadarRefreshQueue";
import { isDurableTiktokVideoUrl, scheduleTiktokVideoMirror } from "../tiktokVideoR2";
import { loadFeaturedDemoPublicPayload } from "../featuredDemo/publicDemo";
import { not, eq, desc, sql, and, inArray, or } from "drizzle-orm";
import { PublicTikTokDemoPayload } from "./_shared";
import {
  isValidTikTokHandleNormalized,
  normalizeTikTokHandle,
  TIKTOK_HANDLE_INVALID_MESSAGE,
} from "../../shared/socialHandles";
import { seedFromRecentResearch } from "../research/recentResearchSeed";

type PublicTikTokProfilePreviewPayload =
  | {
      found: true;
      username: string;
      fullName: string;
      biography: string;
      profilePicUrl: string;
      followerCount: number;
      followingCount: number;
      postCount: number;
      heartCount: number;
      isVerified: boolean;
      isPrivate: boolean;
    }
  | {
      found: false;
      error: string;
    };

const PUBLIC_TIKTOK_PROFILE_PREVIEW_TTL_MS = 5 * 60_000;

const publicTikTokProfilePreviewCache = new Map<
  string,
  { expiresAt: number; payload: PublicTikTokProfilePreviewPayload }
>();

function normalizePublicTikTokHandle(raw: string): string {
  return normalizeTikTokHandle(raw);
}

function isValidPublicTikTokHandle(handle: string): boolean {
  return isValidTikTokHandleNormalized(handle);
}

function readPublicTikTokProfilePreviewCache(
  handle: string
): PublicTikTokProfilePreviewPayload | null {
  const hit = publicTikTokProfilePreviewCache.get(handle);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    publicTikTokProfilePreviewCache.delete(handle);
    return null;
  }
  return hit.payload;
}

function writePublicTikTokProfilePreviewCache(
  handle: string,
  payload: PublicTikTokProfilePreviewPayload
): void {
  publicTikTokProfilePreviewCache.set(handle, {
    expiresAt: Date.now() + PUBLIC_TIKTOK_PROFILE_PREVIEW_TTL_MS,
    payload,
  });
}

export const tiktokScrapeRouter = router({
    /**
     * Logged-out TikTok finder landing preview. DB-only catalog read from
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
          "tiktok",
          input?.handle
        );
        if (!payload) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "This creator isn't available",
          });
        }
        return payload as PublicTikTokDemoPayload;
      }),

    /**
     * Unauthenticated TikTok profile lookup for the public finder hero.
     * Same interaction contract as `featured.publicProfilePreview`: rate-limited,
     * short in-memory cache, display fields only.
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

        const normalized = normalizePublicTikTokHandle(input.handle);
        if (!isValidPublicTikTokHandle(normalized)) {
          return {
            found: false as const,
            error: TIKTOK_HANDLE_INVALID_MESSAGE,
          };
        }

        const cached = readPublicTikTokProfilePreviewCache(normalized);
        if (cached) return cached;

        try {
          const profile = await fetchTikTokProfile(normalized);
          const cleanHandle = normalizePublicTikTokHandle(profile.uniqueId || normalized);
          const proxiedPicUrl = await ensureProfilePicOnR2(
            cleanHandle,
            profile.avatarUrl,
            "tiktok"
          );
          const payload = {
            found: true as const,
            username: profile.uniqueId || cleanHandle,
            fullName: profile.nickname,
            biography: profile.biography,
            profilePicUrl: proxiedPicUrl,
            followerCount: profile.followerCount,
            followingCount: profile.followingCount,
            postCount: profile.videoCount,
            heartCount: profile.heartCount,
            isVerified: profile.isVerified,
            isPrivate: profile.isPrivate,
          };
          writePublicTikTokProfilePreviewCache(normalized, payload);
          return payload;
        } catch (err: unknown) {
          const message =
            err instanceof Error ? err.message : "Profile not found";
          const payload = {
            found: false as const,
            error: message,
          };
          writePublicTikTokProfilePreviewCache(normalized, payload);
          return payload;
        }
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

        // Anyone researched this creator recently: show those videos now. The
        // live run then replaces them in one step (keeping them if it fails).
        const seeded =
          (await seedFromRecentResearch({
            platform: "tiktok",
            handle,
            jobId,
            workspaceId: ctx.workspaceId,
            timeframeDays,
          })) > 0;

        runTikTokScrapeJob(
          jobId,
          ctx.user.id,
          ctx.workspaceId,
          handle,
          { timeframeDays, replaceExisting: seeded }
        ).catch((error) => {
          console.error(`TikTok scrape job ${jobId} failed:`, error);
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
            status: "pending",
            currentStep: "pending",
            progressPercent: 0,
            errorMessage: null,
          })
          .where(eq(tiktokScrapeJobs.id, job.id));

        try {
          await scheduleCreatorRadarRefresh({
            payload: {
              platform: "tiktok",
              jobId: job.id,
              userId: ctx.user.id,
              workspaceId: ctx.workspaceId,
              handle: job.handle,
              timeframeDays: job.timeframeDays ?? 30,
            },
            runInline: () =>
              runTikTokScrapeJob(
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
              .update(tiktokScrapeJobs)
              .set({
                status: "completed",
                currentStep: "complete",
                progressPercent: 100,
                errorMessage: "Refresh queue is busy. Please try again shortly.",
              })
              .where(eq(tiktokScrapeJobs.id, job.id));
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
