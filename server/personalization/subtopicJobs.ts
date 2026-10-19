/**
 * Explicit, durable generation of topic ideas for one pillar.
 *
 * Nothing here runs on page load, on pillar generation or on a timer. A call
 * happens only when the user asks, and only when the job row allows it:
 * - one job per pillar item (`pillar_subtopic_jobs.pillarItemId` is unique);
 * - a succeeded job never calls the model again for that pillar item;
 * - at most `maxAttempts` attempts per pillar item;
 * - `cooldownSeconds` between attempts on the same pillar item;
 * - at most `claimsPerProfilePerHour` pillars claimed per profile per hour;
 * - the claim is taken under the pillar lock, so two requests cannot both call the model.
 */
import { randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { personalizationItems, pillarSubtopicJobs } from "../../drizzle/personalizationSchema";
import type { Db } from "./db/analysisStore";
import {
  assertSubtopicStoreReady,
  listProfileSubtopics,
  lockPillar,
  saveTopicsForPillar,
  type SubtopicRow,
  SubtopicStoreError,
} from "./subtopics";

export const SUBTOPIC_LIMITS = {
  maxAttempts: 3,
  cooldownSeconds: 60,
  lockSeconds: 90,
  claimsPerProfilePerHour: 10,
} as const;

/** What the pillar card shows. Derived from the topic rows and the job row. */
export type PillarTopicState =
  | "never_generated" // no job, no topics: the user can ask for ideas
  | "generating" // a request is running
  | "ready" // at least one live topic
  | "all_dismissed" // topics exist, the user removed every one
  | "no_topics" // generation succeeded with nothing usable
  | "failed" // last attempt failed; attempts left
  | "exhausted"; // last attempt failed; no attempts left

export type JobRow = { status: "running" | "succeeded" | "failed"; attempts: number; stillLocked: boolean; lastError: string | null };

export function deriveTopicState(
  rows: Array<Pick<SubtopicRow, "pillarItemId" | "status">>,
  pillarItemId: string,
  job: JobRow | undefined
): { state: PillarTopicState; attempts: number } {
  const mine = rows.filter(r => r.pillarItemId === pillarItemId);
  const attempts = job?.attempts ?? 0;
  if (mine.some(r => r.status === "suggested" || r.status === "confirmed")) return { state: "ready", attempts };
  if (job?.status === "running" && job.stillLocked) return { state: "generating", attempts };
  if (mine.length > 0) return { state: "all_dismissed", attempts };
  if (job?.status === "succeeded") return { state: "no_topics", attempts };
  if (job) {
    return { state: attempts >= SUBTOPIC_LIMITS.maxAttempts ? "exhausted" : "failed", attempts };
  }
  return { state: "never_generated", attempts: 0 };
}

/** Topic rows and job rows of one profile, read in two queries. Call only when the store is ready. */
export async function loadTopicStates(
  db: Db,
  input: { workspaceId: string; socialProfileId: string; pillarItemIds: string[] }
): Promise<Record<string, { state: PillarTopicState; attempts: number }>> {
  const rows = await listProfileSubtopics(db, input.socialProfileId, input.workspaceId);
  const jobRows = await db
    .select({
      pillarItemId: pillarSubtopicJobs.pillarItemId,
      status: pillarSubtopicJobs.status,
      attempts: pillarSubtopicJobs.attempts,
      lastError: pillarSubtopicJobs.lastError,
      stillLocked: sql<number>`(${pillarSubtopicJobs.lockedUntil} > now())`,
    })
    .from(pillarSubtopicJobs)
    .where(
      and(
        eq(pillarSubtopicJobs.socialProfileId, input.socialProfileId),
        eq(pillarSubtopicJobs.workspaceId, input.workspaceId)
      )
    );
  const jobs = new Map(
    jobRows.map(j => [
      j.pillarItemId,
      { status: j.status, attempts: j.attempts, stillLocked: Number(j.stillLocked) === 1, lastError: j.lastError } as JobRow,
    ])
  );
  const out: Record<string, { state: PillarTopicState; attempts: number }> = {};
  for (const id of input.pillarItemIds) out[id] = deriveTopicState(rows, id, jobs.get(id));
  return out;
}

export type RequestOutcome =
  | { status: "generated"; inserted: number }
  | { status: "failed" }
  | {
      status:
        | "not_found"
        | "already_has_topics"
        | "already_generated"
        | "in_progress"
        | "exhausted"
        | "cooldown"
        | "rate_limited";
    };

export type TopicGenerator = (input: {
  workspaceId: string;
  socialProfileId: string;
  pillarItemId: string;
}) => Promise<{ title: string; labels: string[] }>;

type Claim = "claimed" | "in_progress" | "exhausted" | "cooldown" | "rate_limited" | "already_generated";

async function claimJob(
  db: Db,
  input: { workspaceId: string; socialProfileId: string; pillarItemId: string }
): Promise<Claim> {
  return db.transaction(async tx => {
    const t = tx as unknown as Db;
    await lockPillar(t, input.pillarItemId);
    const [job] = await t
      .select({
        id: pillarSubtopicJobs.id,
        status: pillarSubtopicJobs.status,
        attempts: pillarSubtopicJobs.attempts,
        stillLocked: sql<number>`(${pillarSubtopicJobs.lockedUntil} > now())`,
        cooling: sql<number>`(${pillarSubtopicJobs.lastClaimedAt} > now() - INTERVAL ${SUBTOPIC_LIMITS.cooldownSeconds} SECOND)`,
      })
      .from(pillarSubtopicJobs)
      .where(eq(pillarSubtopicJobs.pillarItemId, input.pillarItemId))
      .limit(1)
      .for("update");
    const [{ n }] = await t
      .select({ n: sql<number>`COUNT(*)` })
      .from(pillarSubtopicJobs)
      .where(
        and(
          eq(pillarSubtopicJobs.socialProfileId, input.socialProfileId),
          ne(pillarSubtopicJobs.pillarItemId, input.pillarItemId),
          sql`${pillarSubtopicJobs.lastClaimedAt} > now() - INTERVAL 1 HOUR`
        )
      );
    const overLimit = Number(n) >= SUBTOPIC_LIMITS.claimsPerProfilePerHour;

    if (!job) {
      if (overLimit) return "rate_limited";
      await t.insert(pillarSubtopicJobs).values({
        id: randomUUID(),
        workspaceId: input.workspaceId,
        socialProfileId: input.socialProfileId,
        pillarItemId: input.pillarItemId,
        status: "running",
        attempts: 1,
        lastError: null,
        lockedUntil: sql`now() + INTERVAL ${SUBTOPIC_LIMITS.lockSeconds} SECOND`,
        lastClaimedAt: sql`now()`,
      });
      return "claimed";
    }
    if (job.status === "succeeded") return "already_generated";
    if (job.status === "running" && Number(job.stillLocked) === 1) return "in_progress";
    if (job.attempts >= SUBTOPIC_LIMITS.maxAttempts) return "exhausted";
    if (Number(job.cooling) === 1) return "cooldown";
    if (overLimit) return "rate_limited";

    const res = await t
      .update(pillarSubtopicJobs)
      .set({
        status: "running",
        attempts: sql`${pillarSubtopicJobs.attempts} + 1`,
        lockedUntil: sql`now() + INTERVAL ${SUBTOPIC_LIMITS.lockSeconds} SECOND`,
        lastClaimedAt: sql`now()`,
        lastError: null,
      })
      .where(and(eq(pillarSubtopicJobs.id, job.id), eq(pillarSubtopicJobs.attempts, job.attempts)));
    const changed = (res as unknown as [{ affectedRows?: number }])[0]?.affectedRows ?? 0;
    return changed === 1 ? "claimed" : "in_progress";
  });
}

function failureCode(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  if (typeof code === "string" && code) return code.slice(0, 60);
  return err instanceof Error ? err.name.slice(0, 60) : "error";
}

/**
 * The only path that calls the model for topics. Throws SubtopicStoreError when
 * migrations 0104/0105 are not verified; nothing is claimed or called in that case.
 */
export async function requestPillarSubtopics(
  db: Db,
  deps: { generate: TopicGenerator },
  input: { workspaceId: string; socialProfileId: string; pillarItemId: string }
): Promise<RequestOutcome> {
  await assertSubtopicStoreReady(db);
  const [pillar] = await db
    .select({ id: personalizationItems.id, kind: personalizationItems.kind, status: personalizationItems.status })
    .from(personalizationItems)
    .where(
      and(
        eq(personalizationItems.id, input.pillarItemId),
        eq(personalizationItems.socialProfileId, input.socialProfileId),
        eq(personalizationItems.workspaceId, input.workspaceId)
      )
    )
    .limit(1);
  if (!pillar || pillar.kind !== "pillar" || (pillar.status !== "suggested" && pillar.status !== "confirmed")) {
    return { status: "not_found" };
  }
  const states = await loadTopicStates(db, { ...input, pillarItemIds: [pillar.id] });
  switch (states[pillar.id].state) {
    case "ready":
      return { status: "already_has_topics" };
    case "all_dismissed":
    case "no_topics":
      return { status: "already_generated" };
    case "generating":
      return { status: "in_progress" };
    case "exhausted":
      return { status: "exhausted" };
    default:
      break; // never_generated or failed: claim and call
  }

  const claim = await claimJob(db, input);
  if (claim !== "claimed") {
    return { status: claim === "already_generated" ? "already_generated" : claim };
  }
  try {
    const generated = await deps.generate(input);
    const inserted = await saveTopicsForPillar(db, {
      workspaceId: input.workspaceId,
      socialProfileId: input.socialProfileId,
      pillarItemId: input.pillarItemId,
      labels: generated.labels,
      pillarHash: "job",
    });
    await db
      .update(pillarSubtopicJobs)
      .set({ status: "succeeded", lockedUntil: null, lastError: null })
      .where(eq(pillarSubtopicJobs.pillarItemId, input.pillarItemId));
    return { status: "generated", inserted };
  } catch (err) {
    // The store changed under us: surface it, do not record it as a model failure.
    if (err instanceof SubtopicStoreError) throw err;
    await db
      .update(pillarSubtopicJobs)
      .set({ status: "failed", lockedUntil: null, lastError: failureCode(err) })
      .where(eq(pillarSubtopicJobs.pillarItemId, input.pillarItemId));
    return { status: "failed" };
  }
}

