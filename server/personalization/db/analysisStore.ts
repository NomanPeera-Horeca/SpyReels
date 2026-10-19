/**
 * MySQL implementation of AnalysisStore (profile analysis runs) and
 * RecommendationStore (Goal / Audience / Pillars). REUSE of the Phase 3/4
 * contracts: the pure logic lives in runProfileAnalysis,
 * requestProfileAnalysis and generateRecommendations; this file only reads
 * and writes rows.
 *
 * Every write that touches personalization items runs in one transaction and
 * only ever inserts rows or moves rows to superseded/dismissed. Confirmed
 * payloads are never edited in place. Undo of a user delete is the exception:
 * restorePersonalizationItem returns that same row to its previous status
 * and does not change subtopic rows.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  ANALYSIS_STAGES,
  type AnalysisStage,
  type AnalysisStageStatus,
} from "@shared/personalization/model";
import {
  analysisRequestFingerprint,
  upstreamInputsHash,
  type ItemRecord,
} from "@shared/personalization/state";
import { createHash, randomUUID } from "node:crypto";
import {
  personalizationItems,
  personalizationProgress,
  profileAnalysisRuns,
  profileAnalysisStages,
  socialProfiles,
} from "../../../drizzle/personalizationSchema";
import {
  DuplicateRunError,
  type AnalysisProfile,
  type AnalysisRun,
  type AnalysisStore,
  type RunSummaryWithKey,
} from "../analysis/contract";
import {
  pillarsMissingSubtopics as listPillarsMissingSubtopics,
  saveGeneratedSubtopics,
} from "../subtopics";
import type {
  GenerationProfile,
  RecommendationStore,
} from "../intelligence/recommendationService";
import { isDuplicateKey, toItemRecord } from "./rows";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = MySql2Database<any>;

function profileRowToAnalysisProfile(
  p: typeof socialProfiles.$inferSelect
): AnalysisProfile {
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    platform: p.platform,
    normalizedHandle: p.normalizedHandle,
    platformAccountId: p.platformAccountId,
    status: p.status,
    deletedAt: p.deletedAt,
  };
}

async function loadStages(
  db: Db,
  runId: string
): Promise<Partial<Record<AnalysisStage, AnalysisStageStatus>>> {
  const rows = await db
    .select({ stage: profileAnalysisStages.stage, status: profileAnalysisStages.status })
    .from(profileAnalysisStages)
    .where(eq(profileAnalysisStages.runId, runId));
  const out: Partial<Record<AnalysisStage, AnalysisStageStatus>> = {};
  for (const r of rows) out[r.stage] = r.status;
  return out;
}

function toRun(
  r: typeof profileAnalysisRuns.$inferSelect,
  stages: Partial<Record<AnalysisStage, AnalysisStageStatus>>
): AnalysisRun {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    socialProfileId: r.socialProfileId,
    inputHash: r.inputHash,
    idempotencyKey: r.idempotencyKey,
    requestKind: r.requestKind,
    refreshSequence: r.refreshSequence,
    status: r.status,
    stages,
    snapshot: r.sourceSnapshot ?? null,
    postsInWindow: r.postsInWindow,
    providerCallCount: r.providerCallCount,
    providerAttempts: r.providerAttempts ?? [],
    errorCode: r.errorCode,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
  };
}

/** Same account identity check as requestProfileAnalysis's key derivation. */
function runMatchesIdentity(
  run: typeof profileAnalysisRuns.$inferSelect,
  profile: AnalysisProfile
): boolean {
  if (!profile.platform || !profile.normalizedHandle) return false;
  const identity = {
    socialProfileId: profile.id,
    platform: profile.platform,
    normalizedHandle: profile.normalizedHandle,
    platformAccountId: profile.platformAccountId,
  };
  let fingerprint: string;
  if (run.requestKind === "initial") {
    fingerprint = analysisRequestFingerprint({ ...identity, requestKind: "initial" });
  } else if (run.requestKind === "user_refresh" && run.refreshSequence) {
    fingerprint = analysisRequestFingerprint({
      ...identity,
      requestKind: "user_refresh",
      refreshSequence: run.refreshSequence,
    });
  } else {
    return false;
  }
  const hash = createHash("sha256").update(fingerprint).digest("hex").slice(0, 32);
  return hash === run.inputHash;
}

