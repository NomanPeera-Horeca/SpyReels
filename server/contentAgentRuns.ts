import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "./db";
import {
  contentAgentRuns,
  contentAgentToolRuns,
  type ContentAgentRunRecord,
  type ContentAgentToolRunRecord,
} from "./contentAgentRunModel";

export type ContentAgentRunStatus =
  | "running"
  | "waiting_for_input"
  | "completed"
  | "failed"
  | "cancelled";

async function assertOwnedRun(args: {
  runId: string;
  workspaceId: string;
  userId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [run] = await db
    .select({ id: contentAgentRuns.id })
    .from(contentAgentRuns)
    .where(
      and(
        eq(contentAgentRuns.id, args.runId),
        eq(contentAgentRuns.workspaceId, args.workspaceId),
        eq(contentAgentRuns.userId, args.userId)
      )
    )
    .limit(1);
  if (!run) throw new Error("Agent run not found");
}

export async function createContentAgentRun(args: {
  userId: number;
  workspaceId: string;
  request: string;
  artifact?: { kind?: string | null; id?: number | null; title?: string | null } | null;
}): Promise<ContentAgentRunRecord> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const id = randomUUID();
  await db.insert(contentAgentRuns).values({
    id,
    userId: args.userId,
    workspaceId: args.workspaceId,
    request: args.request.trim(),
    status: "running",
    currentArtifactKind: args.artifact?.kind?.trim() || null,
    currentArtifactId: args.artifact?.id ?? null,
    currentArtifactTitle: args.artifact?.title?.trim().slice(0, 256) || null,
    pendingTool: null,
  });
  const [run] = await db
    .select()
    .from(contentAgentRuns)
    .where(
      and(
        eq(contentAgentRuns.id, id),
        eq(contentAgentRuns.workspaceId, args.workspaceId),
        eq(contentAgentRuns.userId, args.userId)
      )
    )
    .limit(1);
  if (!run) throw new Error("Could not create Agent run");
  return run;
}

export async function upsertContentAgentToolRun(args: {
  runId: string;
  workspaceId: string;
  userId: number;
  stepIndex: number;
  tool: string;
  status: ContentAgentRunStatus;
  action?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  errorMessage?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await assertOwnedRun(args);

  const terminal = ["completed", "failed", "cancelled"].includes(args.status);
  const values = {
    runId: args.runId,
    workspaceId: args.workspaceId,
    stepIndex: args.stepIndex,
    tool: args.tool,
    status: args.status,
    argsJson: args.action ?? null,
    resultJson: args.result ?? null,
    errorMessage: args.errorMessage?.trim() || null,
    completedAt: terminal ? new Date() : null,
  };
  await db
    .insert(contentAgentToolRuns)
    .values(values)
    .onDuplicateKeyUpdate({
      set: {
        tool: values.tool,
        status: values.status,
        argsJson: values.argsJson,
        resultJson: values.resultJson,
        errorMessage: values.errorMessage,
        completedAt: values.completedAt,
      },
    });
}

export async function updateContentAgentRun(args: {
  runId: string;
  workspaceId: string;
  userId: number;
  status: ContentAgentRunStatus;
  pendingTool?: string | null;
  artifact?: { kind?: string | null; id?: number | null; title?: string | null } | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await assertOwnedRun(args);

  const terminal = ["completed", "failed", "cancelled"].includes(args.status);
  await db
    .update(contentAgentRuns)
    .set({
      status: args.status,
      pendingTool: args.pendingTool?.trim() || null,
      ...(args.artifact
        ? {
            currentArtifactKind: args.artifact.kind?.trim() || null,
            currentArtifactId: args.artifact.id ?? null,
            currentArtifactTitle: args.artifact.title?.trim().slice(0, 256) || null,
          }
        : {}),
      completedAt: terminal ? new Date() : null,
    })
    .where(
      and(
        eq(contentAgentRuns.id, args.runId),
        eq(contentAgentRuns.workspaceId, args.workspaceId),
        eq(contentAgentRuns.userId, args.userId)
      )
    );
}

export async function getContentAgentRun(args: {
  runId: string;
  workspaceId: string;
  userId: number;
}): Promise<{
  run: ContentAgentRunRecord;
  tools: ContentAgentToolRunRecord[];
} | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [run] = await db
    .select()
    .from(contentAgentRuns)
    .where(
      and(
        eq(contentAgentRuns.id, args.runId),
        eq(contentAgentRuns.workspaceId, args.workspaceId),
        eq(contentAgentRuns.userId, args.userId)
      )
    )
    .limit(1);
  if (!run) return null;
  const tools = await db
    .select()
    .from(contentAgentToolRuns)
    .where(
      and(
        eq(contentAgentToolRuns.runId, args.runId),
        eq(contentAgentToolRuns.workspaceId, args.workspaceId)
      )
    )
    .orderBy(contentAgentToolRuns.stepIndex);
  return { run, tools };
}

export async function getLatestContentAgentRun(args: {
  workspaceId: string;
  userId: number;
}): Promise<{
  run: ContentAgentRunRecord;
  tools: ContentAgentToolRunRecord[];
} | null> {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const [run] = await db
    .select()
    .from(contentAgentRuns)
    .where(
      and(
        eq(contentAgentRuns.workspaceId, args.workspaceId),
        eq(contentAgentRuns.userId, args.userId)
      )
    )
    .orderBy(desc(contentAgentRuns.updatedAt))
    .limit(1);
  if (!run) return null;
  const tools = await db
    .select()
    .from(contentAgentToolRuns)
    .where(
      and(
        eq(contentAgentToolRuns.runId, run.id),
        eq(contentAgentToolRuns.workspaceId, args.workspaceId)
      )
    )
    .orderBy(contentAgentToolRuns.stepIndex);
  return { run, tools };
}
