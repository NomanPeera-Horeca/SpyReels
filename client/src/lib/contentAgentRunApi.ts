import { getCurrentWorkspaceId } from "@/lib/trpc";
import { resolveAppUrl } from "@/lib/nativeApp";
import type {
  ContentAgentArtifactRef,
  ContentAgentToolResult,
} from "@shared/contentAgentExecutor";
import type { ContentAgentAction } from "@shared/contentAgentTools";

export type ContentAgentRunStatus =
  | "running"
  | "waiting_for_input"
  | "completed"
  | "failed"
  | "cancelled";

export type PersistedContentAgentRun = {
  id: string;
  request: string;
  status: ContentAgentRunStatus;
  currentArtifactKind?: string | null;
  currentArtifactId?: number | null;
  currentArtifactTitle?: string | null;
  pendingTool?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  updatedAt?: string | null;
};

export type PersistedContentAgentToolRun = {
  id?: number;
  runId: string;
  stepIndex: number;
  tool: string;
  status: ContentAgentRunStatus;
  argsJson?: Record<string, unknown> | null;
  resultJson?: Record<string, unknown> | null;
  errorMessage?: string | null;
};

export type PersistedContentAgentRunBundle = {
  run: PersistedContentAgentRun | null;
  tools: PersistedContentAgentToolRun[];
};

function headers(): Headers {
  const value = new Headers({ "content-type": "application/json" });
  const workspaceId = getCurrentWorkspaceId();
  if (workspaceId) value.set("x-workspace-id", workspaceId);
  return value;
}

async function parseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.trim()) return body.error;
  } catch {
    // Use the stable fallback below.
  }
  return "Could not save Agent progress.";
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(resolveAppUrl(path), {
    credentials: "include",
    ...init,
    headers: init?.headers ?? headers(),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return (await response.json()) as T;
}

function artifactPayload(artifact?: ContentAgentArtifactRef | null) {
  if (!artifact) return null;
  return {
    kind: artifact.kind,
    id: artifact.id ?? null,
    title: artifact.title?.trim() || null,
  };
}

export async function createAgentRun(args: {
  request: string;
  artifact?: ContentAgentArtifactRef | null;
}): Promise<PersistedContentAgentRun> {
  const data = await requestJson<{ run: PersistedContentAgentRun }>(
    "/api/content-agent/runs",
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        request: args.request,
        artifact: artifactPayload(args.artifact),
      }),
    }
  );
  return data.run;
}

export async function updateAgentRun(args: {
  runId: string;
  status: ContentAgentRunStatus;
  pendingTool?: string | null;
  artifact?: ContentAgentArtifactRef | null;
}): Promise<void> {
  await requestJson<{ ok: true }>(`/api/content-agent/runs/${args.runId}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify({
      status: args.status,
      pendingTool: args.pendingTool ?? null,
      artifact: artifactPayload(args.artifact),
    }),
  });
}

export async function updateAgentToolRun(args: {
  runId: string;
  stepIndex: number;
  tool: string;
  status: ContentAgentRunStatus;
  action?: ContentAgentAction | null;
  result?: ContentAgentToolResult | null;
  errorMessage?: string | null;
}): Promise<void> {
  await requestJson<{ ok: true }>(
    `/api/content-agent/runs/${args.runId}/tools/${args.stepIndex}`,
    {
      method: "PUT",
      headers: headers(),
      body: JSON.stringify({
        tool: args.tool,
        status: args.status,
        action: args.action ? { ...args.action } : null,
        result: args.result ? { ...args.result } : null,
        errorMessage: args.errorMessage?.trim() || null,
      }),
    }
  );
}

export async function loadLatestAgentRun(): Promise<PersistedContentAgentRunBundle> {
  return requestJson<PersistedContentAgentRunBundle>(
    "/api/content-agent/runs/latest",
    { method: "GET", headers: headers() }
  );
}
