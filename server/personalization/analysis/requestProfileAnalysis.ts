/**
 * Starts (or reuses) a profile analysis. Called by the future onboarding and
 * Home procedures. Never calls a provider itself: it only creates the run row
 * and enqueues the existing durable job.
 *
 * Order: authorize -> decide (pure) -> act.
 * - reuse_active: re-enqueue the SAME key (a no-op upsert if the job exists;
 *   self-heals a run whose enqueue was lost in a crash).
 * - retry_failed: put the failed run back to queued (checkpoints kept) and
 *   enqueue the same key with requeueIfTerminal (the handler finished the run
 *   normally, so the durable job is "succeeded" and must be re-opened).
 * - create: insert the run (unique keys stop duplicates, including two taps at
 *   the same moment), enqueue, then record usage for user refreshes only.
 */
import {
  decideAnalysisRequest,
  type AnalysisRequestDecision,
} from "@shared/personalization/state";
import type {
  AnalysisRefreshPolicy,
  AnalysisRequestKind,
} from "@shared/personalization/model";
import { profileAnalysisJobKeys } from "../analysisJobKey";
import {
  assertSocialProfileInWorkspace,
  type PersonalizationCtx,
} from "../authorization";
import {
  DuplicateRunError,
  PROFILE_ANALYSIS_MAX_ATTEMPTS,
  type AnalysisStore,
  type DurableEnqueue,
} from "./contract";

export type RequestAnalysisResult =
  | { status: "started"; runId: string }
  | { status: "reused"; runId: string }
  | { status: "retrying"; runId: string }
  | {
      status: "rejected";
      reason: Extract<AnalysisRequestDecision, { action: "reject" }>["reason"];
      retryAfter?: Date;
    };

export async function requestProfileAnalysis(
  deps: {
    store: AnalysisStore;
    enqueue: DurableEnqueue;
    newId: () => string;
    now: () => Date;
    /** Existing usage-limit check (user refresh only). */
    checkUsage?: () => Promise<boolean>;
    /** Existing usage counter increment (user refresh only, after a run is created). */
    recordUsage?: () => Promise<void>;
    policy?: AnalysisRefreshPolicy;
  },
  input: {
    ctx: PersonalizationCtx;
    socialProfileId: string;
    requestKind: AnalysisRequestKind;
  }
): Promise<RequestAnalysisResult> {
  const workspaceId = input.ctx.workspaceId ?? "";
  const profile = assertSocialProfileInWorkspace(
    await deps.store.loadProfile(input.socialProfileId, workspaceId),
    input.ctx
  );
  const runs = await deps.store.listRunSummaries(profile);
  const usageAllowed =
    input.requestKind === "user_refresh"
      ? Boolean(await deps.checkUsage?.())
      : undefined;
  const decision = decideAnalysisRequest({
    requestKind: input.requestKind,
    profileStatus: profile.status,
    runs,
    now: deps.now(),
    usageAllowed,
    policy: deps.policy,
  });

  const enqueueRun = (
    runId: string,
    idempotencyKey: string,
    requestKind: AnalysisRequestKind,
    requeueIfTerminal = false
  ) =>
    deps.enqueue({
      jobType: "profile_analysis",
      idempotencyKey,
      payload: {
        runId,
        workspaceId: profile.workspaceId,
        socialProfileId: profile.id,
        requestKind,
      },
      maxAttempts: PROFILE_ANALYSIS_MAX_ATTEMPTS,
      requeueIfTerminal,
    });

  switch (decision.action) {
    case "reject":
      return {
        status: "rejected",
        reason: decision.reason,
        retryAfter: decision.retryAfter,
      };
    case "reuse_completed":
      return { status: "reused", runId: decision.runId };
    case "reuse_active": {
      const active = runs.find(r => r.id === decision.runId)!;
      await enqueueRun(active.id, active.idempotencyKey, active.requestKind);
      return { status: "reused", runId: active.id };
    }
    case "retry_failed": {
      const failed = runs.find(r => r.id === decision.runId)!;
      await deps.store.requeueFailedRun(failed.id);
      await enqueueRun(
        failed.id,
        failed.idempotencyKey,
        failed.requestKind,
        true
      );
      return { status: "retrying", runId: failed.id };
    }
    case "create": {
      const identity = {
        socialProfileId: profile.id,
        platform: profile.platform!,
        normalizedHandle: profile.normalizedHandle!,
        platformAccountId: profile.platformAccountId,
      };
      const { inputHash, idempotencyKey } =
        decision.requestKind === "user_refresh"
          ? profileAnalysisJobKeys({
              ...identity,
              requestKind: "user_refresh",
              refreshSequence: decision.refreshSequence!,
            })
          : decision.requestKind === "background"
            ? profileAnalysisJobKeys({
                ...identity,
                requestKind: "background",
                periodIndex: decision.periodIndex!,
              })
            : profileAnalysisJobKeys({ ...identity, requestKind: "initial" });
      const runId = deps.newId();
      try {
        await deps.store.insertRun({
          id: runId,
          workspaceId: profile.workspaceId,
          socialProfileId: profile.id,
          inputHash,
          idempotencyKey,
          requestKind: decision.requestKind,
          refreshSequence: decision.refreshSequence,
          status: "queued",
          createdAt: deps.now(),
        });
      } catch (err) {
        if (!(err instanceof DuplicateRunError)) throw err;
        // Lost a race: someone created the same request, or another run is active.
        const winner =
          err.reason === "idempotency_key"
            ? await deps.store.findRunByKey(idempotencyKey)
            : (await deps.store.listRunSummaries(profile)).find(
                r => r.status === "queued" || r.status === "running"
              );
        if (!winner) throw err;
        return { status: "reused", runId: winner.id };
      }
      await enqueueRun(runId, idempotencyKey, decision.requestKind);
      if (decision.requestKind === "user_refresh") await deps.recordUsage?.();
      return { status: "started", runId };
    }
  }
}
