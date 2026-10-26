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
  stepHasLiveSuggestions,
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
      // Goal / Audience / Pillars are their own jobs. Confirm starts them
      // from profile evidence. This analysis job does not write suggestions.
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
/**
 * Post fingerprint, plus a website marker only after useful site facts exist.
 * Profiles with no website keep the previous key, so a finished job is not rerun.
 */
export function recommendationEvidenceToken(
  postIds: string[],
  websiteLines: string[]
): string {
  const ids = [...postIds].filter(Boolean).sort();
  const posts =
    ids.length === 0
      ? "profile"
      : stableHash(`${ids.length}:${ids.join(",")}`).slice(0, 16);
  const lines = websiteLines.map(line => line.trim()).filter(Boolean).sort();
  if (lines.length === 0) return posts;
  return `${posts}:w${stableHash(lines.join("|")).slice(0, 12)}`;
}

export async function recommendationEvidenceKey(profileId: string): Promise<string> {
  const db = await requireDb();
  const snapshot = await createRecommendationStore(db).loadLatestSnapshot(profileId);
  const site = snapshot?.profileEvidence?.website;
  const websiteLines = site
    ? [...site.offers, ...site.callsToAction, ...site.customers, ...site.goalEvidence]
    : [];
  return recommendationEvidenceToken(
    snapshot?.posts.map(post => post.postId) ?? [],
    websiteLines
  );
}

/**
 * Confirmed goal text, plus confirmed audiences when drafting pillars.
 * Suggested rows are excluded so a finished abstention stays on one key.
 * A later confirmed answer changes the key once, which lets niche and the
 * next step run. Reloading the same answers does not.
 */
export function confirmedAnswerKey(
  step: RecommendationStep,
  items: Array<{ kind: string; status: string; payload: unknown }>
): string {
  const line = (item: { kind: string; payload: unknown }) => {
    const payload = item.payload as { text?: string; who?: string; outcome?: string };
    if (item.kind === "goal") return payload.text?.trim() ?? "";
    if (item.kind === "audience") return `${payload.who?.trim() ?? ""}|${payload.outcome?.trim() ?? ""}`;
    return "";
  };
  const goals = items
    .filter(item => item.kind === "goal" && item.status === "confirmed")
    .map(line)
    .filter(Boolean)
    .sort();
  const audiences =
    step === "pillars"
      ? items
          .filter(item => item.kind === "audience" && item.status === "confirmed")
          .map(line)
          .filter(Boolean)
          .sort()
      : [];
  const body = [...goals.map(goal => `g:${goal}`), ...audiences.map(audience => `a:${audience}`)].join(
    "\n"
  );
  return body ? stableHash(body).slice(0, 16) : "open";
}

export function recommendationJobKey(input: {
  profileId: string;
  step: RecommendationStep;
  version: number;
  evidence: string;
  answerKey: string;
}): string {
  return `personalization_recommendations:${input.profileId}:${input.step}:v${input.version}:${input.evidence}:a${input.answerKey}`;
}

