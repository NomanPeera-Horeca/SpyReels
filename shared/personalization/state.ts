/**
 * New onboarding + personalization: pure state rules.
 *
 * No database or network access. The server persists what these functions
 * decide; the client renders what they derive. Every rule here is unit tested
 * in state.test.ts.
 */
import {
  ANALYSIS_REFRESH_POLICY,
  ANALYSIS_STAGES,
  INVALIDATES_ON_EDIT,
  PERSONALIZATION_STEPS,
  PROFILE_ANALYSIS_JOB_TYPE,
  type AnalysisAvailability,
  type AnalysisRefreshPolicy,
  type AnalysisRequestKind,
  type AnalysisRunStatus,
  type AnalysisStage,
  type AnalysisStageStatus,
  type ItemEvidence,
  type ItemPayloadByKind,
  type ItemSource,
  type ItemStatus,
  type OnboardingStep,
  type PersonalizationItemKind,
  type PersonalizationStep,
  type SocialPlatform,
  type SocialProfileStatus,
  type StepStatus,
} from "./model";

/* ------------------------------------------------------------------ */
/* Handles                                                             */
/* ------------------------------------------------------------------ */

export type HandleParseResult =
  | { ok: true; platform: SocialPlatform; handle: string }
  | {
      ok: false;
      reason:
        | "empty"
        | "invalid_handle"
        | "unsupported_link"
        | "platform_mismatch";
    };

const HANDLE_RULES: Record<SocialPlatform, RegExp> = {
  instagram: /^[a-z0-9._]{1,30}$/,
  tiktok: /^[a-z0-9._]{2,24}$/,
  youtube: /^[a-z0-9._-]{3,30}$/,
};

const HOST_PLATFORM: Array<[RegExp, SocialPlatform]> = [
  [/(^|\.)instagram\.com$/, "instagram"],
  [/(^|\.)tiktok\.com$/, "tiktok"],
  [/(^|\.)youtube\.com$/, "youtube"],
];

/**
 * Step 1 input "Username or profile link". Accepts "name", "@name" or a
 * profile URL for the chosen platform. Returns the normalized handle
 * (lowercase, no "@") used for the unique key and everywhere after.
 */
export function parseSocialHandle(
  platform: SocialPlatform,
  raw: string
): HandleParseResult {
  const input = raw.trim();
  if (!input) return { ok: false, reason: "empty" };

  let candidate = input;
  const looksLikeUrl =
    /^(https?:\/\/)?([a-z0-9-]+\.)*(instagram|tiktok|youtube)\.com\//i.test(
      input
    );
  if (looksLikeUrl) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
    } catch {
      return { ok: false, reason: "invalid_handle" };
    }
    const host = url.hostname.toLowerCase();
    const linkPlatform = HOST_PLATFORM.find(([re]) => re.test(host))?.[1];
    if (!linkPlatform) return { ok: false, reason: "unsupported_link" };
    if (linkPlatform !== platform)
      return { ok: false, reason: "platform_mismatch" };
    const first = url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (platform === "instagram") {
      if (
        !first ||
        ["p", "reel", "reels", "stories", "explore"].includes(
          first.toLowerCase()
        )
      ) {
        return { ok: false, reason: "unsupported_link" };
      }
      candidate = first;
    } else {
      // TikTok and YouTube profile links use /@handle. Channel IDs and video links are not supported.
      if (!first.startsWith("@"))
        return { ok: false, reason: "unsupported_link" };
      candidate = first;
    }
  }

  const handle = candidate.replace(/^@+/, "").toLowerCase();
  if (!HANDLE_RULES[platform].test(handle))
    return { ok: false, reason: "invalid_handle" };
  return { ok: true, platform, handle };
}

/* ------------------------------------------------------------------ */
/* Analysis availability (never gates a step)                          */
/* ------------------------------------------------------------------ */

