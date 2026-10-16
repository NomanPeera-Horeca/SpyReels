/**
 * New onboarding + personalization: pure state rules.
 *
 * No database or network access. The server persists what these functions
 * decide; the client renders what they derive. Every rule here is unit tested
 * in state.test.ts.
 */
import {
  ANALYSIS_STAGES,
  INVALIDATES_ON_EDIT,
  MIN_POSTS_FOR_FULL_PERSONALIZATION,
  PERSONALIZATION_STEPS,
  PROFILE_ANALYSIS_JOB_TYPE,
  type AnalysisRunStatus,
  type AnalysisStage,
  type AnalysisStageStatus,
  type ItemPayloadByKind,
  type ItemSource,
  type ItemStatus,
  type OnboardingStep,
  type PersonalizationItemKind,
  type PersonalizationStep,
  type SocialPlatform,
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
/* Resume position                                                     */
/* ------------------------------------------------------------------ */

export type OnboardingProgressInput = {
  hasConfirmedProfile: boolean;
  primaryUseCaseAnswered: boolean;
  /** Answered OR skipped. Skip is stored as null answer + skippedAt. */
  attributionResolved: boolean;
  stepStatus: Record<PersonalizationStep, StepStatus>;
  completedAt: Date | null;
};

const STEP_DONE: ReadonlySet<StepStatus> = new Set([
  "confirmed",
  "skipped",
  "not_applicable",
]);

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

/** Data rule: with fewer than 10 posts, only Goal is shown. */
export function initialStepStatuses(
  postsInWindow: number | null
): Record<PersonalizationStep, StepStatus> {
  const thin =
    postsInWindow !== null &&
    postsInWindow < MIN_POSTS_FOR_FULL_PERSONALIZATION;
  return {
    goal: "pending",
    audience: thin ? "not_applicable" : "pending",
    pillars: thin ? "not_applicable" : "pending",
  };
}

/** Personalization is complete when every stepper step is confirmed, skipped or not applicable. */
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
 * while analysis is still running, and a plan can exist from before.
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
  /** personalizationVersion the item was created under. */
  basedOnVersion: number;
  supersedesItemId: string | null;
};

export type NewItem<
  K extends PersonalizationItemKind = PersonalizationItemKind,
> = Omit<ItemRecord<K>, "id">;

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

/** Kinds where the user has exactly one current value. */
const SINGLE_VALUE_KINDS: ReadonlySet<PersonalizationItemKind> = new Set([
  "goal",
  "niche",
  "language",
]);

export type AiMergePlan = {
  insert: NewItem[];
  skipped: Array<{ kind: PersonalizationItemKind; reason: string }>;
};

/**
 * Merge AI suggestions into existing items. Rules:
 * - Never changes or removes an existing row. Inserts only.
 * - Never adds a suggestion the user already has (live) or dismissed.
 * - For single-value kinds, never suggests over a confirmed or user-written value.
 */
export function planAiSuggestionMerge(
  existing: ItemRecord[],
  suggestions: Array<{
    kind: PersonalizationItemKind;
    payload: ItemPayloadByKind[PersonalizationItemKind];
  }>,
  currentVersion: number
): AiMergePlan {
  const seen = new Set<string>();
  for (const item of existing) {
    if (LIVE.has(item.status) || item.status === "dismissed") {
      seen.add(itemIdentity(item.kind, item.payload));
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
    const key = itemIdentity(s.kind, s.payload);
    if (lockedSingle.has(s.kind)) {
      plan.skipped.push({ kind: s.kind, reason: "user_value_locked" });
      continue;
    }
    if (seen.has(key)) {
      plan.skipped.push({ kind: s.kind, reason: "duplicate_or_dismissed" });
      continue;
    }
    seen.add(key);
    plan.insert.push({
      kind: s.kind,
      payload: s.payload,
      source: "ai_suggested",
      status: "suggested",
      basedOnVersion: currentVersion,
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
 * Nothing is deleted.
 */
export function planItemEdit<K extends PersonalizationItemKind>(
  current: ItemRecord<K>,
  newPayload: ItemPayloadByKind[K],
  currentVersion: number
): EditPlan {
  if (!LIVE.has(current.status)) {
    throw new Error(`Cannot edit an item with status "${current.status}"`);
  }
  const invalidatedKinds = INVALIDATES_ON_EDIT[current.kind];
  const nextVersion =
    invalidatedKinds.length > 0 ? currentVersion + 1 : currentVersion;
  return {
    supersedeItemId: current.id,
    insert: {
      kind: current.kind,
      payload: newPayload,
      source: "user_edited",
      status: "confirmed",
      basedOnVersion: nextVersion,
      supersedesItemId: current.id,
    },
    nextVersion,
    invalidatedKinds,
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
 * Confirm button on a stepper screen: every live suggestion of that step's
 * kinds becomes confirmed. Returns the ids to update. Already confirmed rows
 * are left alone.
 */
export function idsToConfirmForStep(
  step: PersonalizationStep,
  items: ItemRecord[]
): string[] {
  const kinds: PersonalizationItemKind[] =
    step === "goal"
      ? ["goal", "niche", "language"]
      : step === "audience"
        ? ["audience"]
        : ["pillar"];
  return items
    .filter(i => kinds.includes(i.kind) && i.status === "suggested")
    .map(i => i.id);
}

/* ------------------------------------------------------------------ */
/* Analysis runs                                                       */
/* ------------------------------------------------------------------ */

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
