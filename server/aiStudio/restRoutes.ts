import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { createContext } from "../_core/context";
import { createAiStudioUpload } from "./assets";
import { provisionCreatorProfile } from "./provisioning";
import {
  createCreatorProfile,
  createVideoJob,
  getCreatorProfile,
  getVideoJob,
  markCreatorProfileReady,
  updateCreatorProfileAssets,
  updateVideoJob,
} from "./repository";
import {
  completePersistentAiStudioJob,
  runPersistentAiStudioJob,
} from "./runtime";
import {
  aiStudioSceneSchema,
  creatorPerformanceProfileSchema,
} from "./types";

async function requireAuth(req: Request, res: Response) {
  const ctx = await createContext({ req, res });
  if (!ctx.user || !ctx.workspaceId) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  return { userId: ctx.user.id, workspaceId: ctx.workspaceId };
}

function handleError(res: Response, error: unknown) {
  const status = (error as { status?: number })?.status ?? 400;
  const message = error instanceof Error ? error.message : "AI Studio request failed";
  res.status(status).json({ error: message });
}

function requireWorkerSecret(req: Request): void {
  const configured = process.env.AI_STUDIO_WORKER_SECRET?.trim();
  if (!configured) throw Object.assign(new Error("AI_STUDIO_WORKER_SECRET is not configured"), { status: 503 });
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token !== configured) throw Object.assign(new Error("Unauthorized worker callback"), { status: 401 });
}

const createProfileSchema = z.object({
  name: z.string().min(1).max(160),
  consentConfirmed: z.literal(true),
  profile: creatorPerformanceProfileSchema.omit({ creatorId: true }),
});

const createUploadSchema = z.object({
  profileId: z.string().uuid(),
  kind: z.enum(["training-video", "voice-sample"]),
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(120),
  contentLength: z.number().int().positive().max(500 * 1024 * 1024),
});

const confirmUploadSchema = z.object({
  profileId: z.string().uuid(),
  kind: z.enum(["training-video", "voice-sample"]),
  key: z.string().min(1).max(1000),
});

const createVideoSchema = z.object({
  creatorProfileId: z.string().uuid(),
  scriptId: z.string().max(64).optional(),
  title: z.string().min(1).max(240),
  aspectRatio: z.literal("9:16").default("9:16"),
  scenes: z.array(aiStudioSceneSchema).min(1).max(30),
});

export function registerAiStudioRoutes(app: Express): void {
  app.post("/api/ai-studio/profiles", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      const input = createProfileSchema.parse(req.body);
      const id = randomUUID();
      const profile = await createCreatorProfile({
        id,
        ...auth,
        name: input.name,
        consentConfirmed: true,
        profile: { ...input.profile, creatorId: id },
      });
      res.status(201).json(profile);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/ai-studio/profiles/:profileId", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      const profile = await getCreatorProfile({ id: z.string().uuid().parse(req.params.profileId), ...auth });
      if (!profile) return res.status(404).json({ error: "AI creator profile not found" });
      res.json(profile);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/ai-studio/uploads", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      const input = createUploadSchema.parse(req.body);
      const profile = await getCreatorProfile({ id: input.profileId, ...auth });
      if (!profile) return res.status(404).json({ error: "AI creator profile not found" });
      const upload = await createAiStudioUpload({ ...auth, ...input });
      res.status(201).json(upload);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/ai-studio/uploads/confirm", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      const input = confirmUploadSchema.parse(req.body);
      const expectedPrefix = `ai-studio/${auth.workspaceId}/profiles/${input.profileId}/`;
      if (!input.key.startsWith(expectedPrefix)) {
        return res.status(403).json({ error: "Upload does not belong to this profile" });
      }
      const profile = await getCreatorProfile({ id: input.profileId, ...auth });
      if (!profile) return res.status(404).json({ error: "AI creator profile not found" });
      await updateCreatorProfileAssets({
        id: input.profileId,
        ...auth,
        ...(input.kind === "training-video"
          ? { trainingVideoKey: input.key }
          : { voiceSampleKey: input.key }),
      });
      res.json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/ai-studio/profiles/:profileId/provision", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      const profileId = z.string().uuid().parse(req.params.profileId);
      const profile = await getCreatorProfile({ id: profileId, ...auth });
      if (!profile) return res.status(404).json({ error: "AI creator profile not found" });
      void provisionCreatorProfile({ profileId, ...auth }).catch(error => {
        console.error(`[aiStudio] creator provisioning ${profileId} failed`, error);
      });
      res.status(202).json({ profileId, status: "training" });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/ai-studio/profiles/:profileId/ready", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      const profileId = z.string().uuid().parse(req.params.profileId);
      const profile = await getCreatorProfile({ id: profileId, ...auth });
      if (!profile) return res.status(404).json({ error: "AI creator profile not found" });
      const input = z.object({
        voiceId: z.string().min(1).max(255).optional(),
        avatarId: z.string().min(1).max(255).optional(),
        providerMetadata: z.record(z.string(), z.unknown()).optional(),
      }).parse(req.body);
      await markCreatorProfileReady({ id: profileId, ...input });
      res.json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/ai-studio/jobs", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      const input = createVideoSchema.parse(req.body);
      const profile = await getCreatorProfile({ id: input.creatorProfileId, ...auth });
      if (!profile) return res.status(404).json({ error: "AI creator profile not found" });
      if (profile.status !== "ready" && process.env.AI_STUDIO_USE_MOCK_PROVIDERS !== "true") {
        return res.status(412).json({ error: "Your AI clone is still training" });
      }
      const job = await createVideoJob({
        ...input,
        workspaceId: auth.workspaceId,
        userId: String(auth.userId),
        profile: profile.profile,
      });
      void runPersistentAiStudioJob(job.id).catch(error => {
        console.error(`[aiStudio] render job ${job.id} failed`, error);
      });
      res.status(202).json(job);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.get("/api/ai-studio/jobs/:jobId", async (req, res) => {
    try {
      const auth = await requireAuth(req, res);
      const job = await getVideoJob({ id: z.string().uuid().parse(req.params.jobId), ...auth });
      if (!job) return res.status(404).json({ error: "AI Studio job not found" });
      res.json(job);
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/ai-studio/internal/jobs/:jobId/complete", async (req, res) => {
    try {
      requireWorkerSecret(req);
      const jobId = z.string().uuid().parse(req.params.jobId);
      const input = z.object({ outputUrl: z.string().url(), outputKey: z.string().optional() }).parse(req.body);
      await completePersistentAiStudioJob({ jobId, ...input });
      res.json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });

  app.post("/api/ai-studio/internal/jobs/:jobId/fail", async (req, res) => {
    try {
      requireWorkerSecret(req);
      const jobId = z.string().uuid().parse(req.params.jobId);
      const input = z.object({
        error: z.string().min(1).max(5000),
        step: z.string().min(1).max(120).optional(),
      }).parse(req.body);
      await updateVideoJob({
        id: jobId,
        status: "failed",
        progress: 100,
        currentStep: input.step || "Final video composition failed",
        error: input.error,
      });
      res.json({ success: true });
    } catch (error) {
      handleError(res, error);
    }
  });
}