/**
 * What history-based analysis can offer. Post count only decides whether
 * there is ANY measured data (0 vs 1+). There is no minimum threshold:
 * a creator with 3 posts gets real numbers for those 3 posts.
 */
export function resolveAnalysisAvailability(input: {
  profileStatus: SocialProfileStatus;
  latestRunStatus: AnalysisRunStatus | null;
  postsInWindow: number | null;
}): AnalysisAvailability {
  if (input.profileStatus === "not_posting_yet") return "not_posting_yet";
  if (input.profileStatus === "private") return "private_account";
  if (
    input.profileStatus === "not_found" ||
    input.profileStatus === "lookup_failed"
  ) {
    return "unavailable";
  }
  if (
    input.latestRunStatus === "queued" ||
    input.latestRunStatus === "running"
  ) {
    return "in_progress";
  }
  if (
    input.latestRunStatus === "succeeded" ||
    input.latestRunStatus === "partial"
  ) {
    return (input.postsInWindow ?? 0) > 0 ? "available" : "no_public_posts";
  }
  if (input.latestRunStatus === "failed") return "unavailable";
  return "in_progress";
}

/** Evidence a NEW AI suggestion may claim given what analysis can offer. */
export function allowedSuggestionEvidence(
  availability: AnalysisAvailability
): ItemEvidence[] {
  return availability === "available"
    ? ["performance_backed", "profile_inferred"]
    : ["profile_inferred"];
}

/**
 * Steps are never blocked by analysis. A user can always confirm or skip,
 * and can always type their own value, whatever the post count or account state.
 */
export function canCompleteStep(
  _step: PersonalizationStep,
  _availability: AnalysisAvailability
): true {
  return true;
}

/* ------------------------------------------------------------------ */
/* Resume position                                                     */
/* ------------------------------------------------------------------ */

export type OnboardingProgressInput = {
  /** Confirmed public profile OR an "I don't post yet" profile. */
  hasConfirmedProfile: boolean;
  primaryUseCaseAnswered: boolean;
  /** Answered OR skipped. Skip is stored as null answer + skippedAt. */
  attributionResolved: boolean;
  stepStatus: Record<PersonalizationStep, StepStatus>;
  completedAt: Date | null;
};

const STEP_DONE: ReadonlySet<StepStatus> = new Set(["confirmed", "skipped"]);

/** Where a returning user lands: the first step that is not finished. */
export function resolveResumeStep(p: OnboardingProgressInput): OnboardingStep {
  if (p.completedAt) return "done";
  if (!p.hasConfirmedProfile) return "platform";
  if (!p.primaryUseCaseAnswered) return "use_case";
  if (!p.attributionResolved) return "attribution";
  for (const step of PERSONALIZATION_STEPS) {
    if (!STEP_DONE.has(p.stepStatus[step])) return step;
  }
  return "done";
}

/** Every profile starts with all three stepper steps. No data rule removes one. */
export function initialStepStatuses(): Record<PersonalizationStep, StepStatus> {
  return { goal: "pending", audience: "pending", pillars: "pending" };
}

/** Personalization is complete when every stepper step is confirmed or skipped. */
export function isPersonalizationComplete(
  stepStatus: Record<PersonalizationStep, StepStatus>
): boolean {
  return PERSONALIZATION_STEPS.every(s => STEP_DONE.has(stepStatus[s]));
}

/* ------------------------------------------------------------------ */
/* Four separate readiness signals                                     */
/* ------------------------------------------------------------------ */

export type ReadinessInput = {
  stepStatus: Record<PersonalizationStep, StepStatus>;
  latestRunStatus: AnalysisRunStatus | null;
  /** True only when real recommendations exist for the active profile. */
  hasRecommendations: boolean;
  /** True only when the workspace has 30-Day Plan cards. */
  hasPlanCards: boolean;
};

export type ReadinessSignals = {
  personalizationCompleted: boolean;
  analysisCompleted: boolean;
  recommendationsReady: boolean;
  planAvailable: boolean;
};

