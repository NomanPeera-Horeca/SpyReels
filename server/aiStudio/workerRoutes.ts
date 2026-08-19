import type { Express, Request } from "express";
import { z } from "zod";
import { updateVideoJob } from "./repository";

function requireWorkerSecret(req: Request): void {
  const expected = process.env.AI_STUDIO_WORKER_SECRET?.trim();
  const supplied = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (!expected) throw Object.assign(new Error("AI_STUDIO_WORKER_SECRET is not configured"), { status: 503 });
  if (supplied !== expected) throw Object.assign(new Error("Unauthorized worker callback"), { status: 401 });
}

export function registerAiStudioWorkerRoutes(app: Express): void {
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
      const status = (error as { status?: number })?.status ?? 400;
      res.status(status).json({
        error: error instanceof Error ? error.message : "Worker callback failed",
      });
    }
  });
}
