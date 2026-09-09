import type { Express, Request, Response } from "express";
import { z } from "zod";
import { sdk } from "./_core/sdk";
import {
  parseWorkspaceIdHeader,
  resolveWorkspaceContext,
} from "./_core/workspaceContext";
import {
  createContentAgentRun,
  getContentAgentRun,
  getLatestContentAgentRun,
  updateContentAgentRun,
  upsertContentAgentToolRun,
} from "./contentAgentRuns";

const statusSchema = z.enum([
  "running",
  "waiting_for_input",
  "completed",
  "failed",
  "cancelled",
]);
const artifactSchema = z.object({
  kind: z.string().trim().min(1).max(24).optional().nullable(),
  id: z.number().int().positive().optional().nullable(),
  title: z.string().trim().max(256).optional().nullable(),
}).optional().nullable();
const runIdSchema = z.string().uuid();

async function auth(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    const requestedWorkspaceId = parseWorkspaceIdHeader(req.headers["x-workspace-id"]);
    const resolved = await resolveWorkspaceContext(user.id, requestedWorkspaceId);
    return { userId: user.id, workspaceId: resolved.workspaceId };
  } catch {
    res.status(401).json({ error: "Sign in to continue your Agent work." });
    return null;
  }
}

function agentRunStatus(error: unknown): number {
  return error instanceof Error && error.message === "Agent run not found" ? 404 : 500;
}

export function registerContentAgentRunRoutes(app: Express): void {
  app.post("/api/content-agent/runs", async (req, res) => {
    const context = await auth(req, res);
    if (!context) return;
    const parsed = z.object({
      request: z.string().trim().min(1).max(20_000),
      artifact: artifactSchema,
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Invalid Agent request." });
    try {
      const run = await createContentAgentRun({
        ...context,
        request: parsed.data.request,
        artifact: parsed.data.artifact,
      });
      return res.json({ run });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Could not start Agent run.",
      });
    }
  });

  app.patch("/api/content-agent/runs/:runId", async (req, res) => {
    const context = await auth(req, res);
    if (!context) return;
    const id = runIdSchema.safeParse(req.params.runId);
    const body = z.object({
      status: statusSchema,
      pendingTool: z.string().trim().max(64).optional().nullable(),
      artifact: artifactSchema,
    }).safeParse(req.body);
    if (!id.success || !body.success) return res.status(400).json({ error: "Invalid Agent run update." });
    try {
      await updateContentAgentRun({
        runId: id.data,
        ...context,
        status: body.data.status,
        pendingTool: body.data.pendingTool,
        artifact: body.data.artifact,
      });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(agentRunStatus(error)).json({
        error: error instanceof Error ? error.message : "Could not update Agent run.",
      });
    }
  });

  app.put("/api/content-agent/runs/:runId/tools/:stepIndex", async (req, res) => {
    const context = await auth(req, res);
    if (!context) return;
    const id = runIdSchema.safeParse(req.params.runId);
    const step = z.coerce.number().int().min(0).max(20).safeParse(req.params.stepIndex);
    const body = z.object({
      tool: z.string().trim().min(1).max(64),
      status: statusSchema,
      action: z.record(z.string(), z.unknown()).optional().nullable(),
      result: z.record(z.string(), z.unknown()).optional().nullable(),
      errorMessage: z.string().trim().max(4000).optional().nullable(),
    }).safeParse(req.body);
    if (!id.success || !step.success || !body.success) return res.status(400).json({ error: "Invalid Agent tool update." });
    try {
      await upsertContentAgentToolRun({
        runId: id.data,
        ...context,
        stepIndex: step.data,
        tool: body.data.tool,
        status: body.data.status,
        action: body.data.action,
        result: body.data.result,
        errorMessage: body.data.errorMessage,
      });
      return res.json({ ok: true });
    } catch (error) {
      return res.status(agentRunStatus(error)).json({
        error: error instanceof Error ? error.message : "Could not update Agent tool run.",
      });
    }
  });

  app.get("/api/content-agent/runs/latest", async (req, res) => {
    const context = await auth(req, res);
    if (!context) return;
    try {
      const data = await getLatestContentAgentRun(context);
      return res.json(data ?? { run: null, tools: [] });
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Could not load Agent run.",
      });
    }
  });

  app.get("/api/content-agent/runs/:runId", async (req, res) => {
    const context = await auth(req, res);
    if (!context) return;
    const id = runIdSchema.safeParse(req.params.runId);
    if (!id.success) return res.status(400).json({ error: "Invalid Agent run id." });
    try {
      const data = await getContentAgentRun({ runId: id.data, ...context });
      if (!data) return res.status(404).json({ error: "Agent run not found." });
      return res.json(data);
    } catch (error) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : "Could not load Agent run.",
      });
    }
  });
}