/**
 * The four signals never imply each other. A user can finish personalization
 * while analysis is still running (or will never run), and a plan can exist
 * from before.
 */
export function deriveReadiness(input: ReadinessInput): ReadinessSignals {
  return {
    personalizationCompleted: isPersonalizationComplete(input.stepStatus),
    analysisCompleted:
      input.latestRunStatus === "succeeded" ||
      input.latestRunStatus === "partial",
    recommendationsReady: input.hasRecommendations,
    planAvailable: input.hasPlanCards,
  };
}

/* ------------------------------------------------------------------ */
/* Personalization items                                               */
/* ------------------------------------------------------------------ */

export type ItemRecord<
  K extends PersonalizationItemKind = PersonalizationItemKind,
> = {
  id: string;
  kind: K;
  payload: ItemPayloadByKind[K];
  source: ItemSource;
  status: ItemStatus;
  evidence: ItemEvidence;
  /** Analysis run that produced it. Required for performance_backed. */
  analysisRunId: string | null;
  /** personalizationVersion the item was created under. */
  basedOnVersion: number;
  /** personalizationVersion when the user dismissed it (dismissed rows only). */
  dismissedAtVersion: number | null;
  supersedesItemId: string | null;
};

export type NewItem<
  K extends PersonalizationItemKind = PersonalizationItemKind,
> = Omit<ItemRecord<K>, "id">;

export type AiSuggestion = {
  kind: PersonalizationItemKind;
  payload: ItemPayloadByKind[PersonalizationItemKind];
  evidence: Exclude<ItemEvidence, "user_provided">;
  analysisRunId: string | null;
};

const LIVE: ReadonlySet<ItemStatus> = new Set(["suggested", "confirmed"]);

export function liveItems<T extends ItemRecord>(items: T[]): T[] {
  return items.filter(i => LIVE.has(i.status));
}

/** Key used to spot the same suggestion twice (case and spacing ignored). */
export function itemIdentity(
  kind: PersonalizationItemKind,
  payload: ItemPayloadByKind[PersonalizationItemKind]
): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  switch (kind) {
    case "goal":
      return `goal:${norm((payload as ItemPayloadByKind["goal"]).text)}`;
    case "audience": {
      const a = payload as ItemPayloadByKind["audience"];
      return `audience:${norm(a.who)}|${norm(a.outcome)}`;
    }
    case "pillar":
      return `pillar:${norm((payload as ItemPayloadByKind["pillar"]).title)}`;
    case "niche":
      return `niche:${norm((payload as ItemPayloadByKind["niche"]).slug)}`;
    case "language":
      return `language:${norm((payload as ItemPayloadByKind["language"]).code)}`;
  }
}

export type SuggestionProblem =
  | "performance_evidence_without_analysis"
  | "performance_evidence_without_run"
  | "numbers_without_performance_evidence";

/**
 * Rejects suggestions that would present invented performance data:
 * - performance_backed only when analysis is actually available, and with a run id
 * - a pillar view share only on performance_backed pillars
 */
export function validateSuggestion(
  s: AiSuggestion,
  availability: AnalysisAvailability
): SuggestionProblem | null {
  if (s.evidence === "performance_backed") {
    if (
      !allowedSuggestionEvidence(availability).includes("performance_backed")
    ) {
      return "performance_evidence_without_analysis";
    }
    if (!s.analysisRunId) return "performance_evidence_without_run";
  }
  if (s.kind === "pillar" && s.evidence !== "performance_backed") {
    if ((s.payload as ItemPayloadByKind["pillar"]).viewSharePercent !== null) {
      return "numbers_without_performance_evidence";
    }
  }
  return null;
}

/** Kinds where the user has exactly one current value. */
const SINGLE_VALUE_KINDS: ReadonlySet<PersonalizationItemKind> = new Set([
  "goal",
  "niche",
  "language",
]);