export async function recommendationJobKeyFor(
  profileId: string,
  step: RecommendationStep,
  version: number
) {
  const evidence = await recommendationEvidenceKey(profileId);
  const db = await requireDb();
  const items = await createRecommendationStore(db).loadItems(profileId);
  return recommendationJobKey({
    profileId,
    step,
    version,
    evidence,
    answerKey: confirmedAnswerKey(step, items),
  });
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
 * A finished database row wins over stale process memory. Memory covers only
 * a retry that started after that row. An empty result is not a running job.
 * Saved suggestions still count when they were written for older evidence.
 */
export function recommendationStateFromSources(input: {
  job: { status: string; payload: unknown; at: number | null } | null;
  memory: RecommendationJobState | null;
  suggestionsSaved: boolean;
  liveSuggestions?: boolean;
}): RecommendationJobState | null {
  const job = input.job;
  const at = job?.at ?? undefined;
  const terminal =
    job != null &&
    (job.status === "succeeded" || job.status === "failed" || job.status === "dead");
  const memoryAt = input.memory?.state === "running" ? (input.memory.at ?? null) : null;
  const inFlight =
    memoryAt != null && (!terminal || job?.at == null || memoryAt > job.at);
  if (inFlight) return { state: "running", at: memoryAt ?? undefined };
  if (job && (job.status === "failed" || job.status === "dead")) return { state: "failed", at };
  if (job && job.status === "succeeded") {
    const outcome = readOutcome(job.payload);
    if (outcome?.state === "clarify" && outcome.question) {
      return { state: "clarify", question: outcome.question, at };
    }
    if (outcome?.state === "failed") return { state: "failed", at };
    return { state: "done", at };
  }
  if (input.suggestionsSaved || input.liveSuggestions) return { state: "done", at: at ?? 1 };
  if (job && (job.status === "queued" || job.status === "running")) return { state: "running", at };
  if (input.memory && input.memory.state !== "running") return input.memory;
  return null;
}

/** A row for this evidence key already ran. Do not call the model again. */
export function shouldStartRecommendationJob(existingStatus: string | null): boolean {
  return existingStatus == null;
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
 * Inserts a running row before any model call. The unique idempotency key
 * lets only one web process own the job. A second process sees the fresh
 * lease and does not start another paid call. An expired lease can be taken
 * once attempt is still under maxAttempts. Succeeded, failed, dead, and
 * queued rows are left alone.
 */
export async function claimInlineRecommendation(
  key: string,
  payload: unknown
): Promise<{ owned: boolean; token: string }> {
  const db = await requireDb();
  const { sql } = await import("drizzle-orm");
  const { randomUUID } = await import("node:crypto");
  const { DEFAULT_LEASE_SECONDS } = await import("../durableJobs/policy");
  const token = `inline:${randomUUID()}`;
  const body = JSON.stringify(payload);
  await db.execute(sql`
    INSERT INTO durable_jobs
      (jobType, idempotencyKey, payload, status, attempt, maxAttempts, lockedBy, leaseExpiresAt, availableAt)
    VALUES
      (
        'personalization_recommendations',
        ${key},
        ${body},
        'running',
        1,
        ${RECOMMENDATION_MAX_ATTEMPTS},
        ${token},
        DATE_ADD(NOW(3), INTERVAL ${DEFAULT_LEASE_SECONDS} SECOND),
        NOW(3)
      )
    ON DUPLICATE KEY UPDATE
      lockedBy = IF(
        status = 'running'
          AND leaseExpiresAt IS NOT NULL
          AND leaseExpiresAt < NOW(3)
          AND attempt < maxAttempts,
        VALUES(lockedBy),
        lockedBy
      ),
      leaseExpiresAt = IF(
        status = 'running'
          AND leaseExpiresAt IS NOT NULL
          AND leaseExpiresAt < NOW(3)
          AND attempt < maxAttempts,
        VALUES(leaseExpiresAt),
        leaseExpiresAt
      ),
      attempt = IF(
        status = 'running'
          AND leaseExpiresAt IS NOT NULL
          AND leaseExpiresAt < NOW(3)
          AND attempt < maxAttempts,
        attempt + 1,
        attempt
      )
  `);
  const res = await db.execute(
    sql`SELECT lockedBy, status FROM durable_jobs WHERE idempotencyKey = ${key} LIMIT 1`
  );
  const row = (
    (res as unknown as [Array<{ lockedBy: string | null; status: string }>])[0] ?? []
  )[0];
  return {
    owned: row?.status === "running" && row.lockedBy === token,
    token,
  };
}

/** Writes the outcome only while this token still owns the running row. */
export async function finishInlineRecommendation(
  key: string,
  token: string,
  payload: RecommendationPayload,
  result: RecommendationResult
): Promise<boolean> {
  const db = await requireDb();
  const { sql } = await import("drizzle-orm");
  const body = JSON.stringify({ ...payload, outcome: outcomeFromResult(result) });
  const status = result.status === "failed" ? "failed" : "succeeded";
  const updated = await db.execute(sql`
    UPDATE durable_jobs
    SET
      payload = ${body},
      status = ${status},
      lastError = ${recommendationFailureDetail(result)},
      completedAt = NOW(3),
      lockedBy = NULL,
      leaseExpiresAt = NULL
    WHERE
      idempotencyKey = ${key}
      AND jobType = 'personalization_recommendations'
      AND lockedBy = ${token}
      AND status = 'running'
  `);
  return Number((updated[0] as { affectedRows?: number }).affectedRows ?? 0) === 1;
}

/**
 * The durable handler only updates payload. The worker still owns status,
 * retries, and the lease.
 */
async function persistRecommendationOutcome(
  key: string,
  payload: RecommendationPayload,
  result: RecommendationResult
): Promise<void> {
  const db = await requireDb();
  const { sql } = await import("drizzle-orm");
  const body = JSON.stringify({ ...payload, outcome: outcomeFromResult(result) });
  await db.execute(sql`UPDATE durable_jobs SET payload = ${body} WHERE idempotencyKey = ${key}`);
}

async function suggestionFlagsFor(
  profileId: string,
  workspaceId: string,
  step: RecommendationStep
): Promise<{ saved: boolean; live: boolean }> {
  const db = await requireDb();
  const store = createRecommendationStore(db);
  const profile = await store.loadProfile(profileId, workspaceId);
  if (!profile || profile.deletedAt) return { saved: false, live: false };
  const items = await store.loadItems(profileId);
  const snapshot = await store.loadLatestSnapshot(profileId);
  const evidence = buildCreatorEvidence({
    platform: profile.platform,
    displayName: profile.displayName,
    bio: profile.bio,
    snapshot,
    items,
  });
  return {
    saved: stepSuggestionsSaved(items, step, evidence),
    live: stepHasLiveSuggestions(items, step),
  };
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
  const flags = await suggestionFlagsFor(profileId, workspaceId, step).catch(() => ({
    saved: false,
    live: false,
  }));
  return recommendationStateFromSources({
    job,
    memory: recommendationStates.get(key) ?? null,
    suggestionsSaved: flags.saved,
    liveSuggestions: flags.live,
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

export const PRELIMINARY_SUGGESTION_STEPS = ["goal", "audience", "pillars"] as const;

/** Starts the three suggestion jobs from evidence already saved. Does not wait for the scrape. */
export async function enqueuePreliminarySuggestions(input: {
  workspaceId: string;
  userId: number;
  socialProfileId: string;
  version: number;
}): Promise<void> {
  for (const step of PRELIMINARY_SUGGESTION_STEPS) {
    await enqueueRecommendations({ ...input, step }, input.version);
  }
}

/**
 * Starts (or reuses) a recommendation generation for one step. The key
 * includes the personalization version and any confirmed goal or audience,
 * so an edit upstream starts a new job while a reload of the same answers
 * collapses into the finished job.
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
  let claim: { owned: boolean; token: string } | null = null;
  try {
    claim = await claimInlineRecommendation(key, payload);
  } catch (err) {
    console.error(
      "[personalization] recommendation ownership unavailable",
      err instanceof Error ? err.message : err
    );
    return "inline";
  }
  if (!claim.owned) return "inline";
  rememberState(key, { state: "running", at: Date.now() });
  const token = claim.token;
  runInlineOnce(key, async () => {
    try {
      const result = await runRecommendationJob(payload);
      logRecommendationFailure(payload, result);
      const saved = await finishInlineRecommendation(key, token, payload, result);
      if (!saved) {
        console.warn("[personalization] recommendation result discarded after lease loss");
        return;
      }
      rememberState(key, stateFromResult(result));
    } catch (err) {
      rememberState(key, { state: "failed", at: Date.now() });
      throw err;
    }
  });
  return "inline";
}

function recommendationFailureDetail(result: RecommendationResult): string | null {
  if (result.status !== "failed") return null;
  const reason = result.reason ? `: ${result.reason}` : "";
  return `recommendations_${result.kind}${reason}`.slice(0, 180);
}

function logRecommendationFailure(payload: RecommendationPayload, result: RecommendationResult): void {
  if (result.status !== "failed") return;
  console.warn("[personalization] recommendations_failed", {
    step: payload.step,
    kind: result.kind,
    reason: result.reason ?? result.kind,
    profileId: payload.socialProfileId,
  });
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
    logRecommendationFailure(payload, result);
    await persistRecommendationOutcome(job.idempotencyKey, payload, result);
    // Model timeouts / outages: let the durable queue retry the same job.
    if (result.status === "failed" && result.kind !== "invalid_output") {
      throw new Error(`recommendations_${result.kind}`);
    }
  });
}
