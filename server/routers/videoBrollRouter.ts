/**
 * Video B-roll upload + transcription + analysis (Phase 2/3).
 * createUpload → client PUT → confirmUpload → background transcribe → analyze → poll get.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  VIDEO_BROLL_ALLOWED_MIME,
  VIDEO_BROLL_EXT_BY_MIME,
  VIDEO_BROLL_MAX_BYTES,
  type VideoBrollAllowedMime,
  type VideoBrollInsertionPoint,
  type VideoBrollTranscript,
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

function assertAllowedUpload(filename: string, contentType: string): void {
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

export const videoBrollRouter = router({
  createUpload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(100),
        contentLength: z.number().int().positive(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      assertAllowedUpload(input.filename, input.contentType);

      if (input.contentLength > VIDEO_BROLL_MAX_BYTES) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Video must be 200MB or smaller.",
        });
      }

      const mime = input.contentType as VideoBrollAllowedMime;
      const ext = VIDEO_BROLL_EXT_BY_MIME[mime];

      // Placeholder until we know insertId for the R2 key.
      const id = await createVideoBrollGeneration({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        sourceVideoUrl: "pending",
        status: "pending",
      });

      const key = `video-broll/${ctx.workspaceId}/${id}-${safeBasename(input.filename)}${ext}`;

      let uploadUrl: string;
      let sourceVideoUrl: string;
      try {
        const signed = await storagePutPresigned(key, input.contentType, 3600);
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

      await updateVideoBrollGeneration(id, { sourceVideoUrl });

      return { id, uploadUrl, sourceVideoUrl, key };
    }),

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
        errorMessage: null,
        internalErrorDetail: null,
      });

      void runVideoBrollTranscription(input.id).catch((err) => {
        console.error(`[videoBroll] background job ${input.id} failed:`, err);
      });

      return { id: input.id, status: "uploading" as const };
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
        durationSeconds: row.durationSeconds,
        transcript: (row.transcript as VideoBrollTranscript | null) ?? null,
        insertionPoints:
          (row.insertionPoints as VideoBrollInsertionPoint[] | null) ?? null,
        errorMessage: row.errorMessage,
        internalErrorDetail: row.internalErrorDetail,
        sourceVideoUrl: row.sourceVideoUrl,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),
});