export type AiMergePlan = {
  insert: NewItem[];
  skipped: Array<{
    kind: PersonalizationItemKind;
    reason: "user_value_locked" | "duplicate" | "dismissed" | SuggestionProblem;
  }>;
};

/**
 * Merge AI suggestions into existing items. Rules:
 * - Never changes or removes an existing row. Inserts only.
 * - Never suggests over a confirmed or user-written single value (goal, niche, language).
 * - Never re-adds something already live.
 * - A dismissed suggestion only comes back as a legitimate NEW recommendation:
 *   the user's answers changed since the dismissal (personalizationVersion moved on).
 * - Rejects suggestions with invented performance data (see validateSuggestion).
 */
export function planAiSuggestionMerge(
  existing: ItemRecord[],
  suggestions: AiSuggestion[],
  currentVersion: number,
  availability: AnalysisAvailability
): AiMergePlan {
  const live = new Set<string>();
  const dismissedAt = new Map<string, number>();
  for (const item of existing) {
    const key = itemIdentity(item.kind, item.payload);
    if (LIVE.has(item.status)) live.add(key);
    if (item.status === "dismissed") {
      const v = item.dismissedAtVersion ?? item.basedOnVersion;
      dismissedAt.set(key, Math.max(v, dismissedAt.get(key) ?? 0));
    }
  }
  const lockedSingle = new Set<PersonalizationItemKind>();
  for (const item of liveItems(existing)) {
    if (
      SINGLE_VALUE_KINDS.has(item.kind) &&
      (item.status === "confirmed" || item.source !== "ai_suggested")
    ) {
      lockedSingle.add(item.kind);
    }
  }

  const plan: AiMergePlan = { insert: [], skipped: [] };
  for (const s of suggestions) {
    const problem = validateSuggestion(s, availability);
    if (problem) {
      plan.skipped.push({ kind: s.kind, reason: problem });
      continue;
    }
    const key = itemIdentity(s.kind, s.payload);
    if (lockedSingle.has(s.kind)) {
      plan.skipped.push({ kind: s.kind, reason: "user_value_locked" });
      continue;
    }
    if (live.has(key)) {
      plan.skipped.push({ kind: s.kind, reason: "duplicate" });
      continue;
    }
    const dismissedVersion = dismissedAt.get(key);
    if (dismissedVersion !== undefined && currentVersion <= dismissedVersion) {
      plan.skipped.push({ kind: s.kind, reason: "dismissed" });
      continue;
    }
    live.add(key);
    plan.insert.push({
      kind: s.kind,
      payload: s.payload,
      source: "ai_suggested",
      status: "suggested",
      evidence: s.evidence,
      analysisRunId: s.analysisRunId,
      basedOnVersion: currentVersion,
      dismissedAtVersion: null,
      supersedesItemId: null,
    });
  }
  return plan;
}

export type EditPlan = {
  supersedeItemId: string;
  insert: NewItem;
  /** New personalizationVersion when the edit invalidates other suggestions, else unchanged. */
  nextVersion: number;
  invalidatedKinds: PersonalizationItemKind[];
};

/**
 * User edits an item. The old row is marked superseded (kept for history),
 * a new confirmed row is written, and dependent AI suggestions become stale.
 * Nothing is deleted, and analysis runs are never touched.
 *
 * A pillar edit keeps its measured view share only if the user did not change
 * the number; a user cannot type a "measured" number.
 */
