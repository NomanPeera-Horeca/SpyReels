/**
 * profile_analysis job handler (runs inside the existing durable worker).
 *
 * Lifecycle: queued -> running -> succeeded | partial | failed, with per-stage
 * status. Recovery rules:
 * - Resumable: stage 1 saves a snapshot of the fetched posts. Any later
 *   attempt (retry, lease expiry after a crash, a user "try again") reuses the
 *   snapshot and does NOT call the provider again.
 * - Transient provider errors are re-thrown so the durable queue retries the
 *   SAME job (same row, same key). On the last attempt the run is marked
 *   failed instead, so it never stays "running" forever.
 * - Permanent errors (private account, not found) finish the run as failed
 *   without retrying and update the profile status. Personalization stays
 *   completable from profile info and the user's own answers.
 * - Suggestion failures make the run "partial". Confirmed values are never
 *   touched: suggestions are inserted through planAiSuggestionMerge and old
 *   unconfirmed AI rows are only superseded.
 */
import {
  ANALYSIS_STAGES,
  type AnalysisStage,
} from "@shared/personalization/model";
import {
  deriveRunStatus,
  idsToSupersedeOnRegeneration,
  planAiSuggestionMerge,
} from "@shared/personalization/state";
import {
  PROFILE_ANALYSIS_WINDOW_DAYS,
  ProviderError,
  type AnalysisStore,
  type ClaimedAnalysisJob,
  type ProfileDataSource,
  type SuggestionEngine,
} from "./contract";

export type AnalysisOutcome =
  | { outcome: "missing_run" }
  | { outcome: "already_finished"; status: string }
  | {
      outcome: "finished";
      status: string;
      errorCode: string | null;
      providerCalled: boolean;
    };

const ANALYZABLE = new Set(["pending_confirmation", "confirmed"]);
const SUGGESTION_STAGES: AnalysisStage[] = [
  "hooks_and_topics",
  "niche_opportunities",
];

export async function runProfileAnalysis(
  job: ClaimedAnalysisJob,
  deps: {
    store: AnalysisStore;
    source: ProfileDataSource;
    suggestions: SuggestionEngine | null;
    now: () => Date;
  }
): Promise<AnalysisOutcome> {
  const { store } = deps;
  const { runId, workspaceId, socialProfileId } = job.payload;
  const isLastAttempt = job.attempt >= job.maxAttempts;

  const run = await store.loadRun(runId, workspaceId);
  if (!run || run.socialProfileId !== socialProfileId)
    return { outcome: "missing_run" };
  if (run.status !== "queued" && run.status !== "running") {
    return { outcome: "already_finished", status: run.status };
  }

  const finish = async (errorCode: string | null, forced?: "failed") => {
    const current = (await store.loadRun(runId, workspaceId))!;
    const status = forced ?? deriveRunStatus(current.stages);
    await store.finishRun(runId, status, errorCode, deps.now());
    return { outcome: "finished" as const, status, errorCode, providerCalled };
  };
  let providerCalled = false;

  const profile = await store.loadProfile(socialProfileId, workspaceId);
  if (!profile || profile.deletedAt !== null)
    return finish("profile_unavailable", "failed");
  if (
    !ANALYZABLE.has(profile.status) ||
    !profile.platform ||
    !profile.normalizedHandle
  ) {
    return finish("not_analyzable", "failed");
  }

  await store.markRunRunning(runId, deps.now());

  // Stage 1: published content (the only stage that calls the provider).
  let snapshot = run.snapshot;
  if (!snapshot) {
    await store.setStage(runId, "published_content", "running");
    const windowEnd = deps.now();
    const windowStart = new Date(
      windowEnd.getTime() - PROFILE_ANALYSIS_WINDOW_DAYS * 86_400_000
    );
    try {
      providerCalled = true;
      const fetched = await deps.source.fetchPosts({
        platform: profile.platform,
        handle: profile.normalizedHandle,
        windowStart,
        windowEnd,
      });
      snapshot = fetched.snapshot;
      await store.saveSnapshot(runId, snapshot, fetched.providerCalls);
    } catch (err) {
      const kind = err instanceof ProviderError ? err.kind : "transient";
      if (kind === "private" || kind === "not_found") {
        await store.setStage(runId, "published_content", "failed", kind);
        await store.setProfileStatus(
          profile.id,
          kind === "private" ? "private" : "not_found"
        );
        for (const s of ANALYSIS_STAGES.slice(1))
          await store.setStage(runId, s, "skipped");
        return finish(
          kind === "private" ? "private_account" : "account_not_found",
          "failed"
        );
      }
      if (isLastAttempt) {
        await store.setStage(runId, "published_content", "failed", kind);
        for (const s of ANALYSIS_STAGES.slice(1))
          await store.setStage(runId, s, "skipped");
        return finish("provider_unavailable", "failed");
      }
      await store.setStage(runId, "published_content", "waiting", kind);
      throw err; // durable queue retries the same job
    }
  }
  await store.setStage(runId, "published_content", "done");

  // No public posts: nothing measured, nothing invented. Personalization continues from profile info.
  if (snapshot.posts.length === 0) {
    for (const s of ANALYSIS_STAGES.slice(1))
      await store.setStage(runId, s, "skipped");
    return finish(null);
  }

  // Stage 2: strongest performers. Pure ranking over the snapshot; nothing extra stored.
  await store.setStage(runId, "strongest_performers", "done");

  // Stages 3 and 4: AI suggestions (optional until an engine is approved and wired).
  if (!deps.suggestions) {
    for (const s of SUGGESTION_STAGES)
      await store.setStage(runId, s, "skipped");
    return finish(null);
  }
  for (const s of SUGGESTION_STAGES) await store.setStage(runId, s, "running");
  try {
    const existing = await store.loadItems(profile.id);
    const version = await store.loadPersonalizationVersion(profile.id);
    const raw = await deps.suggestions.suggest({
      runId,
      snapshot,
      confirmed: existing.filter(i => i.status === "confirmed"),
    });
    // Measured findings must cite THIS run.
    const suggestions = raw.map(s =>
      s.evidence === "performance_backed" ? { ...s, analysisRunId: runId } : s
    );
    const merge = planAiSuggestionMerge(
      existing,
      suggestions,
      version,
      "available"
    );
    const kinds = [...new Set(merge.insert.map(i => i.kind))];
    const supersede = idsToSupersedeOnRegeneration(existing, runId, kinds);
    await store.applySuggestions(profile.id, supersede, merge.insert);
    for (const s of SUGGESTION_STAGES) await store.setStage(runId, s, "done");
    return finish(null);
  } catch {
    for (const s of SUGGESTION_STAGES)
      await store.setStage(runId, s, "failed", "suggestion_failed");
    return finish("suggestion_failed");
  }
}
