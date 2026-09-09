import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { transcriptions, tiktokVideos, youtubeVideos } from "../../drizzle/schema";
import type { User, Transcription } from "../../drizzle/schema";
import { analyzeHook } from "../analyzeHook";
import { assertUserScrapeReelInWorkspace } from "../assertUserScrapeReelInWorkspace";
import { getFeaturedReelById, updateFeaturedReelTranscription, getDb, getTranscriptionByTiktokVideoId, createTranscription, getTranscriptionByYoutubeVideoId, getTranscriptionByReelId, getTranscriptionByFeaturedReelId } from "../db";
import { runFeaturedReelTranscription, runTranscription } from "./_shared";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { runTikTokTranscription } from "../tiktokScrape/runTranscription";
import { getActiveTranscriptions, MAX_CONCURRENT_TRANSCRIPTIONS } from "../transcriptionSemaphore";
import { fetchYouTubeTranscript } from "../youtube";
import { or, and, not, eq } from "drizzle-orm";
import { isFirstRemakeUsageBypassEligible } from "./_shared";



export const transcribeRouter = router({
    start: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .mutation(async ({ ctx, input }) => {
        const source: "user" | "featured" | "tiktok" | "youtube" =
          input.featuredReelId != null
            ? "featured"
            : input.tiktokVideoId != null
              ? "tiktok"
              : input.youtubeVideoId != null
                ? "youtube"
                : "user";

        // ────────────────────────────────────────────────────────────
        // Featured branch — cache-first (Commit 4b). The catalog owns
        // a single shared transcript per reel in `featured_reels`, so:
        //  1. If the cache is warm (completed / no_speech), return
        //     immediately. No usage burn, no Deepgram call, no row
        //     in `transcriptions`.
        //  2. If another user is already transcribing (`processing`),
        //     return the same key so the UI polls the same cache.
        //  3. Otherwise, kick off Deepgram in the background and
        //     mark the cache `processing`. Retry path clears a prior
        //     `failed` before re-kicking.
        // ────────────────────────────────────────────────────────────
        if (source === "featured") {
          const fr = await getFeaturedReelById(input.featuredReelId!);
          if (!fr) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Featured reel not found" });
          }
          if (
            fr.transcriptionStatus === "completed" ||
            fr.transcriptionStatus === "no_speech"
          ) {
            return { transcriptionId: fr.id, status: "completed" as const };
          }
          if (fr.transcriptionStatus === "processing") {
            return {
              transcriptionId: fr.id,
              status: "processing" as const,
              queuePending: false,
            };
          }

          // pending | failed → charge usage + kick Deepgram.
          const bypassTranscribeLimit = await isFirstRemakeUsageBypassEligible(
            ctx.user.id,
            ctx.user.hasCompletedFirstSpy,
            "transcribeCount"
          );
          if (!bypassTranscribeLimit) {
            const usageCheck = await checkUsageLimit(
              ctx.user.id,
              "transcribeCount",
              ctx.user.openId
            );
            if (!usageCheck.allowed) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: `You've reached your monthly transcription limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
              });
            }
          }
          const queuePending =
            getActiveTranscriptions() >= MAX_CONCURRENT_TRANSCRIPTIONS;
          await updateFeaturedReelTranscription(fr.id, {
            transcriptionStatus: "processing",
          });
          await incrementUsage(ctx.user.id, "transcribeCount");
          runFeaturedReelTranscription({
            id: fr.id,
            shortcode: fr.reelShortcode,
            videoUrl: fr.videoUrl,
          }).catch((err) => {
            console.error(`Featured transcription ${fr.id} failed:`, err);
          });
          return {
            transcriptionId: fr.id,
            status: "processing" as const,
            queuePending,
          };
        }

        if (source === "tiktok") {
          const db = await getDb();
          if (!db) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database not available",
            });
          }

          const rows = await db
            .select()
            .from(tiktokVideos)
            .where(eq(tiktokVideos.id, input.tiktokVideoId!))
            .limit(1);
          const video = rows[0];
          if (!video) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "TikTok video not found",
            });
          }
          if (video.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }

          const existing = await getTranscriptionByTiktokVideoId(video.id);
          if (existing && existing.status === "completed") {
            return {
              transcriptionId: existing.id,
              status: "completed" as const,
            };
          }
          if (existing && existing.status === "processing") {
            return {
              transcriptionId: existing.id,
              status: "processing" as const,
              queuePending: false,
            };
          }

          const bypassTranscribeLimit =
            await isFirstRemakeUsageBypassEligible(
              ctx.user.id,
              ctx.user.hasCompletedFirstSpy,
              "transcribeCount"
            );
          if (!bypassTranscribeLimit) {
            const usageCheck = await checkUsageLimit(
              ctx.user.id,
              "transcribeCount",
              ctx.user.openId
            );
            if (!usageCheck.allowed) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: `You've reached your monthly transcription limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
              });
            }
          }

          if (existing && existing.status === "failed") {
            await db
              .delete(transcriptions)
              .where(eq(transcriptions.id, existing.id));
          }

          const transcriptionId = await createTranscription({
            reelId: null,
            featuredReelId: null,
            tiktokVideoId: video.id,
            workspaceId: ctx.workspaceId,
            status: "processing",
            queuedAt: new Date(),
          });

          await incrementUsage(ctx.user.id, "transcribeCount");

          const queuePending =
            getActiveTranscriptions() >= MAX_CONCURRENT_TRANSCRIPTIONS;
          runTikTokTranscription(transcriptionId, {
            id: video.id,
            awemeId: video.awemeId,
            videoUrl: video.videoUrl,
            videoPageUrl: video.videoPageUrl,
            caption: video.caption,
            thumbnailUrl: video.thumbnailUrl,
          }).catch((error) => {
            console.error(
              `TikTok transcription ${transcriptionId} failed:`,
              error
            );
          });

          return {
            transcriptionId,
            status: "processing" as const,
            queuePending,
          };
        }

        if (source === "youtube") {
          const db = await getDb();
          if (!db) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Database not available",
            });
          }

          const rows = await db
            .select()
            .from(youtubeVideos)
            .where(eq(youtubeVideos.id, input.youtubeVideoId!))
            .limit(1);
          const video = rows[0];
          if (!video) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "YouTube video not found",
            });
          }
          if (video.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }

          const existing = await getTranscriptionByYoutubeVideoId(video.id);
          if (existing && existing.status === "completed") {
            return {
              transcriptionId: existing.id,
              status: "completed" as const,
            };
          }

          const bypassTranscribeLimit =
            await isFirstRemakeUsageBypassEligible(
              ctx.user.id,
              ctx.user.hasCompletedFirstSpy,
              "transcribeCount"
            );
          if (!bypassTranscribeLimit) {
            const usageCheck = await checkUsageLimit(
              ctx.user.id,
              "transcribeCount",
              ctx.user.openId
            );
            if (!usageCheck.allowed) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: `You've reached your monthly transcription limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
              });
            }
          }

          if (
            existing &&
            (existing.status === "failed" || existing.status === "processing")
          ) {
            await db
              .delete(transcriptions)
              .where(eq(transcriptions.id, existing.id));
          }

          const transcriptResult = await fetchYouTubeTranscript(
            video.videoPageUrl
          );

          if (!transcriptResult) {
            const transcriptionId = await createTranscription({
              reelId: null,
              featuredReelId: null,
              tiktokVideoId: null,
              youtubeVideoId: video.id,
              workspaceId: ctx.workspaceId,
              transcript: "",
              segments: [],
              hookAnalysis: "",
              status: "completed",
              queuedAt: new Date(),
              startedAt: new Date(),
            });
            await incrementUsage(ctx.user.id, "transcribeCount");
            return {
              transcriptionId,
              status: "completed" as const,
            };
          }

          const hookAnalysis = await analyzeHook(
            transcriptResult.transcript,
            video.title || video.description || "",
            video.thumbnailUrl || "",
            transcriptResult.segments,
            "YouTube Short"
          );

          const transcriptionId = await createTranscription({
            reelId: null,
            featuredReelId: null,
            tiktokVideoId: null,
            youtubeVideoId: video.id,
            workspaceId: ctx.workspaceId,
            transcript: transcriptResult.transcript,
            segments: transcriptResult.segments,
            hookAnalysis,
            status: "completed",
            queuedAt: new Date(),
            startedAt: new Date(),
          });

          await incrementUsage(ctx.user.id, "transcribeCount");

          return {
            transcriptionId,
            status: "completed" as const,
          };
        }

        // ────────────────────────────────────────────────────────────
        // User-scrape branch — unchanged behavior. Each user owns
        // their own row in `transcriptions`.
        // ────────────────────────────────────────────────────────────
        const reel = await assertUserScrapeReelInWorkspace(input.reelId!, ctx);
        const reelForRun = {
          id: reel.id,
          shortcode: reel.shortcode,
          videoUrl: reel.videoUrl,
          caption: reel.caption,
          thumbnailUrl: reel.thumbnailUrl,
        };

        const existing = await getTranscriptionByReelId(input.reelId!);
        if (existing && existing.status === "completed") {
          return { transcriptionId: existing.id, status: "completed" as const };
        }
        if (existing && existing.status === "processing") {
          return {
            transcriptionId: existing.id,
            status: "processing" as const,
            queuePending: false,
          };
        }

        const bypassTranscribeLimit = await isFirstRemakeUsageBypassEligible(
          ctx.user.id,
          ctx.user.hasCompletedFirstSpy,
          "transcribeCount"
        );
        if (!bypassTranscribeLimit) {
          const usageCheck = await checkUsageLimit(
            ctx.user.id,
            "transcribeCount",
            ctx.user.openId
          );
          if (!usageCheck.allowed) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: `You've reached your monthly transcription limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
            });
          }
        }
        if (existing && existing.status === "failed") {
          const { getDb } = await import("../db");
          const db = await getDb();
          if (db) {
            const { transcriptions: transcriptionsTable } = await import("../../drizzle/schema");
            const { eq } = await import("drizzle-orm");
            await db.delete(transcriptionsTable).where(eq(transcriptionsTable.id, existing.id));
          }
        }

        const transcriptionId = await createTranscription({
          reelId: input.reelId!,
          featuredReelId: null,
          status: "processing",
          queuedAt: new Date(),
        });

        await incrementUsage(ctx.user.id, "transcribeCount");

        const queuePending =
          getActiveTranscriptions() >= MAX_CONCURRENT_TRANSCRIPTIONS;
        runTranscription(transcriptionId, reelForRun).catch((err) => {
          console.error(`Transcription ${transcriptionId} failed:`, err);
        });

        return { transcriptionId, status: "processing" as const, queuePending };
      }),

    status: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, or youtubeVideoId",
            }
          )
      )
      .query(async ({ input }) => {
        const transcription =
          input.featuredReelId != null
            ? await getTranscriptionByFeaturedReelId(input.featuredReelId)
            : input.tiktokVideoId != null
              ? await getTranscriptionByTiktokVideoId(input.tiktokVideoId)
              : input.youtubeVideoId != null
                ? await getTranscriptionByYoutubeVideoId(input.youtubeVideoId)
                : await getTranscriptionByReelId(input.reelId!);
        return transcription || null;
      }),
});