export function planItemEdit<K extends PersonalizationItemKind>(
  current: ItemRecord<K>,
  newPayload: ItemPayloadByKind[K],
  currentVersion: number
): EditPlan {
  if (!LIVE.has(current.status)) {
    throw new Error(`Cannot edit an item with status "${current.status}"`);
  }
  let payload = newPayload;
  if (current.kind === "pillar") {
    const before = current.payload as ItemPayloadByKind["pillar"];
    const after = newPayload as ItemPayloadByKind["pillar"];
    const keepMeasured =
      current.evidence === "performance_backed" &&
      after.viewSharePercent === before.viewSharePercent;
    payload = {
      ...after,
      viewSharePercent: keepMeasured ? before.viewSharePercent : null,
    } as ItemPayloadByKind[K];
  }
  const invalidatedKinds = INVALIDATES_ON_EDIT[current.kind];
  const nextVersion =
    invalidatedKinds.length > 0 ? currentVersion + 1 : currentVersion;
  const keepsMeasurement =
    current.kind === "pillar" &&
    (payload as ItemPayloadByKind["pillar"]).viewSharePercent !== null;
  return {
    supersedeItemId: current.id,
    insert: {
      kind: current.kind,
      payload,
      source: "user_edited",
      status: "confirmed",
      // An edited pillar that keeps its measured share stays tied to the run that measured it.
      evidence: keepsMeasurement ? "performance_backed" : "user_provided",
      analysisRunId: keepsMeasurement ? current.analysisRunId : null,
      basedOnVersion: nextVersion,
      dismissedAtVersion: null,
      supersedesItemId: current.id,
    },
    nextVersion,
    invalidatedKinds,
  };
}

/** User dismisses a suggestion. Recorded with the current version so it does not come back for the same answers. */
export function planDismiss(
  current: ItemRecord,
  currentVersion: number
): { itemId: string; status: "dismissed"; dismissedAtVersion: number } {
  if (current.status !== "suggested") {
    throw new Error(
      `Only suggestions can be dismissed (got "${current.status}")`
    );
  }
  return {
    itemId: current.id,
    status: "dismissed",
    dismissedAtVersion: currentVersion,
  };
}

/**
 * An AI suggestion is stale when it was built on older answers than the
 * current personalizationVersion and its kind depends on edited answers.
 * Confirmed and user-written items are never stale.
 */
export function isStaleSuggestion(
  item: ItemRecord,
  currentVersion: number
): boolean {
  if (item.status !== "suggested" || item.source !== "ai_suggested")
    return false;
  const dependsOnAnswers = Object.values(INVALIDATES_ON_EDIT).some(kinds =>
    kinds.includes(item.kind)
  );
  return dependsOnAnswers && item.basedOnVersion < currentVersion;
}

/**
 * Confirm button on a stepper screen: every live, NON-STALE suggestion of that
 * step's kinds becomes confirmed. Already confirmed rows are left alone.
 */
export function idsToConfirmForStep(
  step: PersonalizationStep,
  items: ItemRecord[],
  currentVersion: number
): string[] {
  const kinds: PersonalizationItemKind[] =
    step === "goal"
      ? ["goal", "niche", "language"]
      : step === "audience"
        ? ["audience"]
        : ["pillar"];
  return items
    .filter(
      i =>
        kinds.includes(i.kind) &&
        i.status === "suggested" &&
        !isStaleSuggestion(i, currentVersion)
    )
    .map(i => i.id);
}

/* ------------------------------------------------------------------ */
/* Active profile                                                      */
/* ------------------------------------------------------------------ */

export type ProfileForSelection = {
  id: string;
  workspaceId: string;
  deletedAt: Date | null;
  createdAt: Date;
};

/**
 * Which profile a member is working on. A stored selection is only honored
 * if it points to a live profile in THIS workspace. Otherwise fall back to
 * the oldest live profile in the workspace, or null. A stale or foreign id
 * is never returned.
 */
export function resolveActiveProfileId(input: {
  workspaceId: string;
  storedSelectionId: string | null;
  profiles: ProfileForSelection[];
}): { profileId: string | null; selectionWasStale: boolean } {
  const usable = input.profiles
    .filter(p => p.workspaceId === input.workspaceId && p.deletedAt === null)
    .sort(
      (a, b) =>
        a.createdAt.getTime() - b.createdAt.getTime() ||
        a.id.localeCompare(b.id)
    );
  const stored = input.storedSelectionId
    ? usable.find(p => p.id === input.storedSelectionId)
    : undefined;
  if (stored) return { profileId: stored.id, selectionWasStale: false };
  return {
    profileId: usable[0]?.id ?? null,
    selectionWasStale: input.storedSelectionId !== null,
  };
}

