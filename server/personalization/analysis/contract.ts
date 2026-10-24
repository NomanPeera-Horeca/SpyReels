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
  ProfileEvidence,
  SocialPlatform,
  WebsiteIntelligence,
  SocialProfileStatus,
  ProviderAttemptRecord,
} from "@shared/personalization/model";
import type { ScrapeCreatorsMeterReport } from "../../scrapeCreatorsMeter";

export const PROFILE_ANALYSIS_LEASE_SECONDS = 10 * 60;
/**
 * Durable job attempts per enqueue (existing queue retry counter). Kept below
 * the per-run provider budget so one user "try again" is always possible
 * after an outage: 2 automatic + 1 user = 3 provider attempts per run max.
 */
export const PROFILE_ANALYSIS_MAX_ATTEMPTS = 2;
export const PROFILE_ANALYSIS_WINDOW_DAYS = 183;

/**
 * Cost protection (PROVISIONAL values, see docs/architecture/personalization-phase4.md):
 * - at most this many provider attempts per logical run, across durable
 *   retries AND user "try again" (persisted on the run, survives restarts)
 * - at most this many paid ScrapeCreators requests per attempt, enforced by
 *   server/scrapeCreatorsMeter.ts inside the integrations (includes their
 *   own internal retries)
 * - at most this many posts fetched (existing maxReels / maxVideos option)
 * Worst case per run: 3 x 25 = 75 requests.
 */
export const PROFILE_ANALYSIS_PROVIDER_ATTEMPTS_PER_RUN = 3;
export const PROFILE_ANALYSIS_REQUEST_BUDGET_PER_ATTEMPT = 25;
export const PROFILE_ANALYSIS_MAX_POSTS = 150;

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
  /** Set only when stage 1 has stored posts. Profile evidence must leave this null. */
  sourceFetchedAt: Date | null;
  postsInWindow: number | null;
  providerCallCount: number | null;
  providerAttempts: ProviderAttemptRecord[];
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
      | "sourceFetchedAt"
      | "postsInWindow"
      | "providerCallCount"
      | "providerAttempts"
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
  /**
   * Saves a scrape checkpoint. Locks the row and keeps profile evidence and
   * panels already stored. Sets sourceFetchedAt. The request count is kept
   * by recordProviderAttempt.
   */
  saveSnapshot(runId: string, snapshot: AnalysisSourceSnapshot): Promise<void>;
  /**
   * Stores lookup facts on the run. Locks the row and keeps posts and panels
   * already stored. Does not set sourceFetchedAt, postsInWindow, or the scrape window.
   */
  saveProfileEvidence(
    runId: string,
    evidence: ProfileEvidence,
    identity: { platform: SocialPlatform; handle: string; followerCount: number | null }
  ): Promise<void>;
  /** Evidence already on this run, by primary key. Null when the run or evidence is missing. */
  loadRunProfileEvidence(runId: string): Promise<ProfileEvidence | null>;
  /**
   * Merges a finished website read onto the current evidence.
   * Locks the row. Does not set sourceFetchedAt or replace posts.
   */
  saveWebsiteIntelligence(runId: string, website: WebsiteIntelligence): Promise<void>;
  /** Appends one attempt and adds its requests to providerCallCount. */
  recordProviderAttempt(
    runId: string,
    attempt: ProviderAttemptRecord
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
  | "transient"
  | "request_budget_exhausted";

export class ProviderError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    message: string,
    /** What the attempt actually cost before it failed. */
    readonly meter: ScrapeCreatorsMeterReport | null = null
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
    /** Real request count from the meter (null only for sources that cannot meter). */
    meter: ScrapeCreatorsMeterReport | null;
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
