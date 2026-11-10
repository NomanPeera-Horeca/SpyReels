import { z } from "zod";
import {
  claimLibraryTranscription,
  getLibraryTranscript,
  libraryTablesReady,
  librarySourceEnabled,
  loadLibraryCandidate,
  runLibraryTranscription,
  shouldStartLibraryTranscription,
  toTranscriptionStatus,
} from "../remake/libraryTranscripts";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { transcriptions, tiktokVideos, youtubeVideos } from "../../drizzle/schema";
import type { User, Transcription } from "../../drizzle/schema";
import { analyzeHook } from "../analyzeHook";
import { assertUserScrapeReelInWorkspace } from "../assertUserScrapeReelInWorkspace";
import { getFeaturedReelById, updateFeaturedReelTranscription, getDb, getTranscriptionByTiktokVideoId, createTranscription, getTranscriptionByYoutubeVideoId, getTranscriptionByReelId, getTranscriptionByFeaturedReelId } from "../db";
import { runFeaturedReelTranscription, runTranscription } from "./_shared";
import { dispatchPilotJob } from "../durableJobs/dispatch";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { runTikTokTranscription } from "../tiktokScrape/runTranscription";
import { getActiveTranscriptions, MAX_CONCURRENT_TRANSCRIPTIONS } from "../transcriptionSemaphore";
import { fetchYouTubeTranscript } from "../youtube";
import { or, and, not, eq } from "drizzle-orm";
import { isFirstRemakeUsageBypassEligible } from "./_shared";

function sourcePlatformFromUrl(url: string | null | undefined): "instagram" | "tiktok" | "youtube" {
  const value = String(url ?? "").toLowerCase();
  if (value.includes("tiktok.com")) return "tiktok";
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "youtube";
  return "instagram";
}

/** Empty completed rows are retriable (e.g. false no-speech from forced English STT). */
function transcriptionHasSpeech(t: {
  transcript?: string | null;
  segments?: unknown;
} | null | undefined): boolean {
  if (!t) return false;
  if (String(t.transcript ?? "").trim()) return true;
  const segs = t.segments;
  if (!Array.isArray(segs) || segs.length === 0) return false;
  return segs.some((s) =>
    String((s as { text?: string } | null)?.text ?? "").trim()
  );
}

async function deleteTranscriptionRow(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(transcriptions).where(eq(transcriptions.id, id));
}

const sourceReferenceInput = z
  .object({
    reelId: z.number().optional(),
    featuredReelId: z.number().optional(),
    tiktokVideoId: z.number().optional(),
    youtubeVideoId: z.number().optional(),
    libraryCandidateId: z.number().int().positive().optional(),
  })
  .refine(
    (d) =>
      [d.reelId, d.featuredReelId, d.tiktokVideoId, d.youtubeVideoId, d.libraryCandidateId].filter(
        (id) => id != null
      ).length === 1,
    {
      message:
        "Provide exactly one of reelId, featuredReelId, tiktokVideoId, youtubeVideoId, or libraryCandidateId",
    }
  );

