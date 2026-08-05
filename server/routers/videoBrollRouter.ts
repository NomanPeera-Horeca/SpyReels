/**
 * Video B-roll upload + transcription + analysis (Phase 2/3).
 * Dual-upload path: createUpload (optional audio) → PUT audio → confirmAudioUpload
 * (starts transcription) → PUT video in background → confirmVideoUpload.
 * Fallback (no audio extract): createUpload → PUT video → confirmUpload (as before).
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  VIDEO_BROLL_ALLOWED_AUDIO_MIME,
  VIDEO_BROLL_ALLOWED_MIME,
  VIDEO_BROLL_AUDIO_EXT_BY_MIME,
  VIDEO_BROLL_AUDIO_MAX_BYTES,
  VIDEO_BROLL_EXT_BY_MIME,
  VIDEO_BROLL_MAX_BYTES,
  type VideoBrollAllowedAudioMime,
  type VideoBrollAllowedMime,
  type VideoBrollInsertionPoint,
  type VideoBrollTranscript,
  type VideoBrollVideoUploadStatus,
} from "../../shared/videoBroll";
import { protectedProcedure, router } from "../_core/trpc";
import { storagePutPresigned } from "../storage";
import {
  createVideoBrollGeneration,
  getVideoBrollGenerationForWorkspace,
  updateVideoBrollGeneration,
} from "../videoBroll/db";
import { runVideoBrollTranscription } from "../videoBroll/runTranscription";

const ALLOWED_MIME_SET = new Set<string>(VIDEO_BROLL_ALLOWED_MIME);
const ALLOWED_EXT_SET = new Set(
  Object.values(VIDEO_BROLL_EXT_BY_MIME).map((e) => e.toLowerCase())
);
const ALLOWED_AUDIO_MIME_SET = new Set<string>(VIDEO_BROLL_ALLOWED_AUDIO_MIME);

function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  if (i < 0) return "";
  return filename.slice(i).toLowerCase();
}

function safeBasename(filename: string): string {
  const base = filename.replace(/^.*[/\\]/, "");
  const withoutExt = base.includes(".")
    ? base.slice(0, base.lastIndexOf("."))
    : base;
  const cleaned = withoutExt
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return cleaned || "video";
}

function assertAllowedVideoUpload(filename: string, contentType: string): void {
  if (!ALLOWED_MIME_SET.has(contentType)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unsupported video type. Use MP4, MOV, or WebM.",
    });
  }
  const ext = extensionOf(filename);
  if (!ALLOWED_EXT_SET.has(ext)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unsupported file extension. Use .mp4, .mov, or .webm.",
    });
  }
  const expected = VIDEO_BROLL_EXT_BY_MIME[contentType as VideoBrollAllowedMime];
  if (ext !== expected) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `File extension ${ext} does not match content type ${contentType}.`,
    });
  }
}

function assertAllowedAudioUpload(contentType: string): void {
  if (!ALLOWED_AUDIO_MIME_SET.has(contentType)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Unsupported audio type. Use audio/mp4 or audio/m4a.",
    });
  }
}

export const videoBrollRouter = router({
  /**
   * Prepare R2 uploads. When audioContentType/Length are set, also returns
   * audioUploadUrl / audioPublicUrl for the dual-upload path.
   */
  createUpload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(100),
        contentLength: z.number().int().positive(),
        audioContentType: z.string().min(1).max(100).optional(),
        audioContentLength: z.number().int().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertAllowedVideoUpload(input.filename, input.contentType);

      if (input.contentLength > VIDEO_BROLL_MAX_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Video must be 200MB or smaller.",
        });
      }

      const hasAudio =
        input.audioContentType != null && input.audioContentLength != null;

      if (hasAudio) {
        assertAllowedAudioUpload(input.audioContentType!);
        if (input.audioContentLength! > VIDEO_BROLL_AUDIO_MAX_BYTES) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Audio must be 20MB or smaller.",
          });
        }
      } else if (
        input.audioContentType != null ||
        input.audioContentLength != null
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "audioContentType and audioContentLength must both be provided.",
        });
      }

      const mime = input.contentType as VideoBrollAllowedMime;
      const ext = VIDEO_BROLL_EXT_BY_MIME[mime];
      const videoUploadStatus: VideoBrollVideoUploadStatus = hasAudio
        ? "pending"
        : "skipped";

      const id = await createVideoBrollGeneration({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        sourceVideoUrl: "pending",
        status: "pending",
        videoUploadStatus,
      });

      const basename = safeBasename(input.filename);
      const videoKey = `video-broll/${ctx.workspaceId}/${id}-${basename}${ext}`;

      let uploadUrl: string;
      let sourceVideoUrl: string;
      try {
        const signed = await storagePutPresigned(videoKey, input.contentType, 3600);
        uploadUrl = signed.uploadUrl;
        sourceVideoUrl = signed.url;
      } catch (err) {
        await updateVideoBrollGeneration(id, {
          status: "failed",
          errorMessage:
            err instanceof Error ? err.message : "Failed to create upload URL",
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not prepare upload. Check R2 configuration.",
        });
      }

      let audioUploadUrl: string | undefined;
      let sourceAudioUrl: string | undefined;
      let audioKey: string | undefined;

      if (hasAudio) {
        const audioMime = input.audioContentType as VideoBrollAllowedAudioMime;
        const audioExt = VIDEO_BROLL_AUDIO_EXT_BY_MIME[audioMime];
        audioKey = `video-broll/${ctx.workspaceId}/${id}-${basename}-audio${audioExt}`;
        try {
          const signedAudio = await storagePutPresigned(
            audioKey,
            input.audioContentType!,
            3600
          );
          audioUploadUrl = signedAudio.uploadUrl;
          sourceAudioUrl = signedAudio.url;
        } catch (err) {
          await updateVideoBrollGeneration(id, {
            status: "failed",
            errorMessage:
              err instanceof Error
                ? err.message
                : "Failed to create audio upload URL",
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Could not prepare audio upload. Check R2 configuration.",
          });
        }
      }

      await updateVideoBrollGeneration(id, {
        sourceVideoUrl,
        sourceAudioUrl: sourceAudioUrl ?? null,
        videoUploadStatus,
      });

      return {
        id,
        uploadUrl,
        sourceVideoUrl,
        key: videoKey,
        audioUploadUrl: audioUploadUrl ?? null,
        sourceAudioUrl: sourceAudioUrl ?? null,
        audioKey: audioKey ?? null,
        videoUploadStatus,
      };
    }),

  /**
   * Fallback: video-only confirm. Starts transcription from sourceVideoUrl.
   * videoUploadStatus stays skipped (no separate background video track).
   */
  confirmUpload: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await getVideoBrollGenerationForWorkspace(
        input.id,
        ctx.workspaceId,
        ctx.user.id
      );
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
      }
      if (row.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot confirm upload in status "${row.status}".`,
        });
      }
      if (!row.sourceVideoUrl || row.sourceVideoUrl === "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Upload URL was not prepared.",
        });
      }

      await updateVideoBrollGeneration(input.id, {
        status: "uploading",
        videoUploadStatus: "skipped",
        errorMessage: null,
        internalErrorDetail: null,
      });

      void runVideoBrollTranscription(input.id).catch((err) => {
        console.error(`[videoBroll] background job ${input.id} failed:`, err);
      });

      return {
        id: input.id,
        status: "uploading" as const,
        videoUploadStatus: "skipped" as const,
      };
    }),

  /**
   * Dual-upload: audio PUT finished. Starts transcription immediately from
   * sourceAudioUrl. Does not require video to be present.
   */
  confirmAudioUpload: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const row = await getVideoBrollGenerationForWorkspace(
        input.id,
        ctx.workspaceId,
        ctx.user.id
      );
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
      }
      if (row.status !== "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Cannot confirm audio upload in status "${row.status}".`,
        });
      }
      if (!row.sourceAudioUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Audio upload was not prepared for this generation.",
        });
      }

      await updateVideoBrollGeneration(input.id, {
        status: "uploading",
        errorMessage: null,
        internalErrorDetail: null,
      });

      void runVideoBrollTranscription(input.id).catch((err) => {
        console.error(`[videoBroll] background job ${input.id} failed:`, err);
      });

      return {
        id: input.id,
        status: "uploading" as const,
        videoUploadStatus: (row.videoUploadStatus ??
          "pending") as VideoBrollVideoUploadStatus,
      };
    }),

  /**
   * Dual-upload: video PUT finished (or failed). Does not start transcription
   * and does not fail the main pipeline status.
   */
  confirmVideoUpload: protectedProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        success: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const row = await getVideoBrollGenerationForWorkspace(
        input.id,
        ctx.workspaceId,
        ctx.user.id
      );
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
      }

      if (row.videoUploadStatus === "skipped") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This generation uses video-only fallback; use confirmUpload instead.",
        });
      }

      if (!row.sourceVideoUrl || row.sourceVideoUrl === "pending") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Video upload URL was not prepared.",
        });
      }

      const videoUploadStatus: VideoBrollVideoUploadStatus = input.success
        ? "completed"
        : "failed";

      await updateVideoBrollGeneration(input.id, { videoUploadStatus });

      return { id: input.id, videoUploadStatus };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const row = await getVideoBrollGenerationForWorkspace(
        input.id,
        ctx.workspaceId,
        ctx.user.id
      );
      if (!row) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
      }

      return {
        id: row.id,
        status: row.status,
        videoUploadStatus: (row.videoUploadStatus ??
          null) as VideoBrollVideoUploadStatus | null,
        durationSeconds: row.durationSeconds,
        transcript: (row.transcript as VideoBrollTranscript | null) ?? null,
        insertionPoints:
          (row.insertionPoints as VideoBrollInsertionPoint[] | null) ?? null,
        errorMessage: row.errorMessage,
        internalErrorDetail: row.internalErrorDetail,
        sourceVideoUrl: row.sourceVideoUrl,
        sourceAudioUrl: row.sourceAudioUrl ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),
});
