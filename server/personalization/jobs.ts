/**
 * Runs the two personalization jobs on the EXISTING durable job system
 * (REUSE: durable_jobs, enqueueDurableJob, the worker and its handlers map).
 * No second queue.
 *
 * - profile_analysis: runProfileAnalysis (Phase 3), first analysis free.
 * - personalization_recommendations: generateRecommendations (Phase 4).
 *
 * Same switch as the other pilot jobs: when DURABLE_QUEUE_PERSONALIZATION_ENABLED
 * is "true" the job goes to durable_jobs and the worker runs it (retries,
 * leases, crash recovery). Otherwise it runs inline in the web process,
 * exactly like dispatchPilotJob does for the other job types. Both paths
 * are idempotent, so a repeated request never pays twice.
 */
import { stableHash } from "@shared/personalization/state";
import { enqueueDurableJob } from "../durableJobs/queue";
import { isPilotQueueEnabled } from "../durableJobs/dispatch";
import { registerDurableJobHandler } from "../durableJobs/handlers";
import type { ClaimedJob } from "../durableJobs/types";
import { getDb } from "../db";
import { createAnalysisStore, createRecommendationStore, type Db } from "./db/analysisStore";
import {
  PROFILE_ANALYSIS_MAX_ATTEMPTS,
  type DurableEnqueue,
  type ProfileAnalysisPayload,
} from "./analysis/contract";
import { createPostClassifier } from "./analysis/classifyPosts";
import { createExistingProviderSource } from "./analysis/existingProviderSource";
import { runProfileAnalysis } from "./analysis/runProfileAnalysis";
import { buildCreatorEvidence } from "./intelligence/evidence";
import {
  generateRecommendations,
  stepSuggestionsSaved,
  type RecommendationResult,
  type RecommendationStep,
} from "./intelligence/recommendationService";

export const RECOMMENDATION_MAX_ATTEMPTS = 2;

export type RecommendationPayload = {
  workspaceId: string;
  userId: number;
  socialProfileId: string;
  step: RecommendationStep;
};

async function requireDb(): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db as Db;
}

async function runAnalysisJob(payload: ProfileAnalysisPayload, attempt: number, maxAttempts: number) {
  const db = await requireDb();
  return runProfileAnalysis(
    { payload, attempt, maxAttempts },
    {
      store: createAnalysisStore(db),
      source: createExistingProviderSource(),
      classify: createPostClassifier(),
      // Goal / Audience / Pillars run as their own job once the user reaches step 4.
      suggestions: null,
      now: () => new Date(),
    }
  );
}

export async function runRecommendationJob(
  payload: RecommendationPayload
): Promise<RecommendationResult> {
  const db = await requireDb();
  return generateRecommendations(
    { store: createRecommendationStore(db) },
    {
      ctx: {
        user: { id: payload.userId },
        workspaceId: payload.workspaceId,
        // The worker re-checks ownership through the profile's workspace.
        workspaceRole: "member",
      },
      socialProfileId: payload.socialProfileId,
      step: payload.step,
    }
  );
}

const inlineRunning = new Set<string>();

export type RecommendationJobState =
  | { state: "running"; at?: number }
  | { state: "done"; at?: number }
  | { state: "failed"; at?: number }
  | { state: "clarify"; question: string; at?: number };

/** Last known state per job key (inline path; bounded, newest wins). */
const recommendationStates = new Map<string, RecommendationJobState>();

function rememberState(key: string, state: RecommendationJobState) {
  recommendationStates.delete(key);
  recommendationStates.set(key, state);
  if (recommendationStates.size > 2000) {
    const oldest = recommendationStates.keys().next().value;
    if (oldest) recommendationStates.delete(oldest);
  }
}

/**
 * Changes when stored posts change, so a suggestion built from the biography
 * is not reused after the analysis snapshot arrives. No handle or caption is hashed.
 */
export async function recommendationEvidenceKey(profileId: string): Promise<string> {
  const db = await requireDb();
  const snapshot = await createRecommendationStore(db).loadLatestSnapshot(profileId);
  if (!snapshot || snapshot.posts.length === 0) return "profile";
  const ids = snapshot.posts.map(post => post.postId).sort().join(",");
  return stableHash(`${snapshot.posts.length}:${ids}`).slice(0, 16);
}

export async function recommendationJobKeyFor(
  profileId: string,
  step: RecommendationStep,
  version: number
) {
  const evidence = await recommendationEvidenceKey(profileId);
  return `personalization_recommendations:${profileId}:${step}:v${version}:${evidence}`;
}

function stateFromResult(r: RecommendationResult): RecommendationJobState {
  if (r.status === "failed") return { state: "failed" };
  if (r.status === "needs_clarification") return { state: "clarify", question: r.question };
  return { state: "done" };
}

