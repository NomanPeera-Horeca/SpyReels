/**
 * Public B-roll landing preview APIs for /free-tools/broll-generator.
 * Anonymous: IP daily rate limit + CSS watermark (full res, no duration cap).
 * Authenticated: no watermark; monthly brollGenerationCount for script mode.
 * Download: paid plan only (server-side).
 */

import { randomBytes } from "crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  ANONYMOUS_BROLL_PREVIEW_DAILY_LIMIT,
  type BrollLandingMatch,
  type BrollLandingQuota,
} from "../../shared/brollLanding";
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
import { suggestBrollForScript } from "../broll/suggestBroll";
import {
  mapInsertionPointsToLandingMatches,
  mapSuggestBrollToLandingMatches,
} from "../brollLanding/mapPreviewMatches";
import { getSubscription } from "../db";
import {
  clientIpFromRequest,
  consumeAnonymousBrollPreview,
  peekAnonymousBrollPreviewQuota,
} from "../publicRateLimit";
import { storagePutPresigned } from "../storage";
import {
  checkUsageLimit,
  incrementUsage,
} from "../stripe/stripe-service";
import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { isPaidPlan } from "../userActivity";
import {
  createVideoBrollGeneration,
  getVideoBrollGenerationByAccessToken,
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

async function buildQuota(ctx: {
  user: { id: number; openId: string; email: string | null; role: string } | null;
  req: Parameters<typeof clientIpFromRequest>[0];
}): Promise<BrollLandingQuota> {
  const isAuthenticated = Boolean(ctx.user);
  let canDownload = false;
  if (ctx.user) {
    const sub = await getSubscription(ctx.user.id);
    canDownload = isPaidPlan(sub?.plan ?? "free", sub?.stripeSubscriptionId);
  }

  if (!ctx.user) {
    const ip = clientIpFromRequest(ctx.req);
    const peeked = peekAnonymousBrollPreviewQuota(
      ip,
      ANONYMOUS_BROLL_PREVIEW_DAILY_LIMIT
    );
    return {
      remaining: peeked.remaining,
      limit: peeked.limit,
      watermarked: true,
      canDownload: false,
      isAuthenticated: false,
    };
  }

  const usage = await checkUsageLimit(
    ctx.user.id,
    "brollGenerationCount",
    ctx.user.openId,
    { email: ctx.user.email, role: ctx.user.role }
  );
  return {
    remaining: Math.max(0, usage.limit - usage.used),
    limit: usage.limit,
    watermarked: false,
    canDownload,
    isAuthenticated: true,
  };
}

/**
 * Gate expensive preview work. Anonymous: IP daily bucket.
 * Authenticated script previews use monthly usage (consumed on success).
 * Authenticated video previews also consume one anonymous-style credit only
 * when unauthenticated; logged-in video uses monthly brollGenerationCount.
 */
async function assertPreviewAllowed(ctx: {
  user: { id: number; openId: string; email: string | null; role: string } | null;
  req: Parameters<typeof clientIpFromRequest>[0];
}): Promise<{ remaining: number; limit: number; watermarked: boolean }> {
  if (!ctx.user) {
    const ip = clientIpFromRequest(ctx.req);
    const consumed = consumeAnonymousBrollPreview(
      ip,
      ANONYMOUS_BROLL_PREVIEW_DAILY_LIMIT
    );
    if (!consumed.allowed) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message:
          "You have used all free previews for today. Sign up free for more, or try again tomorrow.",
      });
    }
    return {
      remaining: consumed.remaining,
      limit: consumed.limit,
      watermarked: true,
    };
  }

  const usage = await checkUsageLimit(
    ctx.user.id,
    "brollGenerationCount",
    ctx.user.openId,
    { email: ctx.user.email, role: ctx.user.role }
  );
  if (!usage.allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `You have reached your monthly B-roll generation limit (${usage.used}/${usage.limit}). Upgrade for more.`,
    });
  }
  return {
    remaining: Math.max(0, usage.limit - usage.used - 1),
    limit: usage.limit,
    watermarked: false,
  };
}

async function resolveOwnedGeneration(
  ctx: {
    user: { id: number } | null;
    workspaceId: string | null;
  },
  id: number,
  accessToken?: string | null
) {
  if (ctx.user && ctx.workspaceId) {
    const row = await getVideoBrollGenerationForWorkspace(
      id,
      ctx.workspaceId,
      ctx.user.id
    );
    if (row) return row;
  }
  if (accessToken) {
    const row = await getVideoBrollGenerationByAccessToken(id, accessToken);
    if (row) return row;
  }
  throw new TRPCError({ code: "NOT_FOUND", message: "Upload not found" });
}

