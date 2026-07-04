import type { AgentProgressStep } from "@shared/agentProgress";

export type AgentProgressFlow = "onboarding" | "coach" | "plan";

export type AgentProgressState = {
  status: "running" | "done" | "error";
  steps: AgentProgressStep[];
  errorMessage?: string;
  updatedAt: number;
};

const progressByKey = new Map<string, AgentProgressState>();
const TTL_MS = 15 * 60 * 1000;

function progressKey(flow: AgentProgressFlow, userId: number): string {
  return `${flow}:${userId}`;
}

function pruneStale() {
  const cutoff = Date.now() - TTL_MS;
  for (const [key, state] of progressByKey) {
    if (state.updatedAt < cutoff) progressByKey.delete(key);
  }
}

export function initAgentProgress(args: {
  flow: AgentProgressFlow;
  userId: number;
  steps: AgentProgressStep[];
}): void {
  pruneStale();
  progressByKey.set(progressKey(args.flow, args.userId), {
    status: "running",
    steps: args.steps,
    updatedAt: Date.now(),
  });
}

export function setAgentProgressSteps(args: {
  flow: AgentProgressFlow;
  userId: number;
  steps: AgentProgressStep[];
}): void {
  const key = progressKey(args.flow, args.userId);
  const current = progressByKey.get(key);
  if (!current || current.status !== "running") return;
  progressByKey.set(key, {
    ...current,
    steps: args.steps,
    updatedAt: Date.now(),
  });
}

export function completeAgentProgress(flow: AgentProgressFlow, userId: number): void {
  const key = progressKey(flow, userId);
  const current = progressByKey.get(key);
  if (!current) return;
  progressByKey.set(key, {
    ...current,
    status: "done",
    updatedAt: Date.now(),
  });
}

export function failAgentProgress(args: {
  flow: AgentProgressFlow;
  userId: number;
  errorMessage: string;
}): void {
  const key = progressKey(args.flow, args.userId);
  const current = progressByKey.get(key);
  progressByKey.set(key, {
    status: "error",
    steps: current?.steps ?? [],
    errorMessage: args.errorMessage,
    updatedAt: Date.now(),
  });
}

export function clearAgentProgress(flow: AgentProgressFlow, userId: number): void {
  progressByKey.delete(progressKey(flow, userId));
}

export function getAgentProgress(
  flow: AgentProgressFlow,
  userId: number
): AgentProgressState | null {
  pruneStale();
  return progressByKey.get(progressKey(flow, userId)) ?? null;
}

export function scheduleClearAgentProgress(
  flow: AgentProgressFlow,
  userId: number,
  delayMs = 60_000
): void {
  setTimeout(() => {
    clearAgentProgress(flow, userId);
  }, delayMs);
}