export const transcribeRouter = router({
    start: protectedProcedure
      .input(
        z
          .object({
            reelId: z.number().optional(),
            featuredReelId: z.number().optional(),
            tiktokVideoId: z.number().optional(),
            youtubeVideoId: z.number().optional(),
            /** Shared library video (viral_post_candidates.id); REMAKE_LIBRARY_SOURCE=on only. */
            libraryCandidateId: z.number().int().positive().optional(),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
                d.libraryCandidateId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, youtubeVideoId, or libraryCandidateId",
            }
          )
      )
      .mutation(async ({ ctx, input }) => {
        if (input.libraryCandidateId != null) {
          // Public library video: transcribe once from its link, shared by everyone;
          // nothing is copied into the user's Collected Reels.
          if (!librarySourceEnabled()) throw new TRPCError({ code: "BAD_REQUEST", message: "Library remake is not enabled." });
          const db = await getDb();
          if (!db || !(await libraryTablesReady(db))) {
            throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Library remake is not ready yet." });
          }
          const candidate = await loadLibraryCandidate(db, input.libraryCandidateId);
          if (!candidate) throw new TRPCError({ code: "NOT_FOUND", message: "Video not found" });
          const existing = await getLibraryTranscript(db, candidate.id);
          if (!shouldStartLibraryTranscription(existing)) {
            return {
              transcriptionId: candidate.id,
              status: existing!.status === "completed" ? ("completed" as const) : ("processing" as const),
              queuePending: false,
            };
          }
          const bypass = await isFirstRemakeUsageBypassEligible(ctx.user.id, ctx.user.hasCompletedFirstSpy, "transcribeCount");
          if (!bypass) {
            const usageCheck = await checkUsageLimit(ctx.user.id, "transcribeCount", ctx.user.openId);
            if (!usageCheck.allowed) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: `You've reached your monthly transcription limit (${usageCheck.used}/${usageCheck.limit}). Upgrade to ${usageCheck.planRequired || "a higher plan"} for more.`,
              });
            }
          }
          // Only the caller that claims the job runs it. It is charged only when a
          // transcript is actually made: a failed attempt (e.g. the speech-to-text
          // service is down or out of credits) never uses up a transcription.
          if (await claimLibraryTranscription(db, candidate)) {
            const userId = ctx.user.id;
            void runLibraryTranscription(candidate, {
              onCompleted: () => incrementUsage(userId, "transcribeCount"),
            });
          }
          return { transcriptionId: candidate.id, status: "processing" as const, queuePending: false };
        }
        const source: "user" | "featured" | "tiktok" | "youtube" =
          input.featuredReelId != null
            ? "featured"
            : input.tiktokVideoId != null
              ? "tiktok"
              : input.youtubeVideoId != null
                ? "youtube"
                : "user";

        if (source === "featured") {
          const fr = await getFeaturedReelById(input.featuredReelId!);
          if (!fr) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Featured reel not found" });
          }
          if (
            fr.transcriptionStatus === "completed" &&
            transcriptionHasSpeech({
              transcript: fr.transcript,
              segments: fr.transcriptSegments,
            })
          ) {
            return { transcriptionId: fr.id, status: "completed" as const };
          }
          // no_speech / empty completed: allow retry so language-detect STT can recover
          if (fr.transcriptionStatus === "processing") {
            return {
              transcriptionId: fr.id,
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
          const queuePending =
            getActiveTranscriptions() >= MAX_CONCURRENT_TRANSCRIPTIONS;
          await updateFeaturedReelTranscription(fr.id, {
            transcriptionStatus: "processing",
            // While processing this is the heartbeat/start timestamp. Terminal
            // writes replace it with the actual completion timestamp.
            transcribedAt: new Date(),
          });
          await incrementUsage(ctx.user.id, "transcribeCount");
          const featuredReel = {
            id: fr.id,
            shortcode: fr.reelShortcode,
            videoUrl: fr.videoUrl,
          };
          await dispatchPilotJob({
            jobType: "featured_reel_transcription",
            idempotencyKey: `featured_reel_transcription:${fr.id}`,
            payload: { reel: featuredReel },
            runInline: () => runFeaturedReelTranscription(featuredReel),
            onInlineError: (error) =>
              console.error(`Featured transcription ${fr.id} failed:`, error),
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
          if (existing && existing.status === "completed" && transcriptionHasSpeech(existing)) {
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

          if (
            existing &&
            (existing.status === "failed" ||
              (existing.status === "completed" && !transcriptionHasSpeech(existing)))
          ) {
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

        const reel = await assertUserScrapeReelInWorkspace(input.reelId!, ctx);
        const reelForRun = {
          id: reel.id,
          shortcode: reel.shortcode,
          videoUrl: reel.videoUrl,
          caption: reel.caption,
          thumbnailUrl: reel.thumbnailUrl,
        };

        const existing = await getTranscriptionByReelId(input.reelId!);
        if (existing && existing.status === "completed" && transcriptionHasSpeech(existing)) {
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
        if (
          existing &&
          (existing.status === "failed" ||
            (existing.status === "completed" && !transcriptionHasSpeech(existing)))
        ) {
          await deleteTranscriptionRow(existing.id);
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
            libraryCandidateId: z.number().int().positive().optional(),
          })
          .refine(
            (d) =>
              [
                d.reelId,
                d.featuredReelId,
                d.tiktokVideoId,
                d.youtubeVideoId,
                d.libraryCandidateId,
              ].filter((id) => id != null).length === 1,
            {
              message:
                "Provide exactly one of reelId, featuredReelId, tiktokVideoId, youtubeVideoId, or libraryCandidateId",
            }
          )
      )
      .query(async ({ input }) => {
        if (input.libraryCandidateId != null) {
          const db = await getDb();
          if (!db || !(await libraryTablesReady(db))) return null;
          return toTranscriptionStatus(await getLibraryTranscript(db, input.libraryCandidateId));
        }
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

    /**
     * Read-only reference payload for the Remake workspace Source drawer and
     * social-style Opening Hook preview. This never starts a paid provider.
     */
    sourceReference: protectedProcedure
      .input(sourceReferenceInput)
      .query(async ({ ctx, input }) => {
        if (input.libraryCandidateId != null) {
          const db = await getDb();
          if (!librarySourceEnabled() || !db || !(await libraryTablesReady(db))) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Source video not found" });
          }
          const c = await loadLibraryCandidate(db, input.libraryCandidateId);
          if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Source video not found" });
          const t = await getLibraryTranscript(db, c.id);
          return {
            platform: c.platform,
            creator: c.creatorHandle,
            title: c.caption || null,
            durationSec: null,
            thumbnailUrl: null,
            originalUrl: c.sourceUrl || null,
            transcript: t?.transcript ?? null,
            segments: t?.segments ?? null,
            transcriptionStatus: t?.status ?? null,
          };
        }
        if (input.featuredReelId != null) {
          const reel = await getFeaturedReelById(input.featuredReelId);
          if (!reel) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Source Reel not found" });
          }
          const transcription = await getTranscriptionByFeaturedReelId(reel.id);
          return {
            platform: "instagram" as const,
            creator: null,
            title: reel.caption ?? null,
            durationSec: reel.duration ?? null,
            thumbnailUrl: reel.thumbnailUrl ?? null,
            originalUrl: reel.reelShortcode
              ? `https://www.instagram.com/reel/${encodeURIComponent(reel.reelShortcode)}/`
              : null,
            transcript: transcription?.transcript ?? null,
            segments: transcription?.segments ?? null,
            transcriptionStatus: transcription?.status ?? reel.transcriptionStatus ?? null,
          };
        }

        if (input.tiktokVideoId != null) {
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
            .where(eq(tiktokVideos.id, input.tiktokVideoId))
            .limit(1);
          const video = rows[0];
          if (!video) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Source video not found" });
          }
          if (video.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          const transcription = await getTranscriptionByTiktokVideoId(video.id);
          return {
            platform: "tiktok" as const,
            creator: video.ownerUsername ?? null,
            title: video.caption ?? null,
            durationSec: video.durationSec ?? null,
            thumbnailUrl: video.thumbnailUrl ?? null,
            originalUrl: video.videoPageUrl || null,
            transcript: transcription?.transcript ?? null,
            segments: transcription?.segments ?? null,
            transcriptionStatus: transcription?.status ?? null,
          };
        }

        if (input.youtubeVideoId != null) {
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
            .where(eq(youtubeVideos.id, input.youtubeVideoId))
            .limit(1);
          const video = rows[0];
          if (!video) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Source video not found" });
          }
          if (video.workspaceId !== ctx.workspaceId) {
            throw new TRPCError({ code: "FORBIDDEN" });
          }
          const transcription = await getTranscriptionByYoutubeVideoId(video.id);
          return {
            platform: "youtube" as const,
            creator: video.ownerHandle ?? null,
            title: video.title ?? video.description ?? null,
            durationSec: video.durationSec ?? null,
            thumbnailUrl: video.thumbnailUrl ?? null,
            originalUrl: video.videoPageUrl || null,
            transcript: transcription?.transcript ?? null,
            segments: transcription?.segments ?? null,
            transcriptionStatus: transcription?.status ?? null,
          };
        }

        const reel = await assertUserScrapeReelInWorkspace(input.reelId!, ctx);
        const transcription = await getTranscriptionByReelId(reel.id);
        return {
          platform: sourcePlatformFromUrl(reel.reelUrl),
          creator: reel.ownerUsername ?? null,
          title: reel.caption ?? null,
          durationSec: reel.duration ?? null,
          thumbnailUrl: reel.thumbnailUrl ?? null,
          originalUrl: reel.reelUrl || null,
          transcript: transcription?.transcript ?? null,
          segments: transcription?.segments ?? null,
          transcriptionStatus: transcription?.status ?? null,
        };
      }),
});