export const brollLandingRouter = router({
  quota: publicProcedure.query(async ({ ctx }) => {
    return buildQuota(ctx);
  }),

  /**
   * Live script → beat split → Pexels. No AuthDialog hard-wall.
   * Anonymous results are full resolution with CSS watermark only.
   */
  previewScript: publicProcedure
    .input(
      z.object({
        content: z.string().min(1).max(12000),
        niche: z.string().max(120).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const gate = await assertPreviewAllowed(ctx);
      const result = await suggestBrollForScript({
        content: input.content,
        niche: input.niche,
        clipsPerBeat: 1,
      });
      if (ctx.user) {
        await incrementUsage(ctx.user.id, "brollGenerationCount");
      }
      const matches = mapSuggestBrollToLandingMatches(result);
      const totalSeconds =
        matches.length > 0 ? matches[matches.length - 1]!.end : 0;
      return {
        matches,
        theme: result.theme ?? "",
        watermarked: gate.watermarked,
        remaining: gate.remaining,
        limit: gate.limit,
        beatsMatched: matches.length,
        totalSeconds,
      };
    }),

  /**
   * Prepare R2 upload for landing video mode (auth optional).
   * Consumes one preview credit up front (covers Deepgram + Sonnet + Pexels).
   */
  createVideoUpload: publicProcedure
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

      const gate = await assertPreviewAllowed(ctx);
      const isAnon = !ctx.user || !ctx.workspaceId;
      const accessToken = isAnon ? randomBytes(24).toString("hex") : null;
      const videoUploadStatus: VideoBrollVideoUploadStatus = hasAudio
        ? "pending"
        : "skipped";

      const id = await createVideoBrollGeneration({
        userId: isAnon ? null : ctx.user!.id,
        workspaceId: isAnon ? null : ctx.workspaceId!,
        accessToken,
        sourceVideoUrl: "pending",
        status: "pending",
        videoUploadStatus,
      });

      const mime = input.contentType as VideoBrollAllowedMime;
      const ext = VIDEO_BROLL_EXT_BY_MIME[mime];
      const basename = safeBasename(input.filename);
      const scope = isAnon
        ? `anonymous/${accessToken}`
        : `${ctx.workspaceId}`;
      const videoKey = `video-broll/${scope}/${id}-${basename}${ext}`;

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
        audioKey = `video-broll/${scope}/${id}-${basename}-audio${audioExt}`;
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

      if (ctx.user) {
        await incrementUsage(ctx.user.id, "brollGenerationCount");
      }

      return {
        id,
        accessToken,
        uploadUrl,
        sourceVideoUrl,
        key: videoKey,
        audioUploadUrl: audioUploadUrl ?? null,
        sourceAudioUrl: sourceAudioUrl ?? null,
        audioKey: audioKey ?? null,
        videoUploadStatus,
        watermarked: gate.watermarked,
        remaining: gate.remaining,
        limit: gate.limit,
      };
    }),

  confirmAudioUpload: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        accessToken: z.string().min(16).max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const row = await resolveOwnedGeneration(ctx, input.id, input.accessToken);
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
        console.error(`[brollLanding] background job ${input.id} failed:`, err);
      });

      return {
        id: input.id,
        status: "uploading" as const,
        videoUploadStatus: (row.videoUploadStatus ??
          "pending") as VideoBrollVideoUploadStatus,
      };
    }),

  confirmVideoUpload: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        accessToken: z.string().min(16).max(64).optional(),
        success: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const row = await resolveOwnedGeneration(ctx, input.id, input.accessToken);
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

  confirmUpload: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        accessToken: z.string().min(16).max(64).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const row = await resolveOwnedGeneration(ctx, input.id, input.accessToken);
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
        console.error(`[brollLanding] background job ${input.id} failed:`, err);
      });

      return {
        id: input.id,
        status: "uploading" as const,
        videoUploadStatus: "skipped" as const,
      };
    }),

  getVideo: publicProcedure
    .input(
      z.object({
        id: z.number().int().positive(),
        accessToken: z.string().min(16).max(64).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const row = await resolveOwnedGeneration(ctx, input.id, input.accessToken);
      const insertionPoints =
        (row.insertionPoints as VideoBrollInsertionPoint[] | null) ?? null;
      let matches: BrollLandingMatch[] = [];
      if (insertionPoints && row.status === "completed") {
        matches = mapInsertionPointsToLandingMatches(insertionPoints);
      }
      const watermarked = !row.userId;
      return {
        id: row.id,
        status: row.status,
        videoUploadStatus: (row.videoUploadStatus ??
          null) as VideoBrollVideoUploadStatus | null,
        durationSeconds: row.durationSeconds,
        transcript: (row.transcript as VideoBrollTranscript | null) ?? null,
        insertionPoints,
        matches,
        watermarked,
        errorMessage: row.errorMessage,
        sourceVideoUrl: row.sourceVideoUrl,
        sourceAudioUrl: row.sourceAudioUrl ?? null,
        beatsMatched: matches.length,
        totalSeconds: row.durationSeconds ?? 0,
      };
    }),

  /**
   * Server-side download unlock. Never trust a disabled client button alone.
   * Returns clip URLs only when the user has an active paid plan.
   */
  downloadClips: protectedProcedure
    .input(
      z.object({
        matches: z
          .array(
            z.object({
              beat: z.string().max(200),
              keyword: z.string().max(240),
              clipUrl: z.string().url().max(2048),
              posterUrl: z.string().max(2048).optional(),
              source: z.enum(["pexels", "ai"]),
              start: z.number(),
              end: z.number(),
            })
          )
          .min(1)
          .max(40),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const sub = await getSubscription(ctx.user.id);
      const paid = isPaidPlan(sub?.plan ?? "free", sub?.stripeSubscriptionId);
      if (!paid) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "A paid SpyReels plan is required to download full-resolution B-roll clips.",
        });
      }
      return {
        allowed: true as const,
        plan: sub?.plan ?? "free",
        clips: input.matches.map((m) => ({
          beat: m.beat,
          keyword: m.keyword,
          downloadUrl: m.clipUrl,
          source: m.source,
        })),
      };
    }),
});
