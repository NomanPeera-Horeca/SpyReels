import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { reels as reelsTable, collectedReels, transcriptions, scrapeJobs } from "../../drizzle/schema";
import type { Reel, Transcription } from "../../drizzle/schema";
import { analyzeHook } from "../analyzeHook";
import { assertCollectedReelInWorkspace } from "../assertCollectedReelInWorkspace";
import { ingestCollectedReelByShortcode, ensureCollectedMirrorReel } from "../collectedReelIngest";
import { enqueueCollectedReelIngest, enqueueCollectedReelRefresh } from "../collectedReelWorker";
import { getDb, getCollectedReelsByWorkspace, collectedReelsColumnsForQuery, deleteCollectedReel, deleteFailedCollectedReelsByWorkspace, updateCollectedReel, isReelSaved, unsaveReel, saveReel, getTranscriptionByReelId, createTranscription } from "../db";
import { runTranscription } from "./_shared";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { fetchYouTubeTranscript } from "../youtube";
import { eq, desc, inArray, not, or } from "drizzle-orm";



export const collectedRouter = router({
    /** List all collected reels for the user, including transcription status */
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) {
        const bare = await getCollectedReelsByWorkspace(ctx.workspaceId);
        return bare.map((r) => ({
          ...r,
          transcriptionReelId: r.transcriptionReelId ?? null,
          transcriptionStatus: null as string | null,
          transcriptionStartedAt: null as Date | null,
          transcriptionIsNoSpeech: false,
          monitoredViewCount: null as number | null,
          monitoredFollowerCount: null as number | null,
          contentType: null as string | null,
          remakeabilityScore: null as number | null,
          suggestedAction: null as string | null,
          classificationReason: null as string | null,
          classifiedAt: null as Date | null,
        }));
      }

      const collectedCols = await collectedReelsColumnsForQuery();
      const joined = await db
        .select({
          ...collectedCols,
          clsContentType: reelsTable.contentType,
          clsRemakeabilityScore: reelsTable.remakeabilityScore,
          clsSuggestedAction: reelsTable.suggestedAction,
          clsClassificationReason: reelsTable.classificationReason,
          clsClassifiedAt: reelsTable.classifiedAt,
          clsTxnReelThumbnailUrl: reelsTable.thumbnailUrl,
          clsTxnReelVideoUrl: reelsTable.videoUrl,
        })
        .from(collectedReels)
        .leftJoin(reelsTable, eq(collectedReels.transcriptionReelId, reelsTable.id))
        .where(eq(collectedReels.workspaceId, ctx.workspaceId))
        .orderBy(desc(collectedReels.createdAt));

      const reels = joined.map((row) => {
        const {
          clsContentType,
          clsRemakeabilityScore,
          clsSuggestedAction,
          clsClassificationReason,
          clsClassifiedAt,
          clsTxnReelThumbnailUrl,
          clsTxnReelVideoUrl,
          thumbnailUrl: collectedThumbRaw,
          videoUrl: collectedVideoRaw,
          ...collectedRest
        } = row;

        const r2PublicBase = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "")
          .replace(/\/+$/, "")
          .trim();
        const isR2MediaUrl = (url: string) =>
          Boolean(r2PublicBase && url.startsWith(r2PublicBase));

        const preferTxnMedia = (
          fromTxnReel: string | null | undefined,
          fromCollected: string | null | undefined
        ): string | null => {
          const a = (fromTxnReel ?? "").trim();
          const b = (fromCollected ?? "").trim();
          // Prefer durable R2 over ephemeral CDN (TikTok covers expire / may be HEIC).
          if (b && isR2MediaUrl(b) && (!a || !isR2MediaUrl(a))) {
            return fromCollected ?? null;
          }
          if (a) return fromTxnReel ?? null;
          return b ? fromCollected ?? null : null;
        };

        return {
          ...collectedRest,
          thumbnailUrl: preferTxnMedia(clsTxnReelThumbnailUrl, collectedThumbRaw),
          videoUrl: preferTxnMedia(clsTxnReelVideoUrl, collectedVideoRaw),
          contentType: clsContentType ?? null,
          remakeabilityScore: clsRemakeabilityScore ?? null,
          suggestedAction: clsSuggestedAction ?? null,
          classificationReason: clsClassificationReason ?? null,
          classifiedAt: clsClassifiedAt ?? null,
        };
      });

      const transcriptionReelIds = Array.from(
        new Set(
          reels
            .map((r) => r.transcriptionReelId)
            .filter((id): id is number => id != null && id > 0)
        )
      );
      type TxnBrief = {
        status: string;
        startedAt: Date | null;
        transcriptionIsNoSpeech: boolean;
      };
      const txnByReelId = new Map<number, TxnBrief>();
      if (transcriptionReelIds.length > 0) {
        const txns = await db
          .select({
            reelId: transcriptions.reelId,
            status: transcriptions.status,
            transcript: transcriptions.transcript,
            segments: transcriptions.segments,
            startedAt: transcriptions.startedAt,
          })
          .from(transcriptions)
          .where(inArray(transcriptions.reelId as any, transcriptionReelIds));
        for (const t of txns) {
          if (t.reelId == null) continue;
          const segs = t.segments;
          const nSeg = Array.isArray(segs) ? segs.length : 0;
          const transcriptionIsNoSpeech =
            t.status === "completed" &&
            !String(t.transcript ?? "").trim() &&
            nSeg === 0;
          txnByReelId.set(t.reelId, {
            status: t.status,
            startedAt: t.startedAt ?? null,
            transcriptionIsNoSpeech,
          });
        }
      }

      const readyReels = reels.filter((r) => r.status === "ready");
      const shortcodes = readyReels.map((r) => r.shortcode);

      let monitoredDataMap = new Map<string, { viewCount: number; followerCount: number }>();

      if (shortcodes.length > 0) {
        const monitoredReels = await db
          .select({
            shortcode: reelsTable.shortcode,
            viewCount: reelsTable.viewCount,
            jobId: reelsTable.jobId,
          })
          .from(reelsTable)
          .where(inArray(reelsTable.shortcode, shortcodes));

        const jobIds = Array.from(
          new Set(monitoredReels.filter((r) => r.jobId > 0).map((r) => r.jobId))
        );
        let jobFollowerMap = new Map<number, number>();
        if (jobIds.length > 0) {
          const jobs = await db
            .select({ id: scrapeJobs.id, followerCount: scrapeJobs.followerCount })
            .from(scrapeJobs)
            .where(inArray(scrapeJobs.id, jobIds));
          jobFollowerMap = new Map(jobs.map((j) => [j.id, j.followerCount]));
        }

        for (const mr of monitoredReels) {
          if (mr.jobId === 0) continue;
          const existing = monitoredDataMap.get(mr.shortcode);
          const followerCount = jobFollowerMap.get(mr.jobId) || 0;
          if (!existing || mr.viewCount > existing.viewCount) {
            monitoredDataMap.set(mr.shortcode, {
              viewCount: mr.viewCount,
              followerCount: followerCount,
            });
          }
        }
      }

      return reels.map((r) => {
        const monitored = monitoredDataMap.get(r.shortcode);
        const txn =
          r.transcriptionReelId != null ? txnByReelId.get(r.transcriptionReelId) : undefined;

        return {
          ...r,
          transcriptionReelId: r.transcriptionReelId ?? null,
          transcriptionStatus:
            r.transcriptionReelId != null ? txn?.status ?? null : null,
          transcriptionStartedAt:
            r.transcriptionReelId != null ? txn?.startedAt ?? null : null,
          transcriptionIsNoSpeech:
            r.transcriptionReelId != null ? txn?.transcriptionIsNoSpeech ?? false : false,
          monitoredViewCount: monitored?.viewCount ?? null,
          monitoredFollowerCount: monitored?.followerCount ?? null,
        };
      });
    }),

    /** Delete a collected reel */
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertCollectedReelInWorkspace(input.id, ctx);
        await deleteCollectedReel(input.id);
        return { success: true };
      }),

    /** Add a reel by URL (Instagram / TikTok / YouTube paste from web UI) */
    addByUrl: protectedProcedure
      .input(z.object({ url: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { parseCollectedVideoUrl } = await import("../socialVideoUrl");
        const parsed = await parseCollectedVideoUrl(input.url);
        if (!parsed) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Could not parse that link. Paste an Instagram Reel, TikTok video, or YouTube URL.",
          });
        }

        const ingest = await ingestCollectedReelByShortcode({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          shortcode: parsed.externalId,
          reelUrl: parsed.canonicalUrl,
          source: "url_paste",
          platform: parsed.platform,
        });

        return {
          id: ingest.id,
          duplicate: ingest.action === "duplicate",
          retried: ingest.action === "retried",
          platform: parsed.platform,
        };
      }),

    /** Remove all failed collected reels (ghost rows that block Telegram re-add) */
    deleteFailed: protectedProcedure.mutation(async ({ ctx }) => {
      const deleted = await deleteFailedCollectedReelsByWorkspace(ctx.workspaceId);
      return { deleted };
    }),

    /** Refresh metadata for a failed or incomplete reel */
    retry: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await assertCollectedReelInWorkspace(input.id, ctx);
        await updateCollectedReel(input.id, {
          status: "pending",
          errorMessage: null,
          fetchAttempts: 0,
          nextFetchAt: null,
          lastFetchAt: null,
        });
        enqueueCollectedReelIngest(input.id);
        return { success: true };
      }),

    /** Refresh all reels - re-fetch latest stats (views, likes, comments) for all ready reels */
    refreshAll: protectedProcedure
      .mutation(async ({ ctx }) => {
        const allReels = await getCollectedReelsByWorkspace(ctx.workspaceId);
        // Refresh ALL reels: pending/failed ones need retry, ready ones need stat updates
        const needsRefresh = allReels.filter(
          (r) => r.status === "pending" || r.status === "failed" || r.status === "ready"
        );
        let count = 0;
        for (const reel of needsRefresh) {
          // Only set to pending for non-ready reels; for ready reels, refresh in background without status change
          if (reel.status !== "ready") {
            await updateCollectedReel(reel.id, {
              status: "pending",
              errorMessage: null,
              fetchAttempts: 0,
              nextFetchAt: null,
            });
            enqueueCollectedReelIngest(reel.id);
          } else {
            enqueueCollectedReelRefresh(reel.id);
          }
          count++;
          // Small delay between requests
          if (count < needsRefresh.length) {
            await new Promise((r) => setTimeout(r, 500));
          }
        }
        return { refreshed: count };
      }),

    /** Save / unsave a collected reel into Saved Reels (same bookmark as Creator Radar). */
    toggleSave: protectedProcedure
      .input(z.object({ collectedReelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const reel = await assertCollectedReelInWorkspace(
          input.collectedReelId,
          ctx
        );
        if (reel.status !== "ready") {
          throw new TRPCError({
            code: "PRECONDITION_FAILED",
            message: "Reel metadata not ready yet",
          });
        }

        const reelId = await ensureCollectedMirrorReel(reel);
        const alreadySaved = await isReelSaved(
          ctx.workspaceId,
          ctx.user.id,
          reelId
        );
        if (alreadySaved) {
          await unsaveReel(ctx.workspaceId, ctx.user.id, reelId);
          return { saved: false as const, reelId };
        }
        await saveReel({
          userId: ctx.user.id,
          workspaceId: ctx.workspaceId,
          reelId,
          jobId: 0,
        });
        return { saved: true as const, reelId };
      }),

    /** Transcribe a collected reel */
    transcribe: protectedProcedure
      .input(z.object({ collectedReelId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const reel = await assertCollectedReelInWorkspace(input.collectedReelId, ctx);
        if (reel.status !== "ready") {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Reel metadata not ready yet" });
        }

        const platform = (reel.platform || "instagram").toLowerCase();
        const isYouTube = platform === "youtube";

        if (!isYouTube && !reel.videoUrl) {
          throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No video URL available for this reel" });
        }

        // Check usage limit
        const usageCheck = await checkUsageLimit(ctx.user.id, "transcribeCount", ctx.user.openId);
        if (!usageCheck.allowed) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Transcription limit reached (${usageCheck.used}/${usageCheck.limit}). Upgrade for more.`,
          });
        }
        await incrementUsage(ctx.user.id, "transcribeCount");

        const reelId = await ensureCollectedMirrorReel(reel);

        const existingTranscription = await getTranscriptionByReelId(reelId);
        const existingText = String(existingTranscription?.transcript ?? "").trim();
        if (
          existingTranscription &&
          existingTranscription.status === "completed" &&
          existingText
        ) {
          return {
            reelId,
            transcriptionId: existingTranscription.id,
            status: "completed" as const,
          };
        }
        if (
          existingTranscription &&
          existingTranscription.status === "processing"
        ) {
          return {
            reelId,
            transcriptionId: existingTranscription.id,
            status: "processing" as const,
          };
        }

        // Empty "completed" YouTube rows (no captions) used to block remake forever
        // because we short-circuited on status alone. Clear them so we can retry.
        if (
          existingTranscription &&
          (existingTranscription.status === "failed" ||
            (existingTranscription.status === "completed" && !existingText))
        ) {
          const dbClear = await getDb();
          if (dbClear) {
            await dbClear
              .delete(transcriptions)
              .where(eq(transcriptions.id, existingTranscription.id));
          }
        }

        // YouTube: caption track via ScrapeCreators (no MP4 download)
        if (isYouTube) {
          const transcriptResult = await fetchYouTubeTranscript(reel.reelUrl);
          if (!transcriptResult) {
            const transcriptionId = await createTranscription({
              reelId,
              transcript: "",
              segments: [],
              hookAnalysis: "",
              status: "failed",
              errorMessage:
                "No captions available for this YouTube Short. Pick one with captions or spoken audio.",
              queuedAt: new Date(),
              startedAt: new Date(),
            });
            return {
              reelId,
              transcriptionId,
              status: "failed" as const,
              errorMessage:
                "No captions available for this YouTube Short. Pick one with captions or spoken audio.",
            };
          }

          const hookAnalysis = await analyzeHook(
            transcriptResult.transcript,
            reel.caption || "",
            reel.thumbnailUrl || "",
            transcriptResult.segments,
            "YouTube Short"
          );
          const transcriptionId = await createTranscription({
            reelId,
            transcript: transcriptResult.transcript,
            segments: transcriptResult.segments,
            hookAnalysis,
            status: "completed",
            queuedAt: new Date(),
            startedAt: new Date(),
          });
          return { reelId, transcriptionId, status: "completed" as const };
        }

        const transcriptionId = await createTranscription({
          reelId,
          status: "processing",
          queuedAt: new Date(),
        });

        runTranscription(transcriptionId, {
          id: reelId,
          shortcode: reel.shortcode,
          videoUrl: reel.videoUrl,
          caption: reel.caption,
          thumbnailUrl: reel.thumbnailUrl,
        }).catch((err) => {
          console.error(`[Collected] Transcription failed for ${reel.shortcode}:`, err);
        });

        return { reelId, transcriptionId, status: "processing" as const };
      }),

    /** Get transcription status for a collected reel */
    transcriptionStatus: protectedProcedure
      .input(z.object({ reelId: z.number() }))
      .query(async ({ input }) => {
        const transcription = await getTranscriptionByReelId(input.reelId);
        if (!transcription) return null;
        return transcription;
      }),
});