type RecommendationOutcome = {
  state: "done" | "failed" | "clarify";
  question?: string;
};

function outcomeFromResult(result: RecommendationResult): RecommendationOutcome {
  if (result.status === "failed") return { state: "failed" };
  if (result.status === "needs_clarification") return { state: "clarify", question: result.question };
  return { state: "done" };
}

function readOutcome(payload: unknown): RecommendationOutcome | null {
  const value =
    typeof payload === "string"
      ? (() => {
          try {
            return JSON.parse(payload) as unknown;
          } catch {
            return null;
          }
        })()
      : payload;
  if (!value || typeof value !== "object" || !("outcome" in value)) return null;
  const outcome = (value as { outcome?: unknown }).outcome;
  if (!outcome || typeof outcome !== "object") return null;
  const state = (outcome as { state?: unknown }).state;
  const question = (outcome as { question?: unknown }).question;
  if (state === "clarify" && typeof question === "string" && question.trim()) {
    return { state: "clarify", question };
  }
  if (state === "failed") return { state: "failed" };
  if (state === "done") return { state: "done" };
  return null;
}

/**
 * Terminal state comes from the database. Process memory only covers the
 * moment before that write, on the instance that is running the job.
 */
export function recommendationStateFromSources(input: {
  job: { status: string; payload: unknown; at: number | null } | null;
  memory: RecommendationJobState | null;
  suggestionsSaved: boolean;
}): RecommendationJobState | null {
  // This process just started the job. An older finished row must not hide that.
  if (input.memory?.state === "running") return { state: "running", at: Date.now() };
  const job = input.job;
  const at = job?.at ?? undefined;
  if (job && (job.status === "failed" || job.status === "dead")) return { state: "failed", at };
  if (job && job.status === "succeeded") {
    const outcome = readOutcome(job.payload);
    if (outcome?.state === "clarify" && outcome.question) {
      return { state: "clarify", question: outcome.question, at };
    }
    if (outcome?.state === "failed") return { state: "failed", at };
    return { state: "done", at };
  }
  if (input.suggestionsSaved) return { state: "done", at: at ?? 1 };
  if (job && (job.status === "queued" || job.status === "running")) return { state: "running", at };
  if (input.memory) return input.memory;
  return null;
}

