/**
 * profile_analysis durable job: contract and ports.
 *
 * The job runs on the EXISTING durable queue (server/durableJobs): same table,
 * same leases, same retry counter, same idempotency upsert. No new queue.
 *
 * NOT REGISTERED YET. Registration (adding "profile_analysis" to
 * PILOT_JOB_TYPES and a dispatch handler) happens only after the migration is
 * applied, because the handler writes to the new tables.
 *
 * Ports keep the logic testable without those tables:
 * - AnalysisStore: persistence (SQL implementation lands with the migration)
 * - ProfileDataSource: the existing ScrapeCreators integrations
 * - SuggestionEngine: AI suggestions (optional; stages are skipped without it)
 */
import type {
  AiSuggestion,
  ExistingRunSummary,
  ItemRecord,
} from "@shared/personalization/state";
import type {
  AnalysisRequestKind,
  AnalysisRunStatus,
  AnalysisSourceSnapshot,
  AnalysisStage,
  AnalysisStageStatus,
  SocialPlatform,
  SocialProfileStatus,
} from "@shared/personalization/model";

export const PROFILE_ANALYSIS_LEASE_SECONDS = 10 * 60;
export const PROFILE_ANALYSIS_MAX_ATTEMPTS = 3;
export const PROFILE_ANALYSIS_WINDOW_DAYS = 183;

export type ProfileAnalysisPayload = {
  runId: string;
  workspaceId: string;
  socialProfileId: string;
  requestKind: AnalysisRequestKind;
};

/** What the durable worker hands the handler (subset of ClaimedJob). */
export type ClaimedAnalysisJob = {
  payload: ProfileAnalysisPayload;
  attempt: number;
  maxAttempts: number;
};

export type AnalysisProfile = {
  id: string;
  workspaceId: string;
  platform: SocialPlatform | null;
  normalizedHandle: string | null;
  platformAccountId: string | null;
  status: SocialProfileStatus;
  deletedAt: Date | null;
};

export type AnalysisRun = {
  id: string;
  workspaceId: string;
  socialProfileId: string;
  inputHash: string;
  idempotencyKey: string;
  requestKind: AnalysisRequestKind;
  refreshSequence: number | null;
  status: AnalysisRunStatus;
  stages: Partial<Record<AnalysisStage, AnalysisStageStatus>>;
  snapshot: AnalysisSourceSnapshot | null;
  postsInWindow: number | null;
  providerCallCount: number | null;
  errorCode: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type RunSummaryWithKey = ExistingRunSummary & { idempotencyKey: string };

export class DuplicateRunError extends Error {
  constructor(readonly reason: "idempotency_key" | "active_slot") {
    super(`duplicate run (${reason})`);
  }
}

export interface AnalysisStore {
  loadProfile(
    profileId: string,
    workspaceId: string
  ): Promise<AnalysisProfile | null>;
  loadRun(runId: string, workspaceId: string): Promise<AnalysisRun | null>;
  findRunByKey(idempotencyKey: string): Promise<AnalysisRun | null>;
  listRunSummaries(profile: AnalysisProfile): Promise<RunSummaryWithKey[]>;
  /** Throws DuplicateRunError on the unique idempotency key or the one-active-run key. */
  insertRun(
    run: Omit<
      AnalysisRun,
      | "stages"
      | "snapshot"
      | "postsInWindow"
      | "providerCallCount"
      | "errorCode"
      | "completedAt"
    >
  ): Promise<void>;
  /** failed -> queued, keeps finished stages and the snapshot (checkpoints). */
  requeueFailedRun(runId: string): Promise<void>;
  markRunRunning(runId: string, at: Date): Promise<void>;
  setStage(
    runId: string,
    stage: AnalysisStage,
    status: AnalysisStageStatus,
    errorCode?: string | null
  ): Promise<void>;
  saveSnapshot(
    runId: string,
    snapshot: AnalysisSourceSnapshot,
    providerCallCount: number | null
  ): Promise<void>;
  finishRun(
    runId: string,
    status: AnalysisRunStatus,
    errorCode: string | null,
    at: Date
  ): Promise<void>;
  setProfileStatus(
    profileId: string,
    status: SocialProfileStatus
  ): Promise<void>;
  loadItems(profileId: string): Promise<ItemRecord[]>;
  loadPersonalizationVersion(profileId: string): Promise<number>;
  /** One transaction: mark ids superseded, insert new suggestions. Never touches other rows. */
  applySuggestions(
    profileId: string,
    supersedeIds: string[],
    inserts: AiSuggestionInsert[]
  ): Promise<void>;
}

export type AiSuggestionInsert = ReturnType<
  typeof import("@shared/personalization/state").planAiSuggestionMerge
>["insert"][number];

export type ProviderErrorKind =
  | "private"
  | "not_found"
  | "rate_limited"
  | "transient";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string
  ) {
    super(message);
  }
}

export interface ProfileDataSource {
  /**
   * Fetch the account's posts in the window using the EXISTING provider
   * integrations. Throws ProviderError. providerCalls is null when the
   * underlying integration does not report its call count.
   */
  fetchPosts(input: {
    platform: SocialPlatform;
    handle: string;
    windowStart: Date;
    windowEnd: Date;
  }): Promise<{
    snapshot: AnalysisSourceSnapshot;
    providerCalls: number | null;
  }>;
}

export interface SuggestionEngine {
  suggest(input: {
    runId: string;
    snapshot: AnalysisSourceSnapshot;
    confirmed: ItemRecord[];
  }): Promise<AiSuggestion[]>;
}

export type DurableEnqueue = (input: {
  jobType: "profile_analysis";
  idempotencyKey: string;
  payload: ProfileAnalysisPayload;
  maxAttempts: number;
  /**
   * Same option as enqueueDurableJob. Only the explicit "retry a failed run"
   * path sets it: the handler finishes a failed run normally, so its durable
   * job is "succeeded" and would otherwise never be picked up again.
   */
  requeueIfTerminal?: boolean;
}) => Promise<number>;
