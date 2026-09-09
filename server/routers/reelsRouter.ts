import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { reelNicheInputEnum } from "../reelNicheInputEnum";
import { reels as reelsTable } from "../../drizzle/schema";
import type { Reel } from "../../drizzle/schema";
import { accountEngagementRatePercent } from "../accountEngagementRate";
import { getScrapeJob, getReelsByJobId, getTranscriptionsByJobId, getReelById, getDb } from "../db";
import { fetchReelByShortcode } from "../instagram";
import { scheduleReelVideoMirror } from "../reelVideoR2";
import { not, eq } from "drizzle-orm";

export const reelsRouter = router({
    list: protectedProcedure
      .input(
        z.object({
          jobId: z.number(),
          niche: reelNicheInputEnum.optional(),
        })
      )
      .query(async ({ ctx, input }) => {
        const job = await getScrapeJob(input.jobId);
        if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "Job not found" });
        if (job.workspaceId !== ctx.workspaceId) throw new TRPCError({ code: "FORBIDDEN" });
        const reelsList = await getReelsByJobId(input.jobId, input.niche as NonNullable<Reel["niche"]>);
        const transcriptionsList = await getTranscriptionsByJobId(input.jobId);
        const transcriptionMap = new Map(
          transcriptionsList.map((t) => [t.reelId, t])
        );
        const followerCount = job?.followerCount || 0;

        return {
          followerCount,
          reels: reelsList.map((r) => ({
            ...r,
            engagementRate: accountEngagementRatePercent(
              r.likeCount,
              r.commentCount,
              followerCount
            ),
            transcription: transcriptionMap.get(r.id) || null,
          })),
        };
      }),

    /** Fetch a fresh Instagram video URL for playback; mirror to R2 in the background. */
    refreshVideoUrl: protectedProcedure
      .input(
        z.object({
          shortcode: z.string().min(1),
          reelId: z.number().optional(),
        })
      )
      .mutation(async ({ ctx, input }) => {
        const shortcode = input.shortcode.trim();
        const publicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");

        if (input.reelId != null) {
          const reel = await getReelById(input.reelId);
          if (!reel) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Reel not found" });
          }
          // jobId 0 = collected / viral-post mirrors (no scrape_jobs row).
          if (reel.jobId !== 0) {
            const job = await getScrapeJob(reel.jobId);
            if (!job || job.workspaceId !== ctx.workspaceId) {
              throw new TRPCError({ code: "FORBIDDEN" });
            }
          } else if (reel.workspaceId !== ctx.workspaceId) {
            const { isViralMirroredReelId } = await import(".././viralPosts/ensureMirrorReel");
            const viralOk = await isViralMirroredReelId(input.reelId);
            if (!viralOk) {
              throw new TRPCError({ code: "FORBIDDEN" });
            }
          }
          const existing = (reel.videoUrl ?? "").trim();
          if (publicBase && existing.startsWith(publicBase)) {
            return { videoUrl: existing };
          }
        }

        const freshData = await fetchReelByShortcode(shortcode, {
          mode: "interactive",
        });
        if (!freshData?.videoUrl?.trim()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Could not retrieve a fresh video URL for this reel.",
          });
        }

        const videoUrl = freshData.videoUrl.trim();

        if (input.reelId != null) {
          scheduleReelVideoMirror(input.reelId, shortcode, videoUrl);
          const db = await getDb();
          if (db) {
            const { reels: reelsTable } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db
              .update(reelsTable)
              .set({ videoUrl })
              .where(eq(reelsTable.id, input.reelId));
          }
        }

        return { videoUrl };
      }),
});