function jobUpdatedAt(value: unknown): number | null {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function loadJobRow(
  key: string
): Promise<{ status: string; payload: unknown; at: number | null } | null> {
  const db = await requireDb();
  const { sql } = await import("drizzle-orm");
  const res = await db.execute(
    sql`SELECT status, payload, updatedAt FROM durable_jobs WHERE idempotencyKey = ${key} LIMIT 1`
  );
  const rows =
    (res as unknown as [Array<{ status: string; payload: unknown; updatedAt: unknown }>])[0] ?? [];
  const row = rows[0];
  if (!row) return null;
  return { status: row.status, payload: row.payload, at: jobUpdatedAt(row.updatedAt) };
}

/**
 * Writes the outcome where every web instance can read it.
 * Inline inserts a finished row. It never inserts `queued`, so a worker that
 * does not yet know this job type cannot claim it.
 * The durable handler only updates payload. The worker still owns status,
 * retries, and the lease.
 */
async function persistRecommendationOutcome(
  key: string,
  payload: RecommendationPayload,
  result: RecommendationResult,
  mode: "inline" | "attached"
): Promise<void> {
  const db = await requireDb();
  const { sql } = await import("drizzle-orm");
  const body = JSON.stringify({ ...payload, outcome: outcomeFromResult(result) });
  if (mode === "attached") {
    await db.execute(sql`UPDATE durable_jobs SET payload = ${body} WHERE idempotencyKey = ${key}`);
    return;
  }
  const status = result.status === "failed" ? "failed" : "succeeded";
  const lastError = result.status === "failed" ? `recommendations_${result.kind}` : null;
  await db.execute(sql`
    INSERT INTO durable_jobs
      (jobType, idempotencyKey, payload, status, attempt, maxAttempts, completedAt, lastError)
    VALUES
      ('personalization_recommendations', ${key}, ${body}, ${status}, 1, ${RECOMMENDATION_MAX_ATTEMPTS}, NOW(3), ${lastError})
    ON DUPLICATE KEY UPDATE
      payload = VALUES(payload),
      lastError = IF(status IN ('queued', 'running'), lastError, VALUES(lastError)),
      completedAt = IF(status IN ('queued', 'running'), completedAt, NOW(3)),
      status = IF(status IN ('queued', 'running'), status, VALUES(status))
  `);
}

async function suggestionsSavedFor(
  profileId: string,
  workspaceId: string,
  step: RecommendationStep
): Promise<boolean> {
  const db = await requireDb();
  const store = createRecommendationStore(db);
  const profile = await store.loadProfile(profileId, workspaceId);
  if (!profile || profile.deletedAt) return false;
  const items = await store.loadItems(profileId);
  const snapshot = await store.loadLatestSnapshot(profileId);
  const evidence = buildCreatorEvidence({
    platform: profile.platform,
    displayName: profile.displayName,
    bio: profile.bio,
    snapshot,
    items,
  });
  return stepSuggestionsSaved(items, step, evidence);
}

/** What the UI shows while it waits: running, done, failed, or a clarifying question. */
export async function getRecommendationState(
  profileId: string,
  workspaceId: string,
  step: RecommendationStep,
  version: number
): Promise<RecommendationJobState | null> {
  const key = await recommendationJobKeyFor(profileId, step, version);
  const job = await loadJobRow(key).catch(() => null);
  const suggestionsSaved = await suggestionsSavedFor(profileId, workspaceId, step).catch(() => false);
  return recommendationStateFromSources({
    job,
    memory: recommendationStates.get(key) ?? null,
    suggestionsSaved,
  });
}

function runInlineOnce(key: string, task: () => Promise<unknown>) {
  if (inlineRunning.has(key)) return;
  inlineRunning.add(key);
  void task()
    .catch(err =>
      console.error(
        `[personalization] inline job failed (${key.split(":")[0]})`,
        err instanceof Error ? err.message : err
      )
    )
    .finally(() => inlineRunning.delete(key));
}

/** DurableEnqueue used by requestProfileAnalysis. */
export const enqueueProfileAnalysis: DurableEnqueue = async input => {
  if (isPilotQueueEnabled("profile_analysis")) {
    return enqueueDurableJob({
      jobType: "profile_analysis",
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
      maxAttempts: input.maxAttempts,
      requeueIfTerminal: input.requeueIfTerminal,
    });
  }
  // Inline: one attempt; a failure leaves the run "failed" and the user can retry.
  runInlineOnce(input.idempotencyKey, () => runAnalysisJob(input.payload, 1, 1));
  return 0;
};

/**
 * Starts (or reuses) a recommendation generation for one step. The key
 * includes the personalization version, so an edit upstream starts a new
 * job while repeated taps for the same answers collapse into one.
 */
export async function enqueueRecommendations(
  payload: RecommendationPayload,
  version: number
): Promise<"durable" | "inline"> {
  const key = await recommendationJobKeyFor(payload.socialProfileId, payload.step, version);
  if (isPilotQueueEnabled("personalization_recommendations")) {
    await enqueueDurableJob({
      jobType: "personalization_recommendations",
      idempotencyKey: key,
      payload,
      maxAttempts: RECOMMENDATION_MAX_ATTEMPTS,
      // A finished success stays finished. Failed and dead jobs still requeue
      // (the queue resets those statuses on a duplicate key). This stops a
      // reload from starting a second model call for the same answers.
      requeueIfTerminal: false,
    });
    return "durable";
  }
  if (!inlineRunning.has(key)) rememberState(key, { state: "running" });
  runInlineOnce(key, async () => {
    try {
      const result = await runRecommendationJob(payload);
      if (result.status === "failed") {
        console.warn("[personalization] recommendations_failed", {
          step: payload.step,
          kind: result.kind,
          profileId: payload.socialProfileId,
        });
      }
      await persistRecommendationOutcome(key, payload, result, "inline");
      rememberState(key, stateFromResult(result));
    } catch (err) {
      rememberState(key, { state: "failed" });
      throw err;
    }
  });
  return "inline";
}

let registered = false;

/** Registers both handlers with the existing worker (idempotent). */
export function registerPersonalizationJobHandlers(): void {
  if (registered) return;
  registered = true;
  registerDurableJobHandler("profile_analysis", async (job: ClaimedJob) => {
    const payload = job.payload as ProfileAnalysisPayload;
    await runAnalysisJob(payload, job.attempt, Math.min(job.maxAttempts, PROFILE_ANALYSIS_MAX_ATTEMPTS));
  });
  registerDurableJobHandler("personalization_recommendations", async (job: ClaimedJob) => {
    const payload = job.payload as RecommendationPayload;
    const result = await runRecommendationJob(payload);
    if (result.status === "failed") {
      console.warn("[personalization] recommendations_failed", {
        step: payload.step,
        kind: result.kind,
        profileId: payload.socialProfileId,
      });
    }
    await persistRecommendationOutcome(job.idempotencyKey, payload, result, "attached");
    // Model timeouts / outages: let the durable queue retry the same job.
    if (result.status === "failed" && result.kind !== "invalid_output") {
      throw new Error(`recommendations_${result.kind}`);
    }
  });
}