/* ------------------------------------------------------------------ */
/* Analysis runs                                                       */
/* ------------------------------------------------------------------ */

export type AnalysisAccountIdentity = {
  socialProfileId: string;
  platform: SocialPlatform;
  normalizedHandle: string;
  platformAccountId: string | null;
};

/**
 * Identity of ONE logical analysis request (not of a time window):
 * - initial: account identity + "initial" (same forever for that account)
 * - user_refresh: account identity + refresh sequence number n. Two taps at
 *   the same moment both compute the same n, so they collapse into one job;
 *   the next refresh gets n+1, so a legitimate refresh is never blocked by
 *   an old key.
 * - background: account identity + policy period index (several schedulers in
 *   the same period collapse into one job).
 */
export function analysisRequestFingerprint(
  input: AnalysisAccountIdentity &
    (
      | { requestKind: "initial" }
      | { requestKind: "user_refresh"; refreshSequence: number }
      | { requestKind: "background"; periodIndex: number }
    )
): string {
  const discriminator =
    input.requestKind === "initial"
      ? "initial"
      : input.requestKind === "user_refresh"
        ? `refresh:${input.refreshSequence}`
        : `background:${input.periodIndex}`;
  if (input.requestKind === "user_refresh" && !(input.refreshSequence >= 1)) {
    throw new Error("refreshSequence must be >= 1");
  }
  return [
    "v2",
    input.socialProfileId,
    input.platform,
    input.normalizedHandle,
    input.platformAccountId ?? "",
    discriminator,
  ].join("|");
}

export type ExistingRunSummary = {
  id: string;
  requestKind: AnalysisRequestKind;
  status: AnalysisRunStatus;
  /** Same account identity as now (handle/platform/account id unchanged). */
  sameAccountIdentity: boolean;
  createdAt: Date;
  completedAt: Date | null;
};

export type AnalysisRequestDecision =
  | { action: "reuse_active"; runId: string }
  | { action: "reuse_completed"; runId: string }
  | { action: "retry_failed"; runId: string }
  | {
      action: "create";
      requestKind: AnalysisRequestKind;
      refreshSequence: number | null;
      periodIndex: number | null;
    }
  | {
      action: "reject";
      reason:
        | "not_analyzable"
        | "usage_limit"
        | "cooldown"
        | "background_disabled"
        | "fresh_enough";
      retryAfter?: Date;
    };

const ANALYZABLE: ReadonlySet<SocialProfileStatus> = new Set([
  "pending_confirmation",
  "confirmed",
]);

/**
 * Decides what to do with an analysis request. Pure: the server loads the
 * runs, calls this, then acts. Order of rules:
 * 1. Accounts we cannot analyze (private, not found, not posting yet) never
 *    trigger provider calls.
 * 2. If any run is queued or running for this profile, reuse it (single
 *    flight; also enforced by a DB unique key on the active slot).
 * 3. initial: reuse a finished one for the same account; retry a failed one
 *    in place; otherwise create.
 * 4. user_refresh: needs usage allowance and the cooldown since the last
 *    finished run; creates run n+1.
 * 5. background: only when enabled and the last success is older than the
 *    interval; one per policy period.
 */