async function loadItemRows(db: Db, profileId: string) {
  return db
    .select()
    .from(personalizationItems)
    .where(eq(personalizationItems.socialProfileId, profileId))
    .orderBy(personalizationItems.sortOrder, personalizationItems.createdAt);
}

async function loadVersion(db: Db, profileId: string): Promise<number> {
  const rows = await db
    .select({ v: personalizationProgress.personalizationVersion })
    .from(personalizationProgress)
    .where(eq(personalizationProgress.socialProfileId, profileId))
    .limit(1);
  return rows[0]?.v ?? 1;
}

export function createAnalysisStore(db: Db): AnalysisStore {
  return {
    async loadProfile(profileId, workspaceId) {
      const rows = await db
        .select()
        .from(socialProfiles)
        .where(and(eq(socialProfiles.id, profileId), eq(socialProfiles.workspaceId, workspaceId)))
        .limit(1);
      return rows[0] ? profileRowToAnalysisProfile(rows[0]) : null;
    },

    async loadRun(runId, workspaceId) {
      const rows = await db
        .select()
        .from(profileAnalysisRuns)
        .where(and(eq(profileAnalysisRuns.id, runId), eq(profileAnalysisRuns.workspaceId, workspaceId)))
        .limit(1);
      return rows[0] ? toRun(rows[0], await loadStages(db, runId)) : null;
    },

    async findRunByKey(idempotencyKey) {
      const rows = await db
        .select()
        .from(profileAnalysisRuns)
        .where(eq(profileAnalysisRuns.idempotencyKey, idempotencyKey))
        .limit(1);
      return rows[0] ? toRun(rows[0], await loadStages(db, rows[0].id)) : null;
    },

    async listRunSummaries(profile): Promise<RunSummaryWithKey[]> {
      const rows = await db
        .select()
        .from(profileAnalysisRuns)
        .where(
          and(
            eq(profileAnalysisRuns.socialProfileId, profile.id),
            eq(profileAnalysisRuns.workspaceId, profile.workspaceId)
          )
        )
        .orderBy(desc(profileAnalysisRuns.createdAt));
      return rows.map(r => ({
        id: r.id,
        idempotencyKey: r.idempotencyKey,
        requestKind: r.requestKind,
        status: r.status,
        sameAccountIdentity: runMatchesIdentity(r, profile),
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        providerAttemptsUsed: (r.providerAttempts ?? []).length,
      }));
    },

    async insertRun(run) {
      try {
        await db.transaction(async tx => {
          await tx.insert(profileAnalysisRuns).values({
            id: run.id,
            workspaceId: run.workspaceId,
            socialProfileId: run.socialProfileId,
            inputHash: run.inputHash,
            idempotencyKey: run.idempotencyKey,
            requestKind: run.requestKind,
            refreshSequence: run.refreshSequence,
            status: run.status,
            createdAt: run.createdAt,
          });
          await tx.insert(profileAnalysisStages).values(
            ANALYSIS_STAGES.map(stage => ({ runId: run.id, stage, status: "waiting" as const }))
          );
        });
      } catch (err) {
        if (isDuplicateKey(err, "uniq_profile_analysis_runs_idempotency"))
          throw new DuplicateRunError("idempotency_key");
        if (isDuplicateKey(err, "uniq_profile_analysis_runs_active_slot"))
          throw new DuplicateRunError("active_slot");
        throw err;
      }
    },

    async requeueFailedRun(runId) {
      await db
        .update(profileAnalysisRuns)
        .set({ status: "queued", errorCode: null, completedAt: null })
        .where(and(eq(profileAnalysisRuns.id, runId), eq(profileAnalysisRuns.status, "failed")));
      // Unfinished stages go back to waiting; finished ones are checkpoints.
      await db
        .update(profileAnalysisStages)
        .set({ status: "waiting", errorCode: null })
        .where(
          and(
            eq(profileAnalysisStages.runId, runId),
            inArray(profileAnalysisStages.status, ["failed", "skipped", "running"])
          )
        );
    },

    async markRunRunning(runId, at) {
      await db
        .update(profileAnalysisRuns)
        .set({ status: "running", startedAt: at })
        .where(eq(profileAnalysisRuns.id, runId));
    },

    async setStage(runId, stage, status, errorCode = null) {
      const now = new Date();
      await db
        .update(profileAnalysisStages)
        .set({
          status,
          errorCode,
          ...(status === "running" ? { startedAt: now } : {}),
          ...(status === "done" || status === "failed" || status === "skipped"
            ? { completedAt: now }
            : {}),
        })
        .where(and(eq(profileAnalysisStages.runId, runId), eq(profileAnalysisStages.stage, stage)));
    },

    async saveSnapshot(runId, snapshot) {
      await db
        .update(profileAnalysisRuns)
        .set({
          sourceSnapshot: snapshot,
          sourceFetchedAt: new Date(),
          postsInWindow: snapshot.posts.length,
          windowStart: new Date(snapshot.windowStart),
          windowEnd: new Date(snapshot.windowEnd),
        })
        .where(eq(profileAnalysisRuns.id, runId));
    },

    async recordProviderAttempt(runId, attempt) {
      await db.transaction(async tx => {
        const rows = await tx
          .select({
            attempts: profileAnalysisRuns.providerAttempts,
            calls: profileAnalysisRuns.providerCallCount,
          })
          .from(profileAnalysisRuns)
          .where(eq(profileAnalysisRuns.id, runId))
          .for("update");
        const current = rows[0];
        if (!current) return;
        await tx
          .update(profileAnalysisRuns)
          .set({
            providerAttempts: [...(current.attempts ?? []), attempt],
            providerCallCount: (current.calls ?? 0) + attempt.requests,
          })
          .where(eq(profileAnalysisRuns.id, runId));
      });
    },

    async finishRun(runId, status, errorCode, at) {
      await db
        .update(profileAnalysisRuns)
        .set({ status, errorCode, completedAt: at })
        .where(eq(profileAnalysisRuns.id, runId));
    },

    async setProfileStatus(profileId, status) {
      await db.update(socialProfiles).set({ status }).where(eq(socialProfiles.id, profileId));
    },

    async loadItems(profileId) {
      return (await loadItemRows(db, profileId)).map(toItemRecord);
    },

    loadPersonalizationVersion: profileId => loadVersion(db, profileId),

    async applySuggestions(profileId, supersedeIds, inserts) {
      await db.transaction(async tx => {
        const owner = await tx
          .select({ workspaceId: socialProfiles.workspaceId })
          .from(socialProfiles)
          .where(eq(socialProfiles.id, profileId))
          .limit(1);
        if (!owner[0]) return;
        if (supersedeIds.length) {
          await tx
            .update(personalizationItems)
            .set({ status: "superseded" })
            .where(
              and(
                eq(personalizationItems.socialProfileId, profileId),
                inArray(personalizationItems.id, supersedeIds),
                eq(personalizationItems.status, "suggested")
              )
            );
        }
        if (inserts.length) {
          await tx.insert(personalizationItems).values(
            inserts.map((i, idx) => ({
              id: randomUUID(),
              workspaceId: owner[0].workspaceId,
              socialProfileId: profileId,
              kind: i.kind,
              payload: i.payload,
              source: i.source,
              status: i.status,
              evidence: i.evidence,
              basedOnVersion: i.basedOnVersion,
              dismissedAtVersion: i.dismissedAtVersion,
              supersedesItemId: i.supersedesItemId,
              analysisRunId: i.analysisRunId,
              basedOnInputsHash: i.basedOnInputsHash ?? null,
              confidence: i.confidence ?? null,
              sortOrder: idx,
            }))
          );
        }
      });
    },
  };
}

