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
import { createExistingProviderSource } from "./analysis/existingProviderSource";
import { runProfileAnalysis } from "./analysis/runProfileAnalysis";
import {
  generateRecommendations,
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
  | { state: "running" }
  | { state: "done" }
  | { state: "failed" }
  | { state: "clarify"; question: string };

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

export function recommendationJobKeyFor(profileId: string, step: RecommendationStep, version: number) {
  return `personalization_recommendations:${profileId}:${step}:v${version}`;
}

function stateFromResult(r: RecommendationResult): RecommendationJobState {
  if (r.status === "failed") return { state: "failed" };
  if (r.status === "needs_clarification") return { state: "clarify", question: r.question };
  return { state: "done" };
}

/** What the UI shows while it waits: running, done, failed, or a clarifying question. */
export async function getRecommendationState(
  profileId: string,
  step: RecommendationStep,
  version: number
): Promise<RecommendationJobState | null> {
  const key = recommendationJobKeyFor(profileId, step, version);
  const known = recommendationStates.get(key);
  if (known) return known;
  if (!isPilotQueueEnabled("personalization_recommendations")) return null;
  const db = await requireDb();
  const { sql } = await import("drizzle-orm");
  const res = await db.execute(
    sql`SELECT status FROM durable_jobs WHERE idempotencyKey = ${key} LIMIT 1`
  );
  const rows = (res as unknown as [Array<{ status: string }>])[0] ?? [];
  const status = rows[0]?.status;
  if (!status) return null;
  if (status === "queued" || status === "running") return { state: "running" };
  if (status === "succeeded") return { state: "done" };
  return { state: "failed" };
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
  const key = recommendationJobKeyFor(payload.socialProfileId, payload.step, version);
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
      rememberState(key, stateFromResult(await runRecommendationJob(payload)));
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
    const result = await runRecommendationJob(job.payload as RecommendationPayload);
    // Model timeouts / outages: let the durable queue retry the same job.
    if (result.status === "failed" && result.kind !== "invalid_output") {
      throw new Error(`recommendations_${result.kind}`);
    }
  });
}