export function decideAnalysisRequest(input: {
  requestKind: AnalysisRequestKind;
  profileStatus: SocialProfileStatus;
  runs: ExistingRunSummary[];
  now: Date;
  /** user_refresh only: result of the existing usage-limit check. */
  usageAllowed?: boolean;
  policy?: AnalysisRefreshPolicy;
}): AnalysisRequestDecision {
  const policy = input.policy ?? ANALYSIS_REFRESH_POLICY;
  if (!ANALYZABLE.has(input.profileStatus)) {
    return { action: "reject", reason: "not_analyzable" };
  }

  const active = input.runs.find(
    r => r.status === "queued" || r.status === "running"
  );
  if (active) return { action: "reuse_active", runId: active.id };

  const finished = input.runs
    .filter(r => r.completedAt !== null)
    .sort((a, b) => b.completedAt!.getTime() - a.completedAt!.getTime());

  if (input.requestKind === "initial") {
    const initial = input.runs
      .filter(r => r.requestKind === "initial" && r.sameAccountIdentity)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (initial?.status === "failed")
      return { action: "retry_failed", runId: initial.id };
    if (initial) return { action: "reuse_completed", runId: initial.id };
    return {
      action: "create",
      requestKind: "initial",
      refreshSequence: null,
      periodIndex: null,
    };
  }

  if (input.requestKind === "user_refresh") {
    if (!input.usageAllowed) return { action: "reject", reason: "usage_limit" };
    const last = finished[0];
    if (last) {
      const readyAt = new Date(
        last.completedAt!.getTime() + policy.userRefreshCooldownMinutes * 60_000
      );
      if (input.now < readyAt) {
        return { action: "reject", reason: "cooldown", retryAfter: readyAt };
      }
    }
    const refreshSequence =
      input.runs.filter(r => r.requestKind === "user_refresh").length + 1;
    return {
      action: "create",
      requestKind: "user_refresh",
      refreshSequence,
      periodIndex: null,
    };
  }

  // background
  if (!policy.backgroundRefreshEnabled) {
    return { action: "reject", reason: "background_disabled" };
  }
  const intervalMs = policy.backgroundRefreshIntervalDays * 86_400_000;
  const lastSuccess = finished.find(
    r => r.status === "succeeded" || r.status === "partial"
  );
  if (
    lastSuccess &&
    input.now.getTime() - lastSuccess.completedAt!.getTime() < intervalMs
  ) {
    return {
      action: "reject",
      reason: "fresh_enough",
      retryAfter: new Date(lastSuccess.completedAt!.getTime() + intervalMs),
    };
  }
  return {
    action: "create",
    requestKind: "background",
    refreshSequence: null,
    periodIndex: Math.floor(input.now.getTime() / intervalMs),
  };
}

/**
 * When a new analysis produces suggestions, older AI suggestions that the
 * user never acted on are superseded (kept, hidden). Confirmed values,
 * user-written values and dismissed rows are never touched.
 */
export function idsToSupersedeOnRegeneration(
  existing: ItemRecord[],
  newRunId: string,
  kinds: PersonalizationItemKind[]
): string[] {
  return existing
    .filter(
      i =>
        kinds.includes(i.kind) &&
        i.status === "suggested" &&
        i.source === "ai_suggested" &&
        i.analysisRunId !== newRunId
    )
    .map(i => i.id);
}

/** Same profile + same inputs = same durable job. A duplicate enqueue is a no-op. */
export function profileAnalysisIdempotencyKey(
  socialProfileId: string,
  inputHash: string
): string {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(socialProfileId))
    throw new Error("Invalid socialProfileId");
  if (!/^[a-f0-9]{16,64}$/.test(inputHash))
    throw new Error("Invalid inputHash");
  const key = `${PROFILE_ANALYSIS_JOB_TYPE}:${socialProfileId}:${inputHash}`;
  if (key.length > 191) throw new Error("Idempotency key too long");
  return key;
}

/** Run status from its stage statuses. Real job state only, never a timer. */
export function deriveRunStatus(
  stages: Partial<Record<AnalysisStage, AnalysisStageStatus>>
): AnalysisRunStatus {
  const all = ANALYSIS_STAGES.map(s => stages[s] ?? "waiting");
  if (all.every(s => s === "waiting")) return "queued";
  if (all.some(s => s === "running" || s === "waiting")) return "running";
  if (all.every(s => s === "done" || s === "skipped")) return "succeeded";
  if (all.some(s => s === "done")) return "partial";
  return "failed";
}