export function createRecommendationStore(db: Db): RecommendationStore {
  return {
    async loadProfile(profileId, workspaceId): Promise<GenerationProfile | null> {
      const rows = await db
        .select()
        .from(socialProfiles)
        .where(and(eq(socialProfiles.id, profileId), eq(socialProfiles.workspaceId, workspaceId)))
        .limit(1);
      const p = rows[0];
      return p
        ? {
            id: p.id,
            workspaceId: p.workspaceId,
            deletedAt: p.deletedAt,
            status: p.status,
            platform: p.platform,
            displayName: p.displayName,
            bio: p.bio,
          }
        : null;
    },

    async loadLatestSnapshot(profileId) {
      const rows = await db
        .select({ snapshot: profileAnalysisRuns.sourceSnapshot })
        .from(profileAnalysisRuns)
        .where(
          and(
            eq(profileAnalysisRuns.socialProfileId, profileId),
            inArray(profileAnalysisRuns.status, ["succeeded", "partial"])
          )
        )
        .orderBy(desc(profileAnalysisRuns.completedAt))
        .limit(1);
      return rows[0]?.snapshot ?? null;
    },

    async loadItems(profileId) {
      return (await loadItemRows(db, profileId)).map(toItemRecord);
    },

    loadPersonalizationVersion: profileId => loadVersion(db, profileId),

    async applyGeneratedSuggestions(profileId, input) {
      return db.transaction(async tx => {
        const owner = await tx
          .select({ workspaceId: socialProfiles.workspaceId })
          .from(socialProfiles)
          .where(and(eq(socialProfiles.id, profileId), isNull(socialProfiles.deletedAt)))
          .for("update")
          .limit(1);
        if (!owner[0]) return "stale" as const;
        if (input.expectedVersion !== undefined) {
          const [progress] = await tx
            .select({
              version: personalizationProgress.personalizationVersion,
            })
            .from(personalizationProgress)
            .where(eq(personalizationProgress.socialProfileId, profileId))
            .for("update")
            .limit(1);
          const version = progress?.version ?? 1;
          if (version !== input.expectedVersion) return "stale" as const;
        }
        const items: ItemRecord[] = (
          await tx
            .select()
            .from(personalizationItems)
            .where(eq(personalizationItems.socialProfileId, profileId))
        ).map(toItemRecord);
        const guardOk =
          input.guard.type === "no_confirmed"
            ? !items.some(i => i.kind === input.kind && i.status === "confirmed")
            : upstreamInputsHash(input.kind, items) === input.guard.expected;
        if (!guardOk) return "stale" as const;
        if (input.supersedeIds.length) {
          await tx
            .update(personalizationItems)
            .set({ status: "superseded" })
            .where(
              and(
                eq(personalizationItems.socialProfileId, profileId),
                inArray(personalizationItems.id, input.supersedeIds),
                eq(personalizationItems.status, "suggested")
              )
            );
        }
        if (input.inserts.length) {
          await tx.insert(personalizationItems).values(
            input.inserts.map((i, idx) => ({
              id: randomUUID(),
              workspaceId: owner[0].workspaceId,
              socialProfileId: profileId,
              kind: i.kind,
              payload: i.payload,
              source: i.source,
              status: i.status,
              evidence: i.evidence,
              basedOnVersion: i.basedOnVersion,
              dismissedAtVersion: i.dismissedAtVersion,
              supersedesItemId: i.supersedesItemId,
              analysisRunId: i.analysisRunId,
              basedOnInputsHash: i.basedOnInputsHash ?? null,
              confidence: i.confidence ?? null,
              generationMeta: i.generationMeta,
              sortOrder: idx,
            }))
          );
        }
        return "applied" as const;
      });
    },

    async pillarsMissingSubtopics(profileId) {
      const [owner] = await db
        .select({ workspaceId: socialProfiles.workspaceId })
        .from(socialProfiles)
        .where(eq(socialProfiles.id, profileId))
        .limit(1);
      if (!owner) return [];
      return listPillarsMissingSubtopics(db, profileId, owner.workspaceId);
    },

    async saveSubtopics(profileId, groups) {
      const [owner] = await db
        .select({ workspaceId: socialProfiles.workspaceId })
        .from(socialProfiles)
        .where(eq(socialProfiles.id, profileId))
        .limit(1);
      if (!owner) return;
      await saveGeneratedSubtopics(db, {
        workspaceId: owner.workspaceId,
        socialProfileId: profileId,
        groups,
      });
    },
  };
}
