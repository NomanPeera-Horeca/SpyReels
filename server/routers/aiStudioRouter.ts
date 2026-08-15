import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { createAiStudioUpload } from "../aiStudio/assets";
import {
  createCreatorProfile,
  createVideoJob,
  getCreatorProfile,
  getVideoJob,
  markCreatorProfileReady,
} from "../aiStudio/repository";
import { runPersistentAiStudioJob } from "../aiStudio/runtime";
import {
  aiStudioSceneSchema,
  creatorPerformanceProfileSchema,
} from "../aiStudio/types";

const uploadKindSchema = z.enum(["training-video", "voice-sample"]);
const allowedUploadMime = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/wav",
]);

export const aiStudioRouter = router({
  createProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(160),
        consentConfirmed: z.literal(true),
        profile: creatorPerformanceProfileSchema.omit({ creatorId: true }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profileId = crypto.randomUUID();
      return createCreatorProfile({
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
        name: input.name,
        consentConfirmed: input.consentConfirmed,
        profile: { ...input.profile, creatorId: profileId },
      });
    }),

  getProfile: protectedProcedure
    .input(z.object({ profileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const profile = await getCreatorProfile({
        id: input.profileId,
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "AI creator profile not found" });
      return profile;
    }),

  createUpload: protectedProcedure
    .input(
      z.object({
        profileId: z.string().uuid(),
        kind: uploadKindSchema,
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(120),
        contentLength: z.number().int().positive().max(500 * 1024 * 1024),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (!allowedUploadMime.has(input.contentType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unsupported training file type" });
      }
      const profile = await getCreatorProfile({
        id: input.profileId,
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "AI creator profile not found" });
      return createAiStudioUpload({
        workspaceId: ctx.workspaceId,
        userId: ctx.user.id,
        profileId: input.profileId,
        kind: input.kind,
        filename: input.filename,
        contentType: input.contentType,
      });
    }),

  confirmProviderProfile: protectedProcedure
    .input(
      z.object({
        profileId: z.string().uuid(),
        voiceId: z.string().min(1).max(255).optional(),
        avatarId: z.string().min(1).max(255).optional(),
        providerMetadata: z.record(z.string(), z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getCreatorProfile({
        id: input.profileId,
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "AI creator profile not found" });
      await markCreatorProfileReady(input);
      return { success: true };
    }),

  createVideo: protectedProcedure
    .input(
      z.object({
        creatorProfileId: z.string().uuid(),
        scriptId: z.string().max(64).optional(),
        title: z.string().min(1).max(240),
        aspectRatio: z.literal("9:16").default("9:16"),
        scenes: z.array(aiStudioSceneSchema).min(1).max(30),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const profile = await getCreatorProfile({
        id: input.creatorProfileId,
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
      });
      if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "AI creator profile not found" });
      if (profile.status !== "ready" && process.env.AI_STUDIO_USE_MOCK_PROVIDERS !== "true") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Finish AI clone setup before generating a video" });
      }

      const job = await createVideoJob({
        creatorProfileId: input.creatorProfileId,
        workspaceId: ctx.workspaceId,
        userId: String(ctx.user.id),
        scriptId: input.scriptId,
        title: input.title,
        aspectRatio: input.aspectRatio,
        profile: profile.profile,
        scenes: input.scenes,
      });

      void runPersistentAiStudioJob(job.id).catch(error => {
        console.error(`[aiStudio] render job ${job.id} failed`, error);
      });
      return job;
    }),

  jobStatus: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const job = await getVideoJob({
        id: input.jobId,
        userId: ctx.user.id,
        workspaceId: ctx.workspaceId,
      });
      if (!job) throw new TRPCError({ code: "NOT_FOUND", message: "AI Studio job not found" });
      return job;
    }),
});
