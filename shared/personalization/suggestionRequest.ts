/**
 * When the onboarding screens ask for suggestions again.
 * The key changes when analyzed posts arrive or a goal/audience is confirmed,
 * so a run that only saw the biography is replaced. It does not change on
 * every poll while a job is still queued.
 */
export function suggestionRequestKey(input: {
  step: "goal" | "audience" | "pillars";
  version: number;
  analysisRunId: string | null;
  analysisStatus: string | null;
  postsInWindow: number | null;
  confirmedGoal: boolean;
  confirmedAudience: boolean;
  retry: number;
}): string {
  const posts = input.postsInWindow ?? 0;
  const phase =
    posts > 0
      ? `posts:${input.analysisRunId ?? "none"}:${posts}`
      : input.analysisStatus === "failed"
        ? `failed:${input.analysisRunId ?? "none"}`
        : "profile";
  return [
    input.step,
    input.version,
    phase,
    input.confirmedGoal ? "goal" : "no-goal",
    input.confirmedAudience ? "audience" : "no-audience",
    `r${input.retry}`,
  ].join(":");
}
