/** Shared helpers for Idea to Script / Remake analytics and reports. */

export function truncateForAnalytics(text: string | null | undefined, maxLen = 600): string {
  const trimmed = String(text ?? "").trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

export function countWords(text: string | null | undefined): number {
  return String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function scriptHookPreview(text: string | null | undefined): string {
  const line = String(text ?? "")
    .trim()
    .split(/\n/)
    .find((l) => l.trim().length > 0);
  return truncateForAnalytics(line ?? "", 200);
}

export function readIdeaScriptJudgeMeta(viralStructure: unknown): {
  finalOverallScore?: number;
  skipRateScore?: number;
  framework?: string;
  finalDecision?: string;
} {
  if (!viralStructure || typeof viralStructure !== "object" || Array.isArray(viralStructure)) {
    return {};
  }
  const vs = viralStructure as Record<string, unknown>;
  const judge =
    vs.ideaScriptJudge && typeof vs.ideaScriptJudge === "object" && !Array.isArray(vs.ideaScriptJudge)
      ? (vs.ideaScriptJudge as Record<string, unknown>)
      : null;
  const meta =
    vs.ideaMeta && typeof vs.ideaMeta === "object" && !Array.isArray(vs.ideaMeta)
      ? (vs.ideaMeta as Record<string, unknown>)
      : null;

  return {
    finalOverallScore:
      typeof judge?.finalOverallScore === "number" ? judge.finalOverallScore : undefined,
    skipRateScore: typeof meta?.skipRateScore === "number" ? meta.skipRateScore : undefined,
    framework: typeof meta?.framework === "string" ? meta.framework : undefined,
    finalDecision: typeof judge?.finalDecision === "string" ? judge.finalDecision : undefined,
  };
}

export function buildIdeaScriptCompletedProps(input: {
  ideaId: number;
  userId: number;
  idea: string;
  niche?: string | null;
  generatedTitle?: string | null;
  generatedScript?: string | null;
  viralStructure?: unknown;
  source?: "server" | "client";
}): Record<string, unknown> {
  const judge = readIdeaScriptJudgeMeta(input.viralStructure);
  const script = input.generatedScript ?? "";
  return {
    pipeline: "idea_to_script",
    idea_id: input.ideaId,
    user_id: input.userId,
    user_idea: truncateForAnalytics(input.idea, 800),
    generated_title: truncateForAnalytics(input.generatedTitle, 200),
    generated_script: truncateForAnalytics(script, 2000),
    hook_preview: scriptHookPreview(script),
    word_count: countWords(script),
    niche: input.niche ?? null,
    judge_score: judge.finalOverallScore ?? null,
    skip_rate_score: judge.skipRateScore ?? null,
    judge_decision: judge.finalDecision ?? null,
    framework: judge.framework ?? null,
    capture_source: input.source ?? "server",
  };
}

export function buildIdeaScriptFailedProps(input: {
  ideaId: number;
  userId: number;
  idea: string;
  niche?: string | null;
  errorMessage?: string | null;
  source?: "server" | "client";
}): Record<string, unknown> {
  return {
    pipeline: "idea_to_script",
    idea_id: input.ideaId,
    user_id: input.userId,
    user_idea: truncateForAnalytics(input.idea, 800),
    niche: input.niche ?? null,
    error_message: truncateForAnalytics(input.errorMessage, 400),
    capture_source: input.source ?? "server",
  };
}

export function buildRemakeScriptCompletedProps(input: {
  scriptId: number;
  userId: number;
  topic: string;
  generatedScript?: string | null;
  source?: "server" | "client";
}): Record<string, unknown> {
  const script = input.generatedScript ?? "";
  return {
    pipeline: "remake",
    script_id: input.scriptId,
    user_id: input.userId,
    topic: truncateForAnalytics(input.topic, 400),
    generated_script: truncateForAnalytics(script, 2000),
    hook_preview: scriptHookPreview(script),
    word_count: countWords(script),
    capture_source: input.source ?? "server",
  };
}

export function buildRemakeScriptFailedProps(input: {
  scriptId: number;
  userId: number;
  topic: string;
  errorMessage?: string | null;
  source?: "server" | "client";
}): Record<string, unknown> {
  return {
    pipeline: "remake",
    script_id: input.scriptId,
    user_id: input.userId,
    topic: truncateForAnalytics(input.topic, 400),
    error_message: truncateForAnalytics(input.errorMessage, 400),
    capture_source: input.source ?? "server",
  };
}
