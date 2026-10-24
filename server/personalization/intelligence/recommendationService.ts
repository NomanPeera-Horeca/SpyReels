/**
 * Suggestion engine orchestrator for Goal -> Audience -> Pillars.
 *
 * One entry point, generateRecommendations(step). Order of checks:
 * 1. Authorize the profile (workspace from server context only).
 * 2. Dependencies: audiences need a confirmed goal; pillars need a confirmed
 *    goal and at least one confirmed audience. A confirmed goal is never
 *    regenerated.
 * 3. Cache: if suggestions already exist for the SAME inputs (live,
 *    confirmed or dismissed), reuse them. No model call. This also makes the
 *    call idempotent: repeated taps, retries and resumed jobs cost nothing.
 * 4. Generate with the step's generator (structured, validated, bounded).
 * 5. Write through planAiSuggestionMerge (never overwrites, never invents
 *    numbers), superseding older unconfirmed AI rows of that kind, ONLY if
 *    the confirmed inputs are still the same at write time (compare-and-
 *    write). If the user edited something meanwhile, the result is dropped.
 *
 * AI failure never touches confirmed data: the step stays completable by
 * typing values manually.
 *
 * Wired from server/personalization/jobs.ts. The durable key includes the
 * personalization version. A finished success is not requeued.
 */
import type {
  AnalysisSourceSnapshot,
  AudiencePayload,
  GenerationMeta,
  ItemPayloadByKind,
  LanguagePayload,
  NichePayload,
  PersonalizationItemKind,
  PillarPayload,
  ProfileEvidence,
  SocialPlatform,
  SocialProfileStatus,
} from "@shared/personalization/model";
import {
  idsToSupersedeOnRegeneration,
  planAiSuggestionMerge,
  stableHash,
  upstreamInputsHash,
  type AiSuggestion,
  type ItemRecord,
} from "@shared/personalization/state";
import {
  assertSocialProfileInWorkspace,
  type PersonalizationCtx,
} from "../authorization";
import type { AiSuggestionInsert } from "../analysis/contract";
import {
  AUDIENCE_PROMPT_VERSION,
  recommendAudiences,
} from "./audienceRecommendations";
import { buildCreatorEvidence, type CreatorEvidence } from "./evidence";
import { GOAL_PROMPT_VERSION, inferGoal } from "./goalInference";
import {
  PILLAR_PROMPT_VERSION,
  recommendPillars,
} from "./pillarRecommendations";
import {
  catalogNiche,
  detectContentLanguage,
  inferNicheLabel,
} from "./profileBasics";
import {
  IntelligenceError,
  type LlmInvoker,
  type LlmUsage,
} from "./structuredLlm";
import { subtopicSaveFailureFields } from "../subtopics";

export type RecommendationStep = "goal" | "audience" | "pillars";

const STEP_KIND: Record<RecommendationStep, PersonalizationItemKind> = {
  goal: "goal",
  audience: "audience",
  pillars: "pillar",
};
const PROMPT_VERSION: Record<RecommendationStep, string> = {
  goal: GOAL_PROMPT_VERSION,
  audience: AUDIENCE_PROMPT_VERSION,
  pillars: PILLAR_PROMPT_VERSION,
};

export type GenerationProfile = {
  id: string;
  workspaceId: string;
  deletedAt: Date | null;
  status: SocialProfileStatus;
  platform: SocialPlatform | null;
  displayName: string | null;
  bio: string | null;
  confirmedAt?: Date | null;
};

export type GeneratedInsert = AiSuggestionInsert & {
  generationMeta: GenerationMeta;
};

export interface RecommendationStore {
  loadProfile(
    profileId: string,
    workspaceId: string
  ): Promise<GenerationProfile | null>;
  /** Snapshot of the latest succeeded or partial analysis, or null. */
  loadLatestSnapshot(profileId: string): Promise<AnalysisSourceSnapshot | null>;
  /**
   * Lookup facts on a run whose posts are not fetched yet.
   * Null once sourceFetchedAt is set. Those facts then live on the snapshot.
   */
  loadOpenProfileEvidence?(profileId: string): Promise<ProfileEvidence | null>;
  loadItems(profileId: string): Promise<ItemRecord[]>;
  loadPersonalizationVersion(profileId: string): Promise<number>;
  /**
   * One transaction, compare-and-write. Re-read the items and check the guard:
   * - inputs_unchanged: upstreamInputsHash(kind) still equals `expected`
   *   (audience, pillars: the user did not edit the goal/audience meanwhile)
   * - no_confirmed: there is still no confirmed item of `kind`
   *   (goal: the user did not type and confirm their own goal meanwhile)
   * Only then supersede and insert. Otherwise write nothing and return "stale".
   */
  applyGeneratedSuggestions(
    profileId: string,
    input: {
      kind: PersonalizationItemKind;
      guard:
        | { type: "inputs_unchanged"; expected: string }
        | { type: "no_confirmed" };
      /**
       * Personalization version captured before the model call. If the user
       * edited anything while the model was running, the write is dropped.
       */
      expectedVersion?: number;
      supersedeIds: string[];
      inserts: GeneratedInsert[];
    }
  ): Promise<"applied" | "stale">;
  saveSubtopics?(
    profileId: string,
    groups: { title: string; labels: string[]; pillarHash: string }[]
  ): Promise<void>;
}

export type RecommendationResult =
  | { status: "already_confirmed" }
  | {
      status: "reused";
      liveSuggestionIds: string[];
      dismissedForTheseInputs: boolean;
    }
  | {
      status: "needs_clarification";
      question: string;
      reason: "insufficient_evidence" | "ambiguous";
      usage: LlmUsage | null;
    }
  | {
      status: "generated";
      inserted: number;
      usage: LlmUsage;
      confidence: string;
    }
  | { status: "stale_discarded"; usage: LlmUsage }
  | {
      status: "failed";
      kind: "timeout" | "invalid_output" | "llm_unavailable";
      usage: LlmUsage;
      /** Stable parser or provider reason. Never profile text. */
      reason?: string;
    };

/** Durable job idempotency key for one generation (same inputs = same job). */
export function recommendationJobKey(
  profileId: string,
  step: RecommendationStep,
  inputsHash: string
): string {
  return `personalization_recommendations:${profileId}:${step}:${inputsHash}:${PROMPT_VERSION[step]}`;
}

const confirmedOf = <K extends PersonalizationItemKind>(
  items: ItemRecord[],
  kind: K
) =>
  items
    .filter(i => i.kind === kind && i.status === "confirmed")
    .map(i => i.payload as ItemPayloadByKind[K]);

/**
 * Cache key. Goal uses the evidence. Later steps also include confirmed
 * upstream answers, so a finished analysis or a newly confirmed goal starts
 * a new suggestion instead of reusing the biography-only one.
 */
export function stepInputsHash(
  step: RecommendationStep,
  items: ItemRecord[],
  evidence: CreatorEvidence
): string {
  if (step === "goal") return stableHash(`goal|${evidence.hash}`);
  // Keep the upstream hash as a prefix so an evidence refresh is not treated as an edit.
  return `${upstreamInputsHash(STEP_KIND[step], items)}|${evidence.hash}`;
}

/** Elapsed time from "That's me" to a saved suggestion. Null when the clock is missing or absurd. */
export function msSinceConfirm(
  confirmedAt: Date | null | undefined,
  now = Date.now()
): number | null {
  if (!confirmedAt) return null;
  const ms = now - confirmedAt.getTime();
  if (!Number.isFinite(ms) || ms < 0 || ms > 24 * 60 * 60 * 1000) return null;
  return ms;
}

/** Confirm-to-visible delay once at least one saved suggestion is on screen. */
export function firstVisibleDelayMs(
  confirmedAt: Date | null | undefined,
  suggestionCount: number,
  now = Date.now()
): number | null {
  if (suggestionCount < 1) return null;
  return msSinceConfirm(confirmedAt, now);
}

function logSuggestionSaved(input: {
  profileId: string;
  step: string;
  confirmedAt: Date | null | undefined;
  first: boolean;
}): void {
  const elapsed = msSinceConfirm(input.confirmedAt);
  if (elapsed == null) return;
  console.info("[personalization] suggestion_saved", {
    profileId: input.profileId,
    step: input.step,
    msSinceConfirm: elapsed,
    first: input.first,
  });
}

function profileTextForBasics(
  profile: { displayName: string | null; bio: string | null },
  evidence: CreatorEvidence
): string {
  const extra = evidence.snippets
    .filter(
      snippet =>
        snippet.source === "category" ||
        snippet.source === "cta" ||
        snippet.source === "website" ||
        snippet.source === "captions"
    )
    .map(snippet => snippet.text);
  return [profile.displayName, profile.bio, ...extra]
    .filter(text => Boolean(text && text.trim()))
    .join("\n");
}

function snapshotFingerprint(snapshot: AnalysisSourceSnapshot | null): string {
  if (!snapshot || snapshot.posts.length === 0) return "none";
  const ids = snapshot.posts.map(post => post.postId).sort().join(",");
  return stableHash(`${snapshot.posts.length}:${ids}`);
}

function lockedByUser(items: ItemRecord[], kind: PersonalizationItemKind): boolean {
  return items.some(
    item =>
      item.kind === kind &&
      item.status !== "superseded" &&
      item.status !== "dismissed" &&
      (item.status === "confirmed" || item.source !== "ai_suggested")
  );
}

/** True when the live rows for this step were saved for the current evidence. */
export function stepSuggestionsSaved(
  items: ItemRecord[],
  step: RecommendationStep,
  evidence: CreatorEvidence
): boolean {
  return freshAiCovers(items, STEP_KIND[step], stepInputsHash(step, items, evidence));
}

const STEP_DISPLAY_KINDS: Record<RecommendationStep, readonly string[]> = {
  goal: ["goal", "niche", "language"],
  audience: ["audience"],
  pillars: ["pillar"],
};

/** Saved rows for this step, including ones written before the latest evidence. */
export function stepHasLiveSuggestions(
  items: readonly { kind: string; status: string }[],
  step: RecommendationStep
): boolean {
  const kinds = STEP_DISPLAY_KINDS[step];
  return items.some(
    item =>
      kinds.includes(item.kind) &&
      (item.status === "suggested" || item.status === "confirmed")
  );
}

/** Parser reason only. Drops parenthetical evidence so logs stay free of profile text. */
export function safeValidationReason(message: string): string {
  const stripped = message.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (!stripped || stripped.length > 140) return "validation_failed";
  if (/https?:|@\w/i.test(stripped)) return "validation_failed";
  return stripped;
}

function freshAiCovers(
  items: ItemRecord[],
  kind: PersonalizationItemKind,
  inputsHash: string
): boolean {
  const live = items.filter(
    item => item.kind === kind && item.status !== "superseded" && item.status !== "dismissed"
  );
  return (
    live.length > 0 &&
    live.every(
      item =>
        item.source === "ai_suggested" &&
        item.basedOnInputsHash === inputsHash &&
        (item.status === "suggested" || item.status === "confirmed")
    )
  );
}

export async function generateRecommendations(
  deps: {
    store: RecommendationStore;
    invoker?: LlmInvoker;
    timeoutMs?: number;
    onRejected?: (reason: string) => void;
  },
  input: {
    ctx: PersonalizationCtx;
    socialProfileId: string;
    step: RecommendationStep;
  }
): Promise<RecommendationResult> {
  const profile = assertSocialProfileInWorkspace(
    await deps.store.loadProfile(
      input.socialProfileId,
      input.ctx.workspaceId ?? ""
    ),
    input.ctx
  );
  const items = await deps.store.loadItems(profile.id);
  const kind = STEP_KIND[input.step];
  let firstSuggestion = !items.some(
    item =>
      item.source === "ai_suggested" &&
      (item.status === "suggested" || item.status === "confirmed")
  );
  const noteSaved = (step: string) => {
    logSuggestionSaved({
      profileId: profile.id,
      step,
      confirmedAt: profile.confirmedAt,
      first: firstSuggestion,
    });
    firstSuggestion = false;
  };

  const goals = confirmedOf(items, "goal");
  const audiences = confirmedOf(items, "audience");

  const snapshot = await deps.store.loadLatestSnapshot(profile.id);
  const openEvidence =
    snapshot && snapshot.posts.length > 0
      ? null
      : ((await deps.store.loadOpenProfileEvidence?.(profile.id)) ?? null);
  const fingerprintAtStart = snapshotFingerprint(snapshot);
  const evidence = buildCreatorEvidence({
    platform: profile.platform,
    displayName: profile.displayName,
    bio: profile.bio,
    snapshot,
    items,
    profileEvidence: snapshot?.profileEvidence ?? openEvidence,
  });
  const inputsHash = stepInputsHash(input.step, items, evidence);
  const versionAtStart = await deps.store.loadPersonalizationVersion(profile.id);

  if (input.step === "goal") {
    return runGoalStep({
      deps,
      profileId: profile.id,
      items,
      evidence,
      inputsHash,
      versionAtStart,
      profileText: profileTextForBasics(profile, evidence),
      needGoal: !lockedByUser(items, "goal") && !freshAiCovers(items, "goal", inputsHash),
      needNiche: !lockedByUser(items, "niche") && !freshAiCovers(items, "niche", inputsHash),
      needLanguage:
        !lockedByUser(items, "language") && !freshAiCovers(items, "language", inputsHash),
      noteSaved,
      fingerprintAtStart,
      timeoutMs: deps.timeoutMs,
    });
  }

  // Cache / idempotency: same inputs already answered.
  const sameInputs = items.filter(
    i =>
      i.kind === kind &&
      i.source === "ai_suggested" &&
      i.basedOnInputsHash === inputsHash
  );
  if (sameInputs.length > 0) {
    const live = sameInputs.filter(
      i => i.status === "suggested" || i.status === "confirmed"
    );
    return {
      status: "reused",
      liveSuggestionIds: live.map(i => i.id),
      dismissedForTheseInputs:
        live.length === 0 && sameInputs.some(i => i.status === "dismissed"),
    };
  }

  let suggestions: AiSuggestion[];
  let usage: LlmUsage;
  let attempts: number;
  let confidence: "high" | "medium" | "low";
  let subtopicGroups: { title: string; labels: string[] }[] = [];
  try {
    if (input.step === "audience") {
      const r = await recommendAudiences({
        evidence,
        confirmedGoal: goals.map(g => g.text).join(" "),
        confirmedAudiences: audiences,
        invoker: deps.invoker,
        timeoutMs: deps.timeoutMs,
        onRejected: deps.onRejected,
      });
      usage = r.usage;
      attempts = r.attempts;
      confidence = r.confidence;
      suggestions = r.audiences.map(a => ({
        kind: "audience" as const,
        payload: { who: a.who, outcome: a.outcome } satisfies AudiencePayload,
        evidence: "profile_inferred" as const,
        analysisRunId: null,
      }));
    } else {
      const r = await recommendPillars({
        evidence,
        confirmedGoal: goals.map(g => g.text).join(" "),
        confirmedAudiences: audiences,
        confirmedPillars: confirmedOf(items, "pillar"),
        invoker: deps.invoker,
        timeoutMs: deps.timeoutMs,
        onRejected: deps.onRejected,
      });
      usage = r.usage;
      attempts = r.attempts;
      confidence = r.confidence;
      suggestions = r.pillars.map(p => ({
        kind: "pillar" as const,
        payload: p satisfies PillarPayload,
        evidence: "profile_inferred" as const,
        analysisRunId: null,
      }));
      subtopicGroups = r.pillars.map((p, i) => ({
        title: p.title,
        labels: r.subtopics[i] ?? [],
      }));
    }
  } catch (err) {
    if (err instanceof IntelligenceError)
      return {
        status: "failed",
        kind: err.kind,
        usage: err.usage,
        reason: safeValidationReason(err.message),
      };
    throw err;
  }

  const meta: GenerationMeta = {
    promptVersion: PROMPT_VERSION[input.step],
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    estimatedUsd: usage.estimatedUsd,
    attempts,
    evidenceStrength: evidence.strength,
    evidenceBasis: evidence.sources,
  };
  const versionNow = await deps.store.loadPersonalizationVersion(profile.id);
  if (versionNow !== versionAtStart)
    return { status: "stale_discarded", usage };
  const snapshotNow = await deps.store.loadLatestSnapshot(profile.id);
  if (snapshotFingerprint(snapshotNow) !== fingerprintAtStart)
    return { status: "stale_discarded", usage };
  const upstream = upstreamInputsHash(kind, items);
  const plan = planAiSuggestionMerge(
    items,
    suggestions.map(s => ({ ...s, basedOnInputsHash: inputsHash, confidence })),
    versionNow,
    "unavailable" // recommendations are never performance-backed
  );
  const supersedeIds = idsToSupersedeOnRegeneration(items, "__none__", [
    kind,
  ]).filter(id => {
    const row = items.find(i => i.id === id);
    return row?.basedOnInputsHash !== inputsHash;
  });
  const applied = await deps.store.applyGeneratedSuggestions(profile.id, {
    kind,
    guard: { type: "inputs_unchanged", expected: upstream },
    expectedVersion: versionAtStart,
    supersedeIds,
    inserts: plan.insert.map(i => ({ ...i, generationMeta: meta })),
  });
  if (applied === "stale") return { status: "stale_discarded", usage };
  if (applied === "applied" && plan.insert.length) noteSaved(input.step);
  if (input.step === "pillars" && subtopicGroups.length) {
    // The pillars are already saved. A failed topic save must not fail the pillar
    // step or be retried here: the pillar card offers "Find topic ideas" instead.
    // Log the missing migration names only. Never message text or profile text.
    try {
      await deps.store.saveSubtopics?.(
        profile.id,
        subtopicGroups.map(g => ({ ...g, pillarHash: inputsHash }))
      );
    } catch (err) {
      console.warn("[personalization] pillar topics not saved; pillars kept", subtopicSaveFailureFields(err));
    }
  }
  return {
    status: "generated",
    inserted: plan.insert.length,
    usage,
    confidence,
  };
}

const EMPTY_USAGE: LlmUsage = {
  model: null,
  inputTokens: 0,
  outputTokens: 0,
  estimatedUsd: 0,
};

async function commitSuggestions(
  store: RecommendationStore,
  input: {
    profileId: string;
    items: ItemRecord[];
    kind: PersonalizationItemKind;
    suggestions: AiSuggestion[];
    inputsHash: string;
    versionAtStart: number;
    confidence: "high" | "medium" | "low";
    evidence: CreatorEvidence;
    promptVersion: string;
    usage: LlmUsage;
    attempts: number;
  }
): Promise<"applied" | "stale" | "empty"> {
  if (input.suggestions.length === 0) return "empty";
  const versionNow = await store.loadPersonalizationVersion(input.profileId);
  if (versionNow !== input.versionAtStart) return "stale";
  const meta: GenerationMeta = {
    promptVersion: input.promptVersion,
    model: input.usage.model,
    inputTokens: input.usage.inputTokens,
    outputTokens: input.usage.outputTokens,
    estimatedUsd: input.usage.estimatedUsd,
    attempts: input.attempts,
    evidenceStrength: input.evidence.strength,
    evidenceBasis: input.evidence.sources,
  };
  const plan = planAiSuggestionMerge(
    input.items,
    input.suggestions.map(s => ({
      ...s,
      basedOnInputsHash: input.inputsHash,
      confidence: input.confidence,
    })),
    versionNow,
    "unavailable"
  );
  const supersedeIds = idsToSupersedeOnRegeneration(input.items, "__none__", [
    input.kind,
  ]).filter(id => {
    const row = input.items.find(i => i.id === id);
    return row?.basedOnInputsHash !== input.inputsHash;
  });
  return store.applyGeneratedSuggestions(input.profileId, {
    kind: input.kind,
    guard: { type: "no_confirmed" },
    expectedVersion: input.versionAtStart,
    supersedeIds,
    inserts: plan.insert.map(i => ({ ...i, generationMeta: meta })),
  });
}

async function runGoalStep(input: {
  deps: {
    store: RecommendationStore;
    invoker?: LlmInvoker;
    onRejected?: (reason: string) => void;
  };
  profileId: string;
  items: ItemRecord[];
  evidence: CreatorEvidence;
  inputsHash: string;
  versionAtStart: number;
  profileText: string;
  needGoal: boolean;
  needNiche: boolean;
  needLanguage: boolean;
  fingerprintAtStart: string;
  noteSaved: (step: string) => void;
  timeoutMs?: number;
}): Promise<RecommendationResult> {
  const { deps, evidence } = input;
  const postsChanged = async () => {
    const snap = await deps.store.loadLatestSnapshot(input.profileId);
    return snapshotFingerprint(snap) !== input.fingerprintAtStart;
  };
  if (!input.needGoal && !input.needNiche && !input.needLanguage) {
    const same = input.items.filter(
      i =>
        i.kind === "goal" &&
        i.source === "ai_suggested" &&
        i.basedOnInputsHash === input.inputsHash
    );
    if (same.length > 0) {
      const live = same.filter(
        i => i.status === "suggested" || i.status === "confirmed"
      );
      return {
        status: "reused",
        liveSuggestionIds: live.map(i => i.id),
        dismissedForTheseInputs:
          live.length === 0 && same.some(i => i.status === "dismissed"),
      };
    }
    return { status: "already_confirmed" };
  }

  const goalCached =
    input.needGoal &&
    input.items.some(
      i =>
        i.kind === "goal" &&
        i.source === "ai_suggested" &&
        i.basedOnInputsHash === input.inputsHash &&
        i.status !== "superseded"
    );

  const goalTask = (async () => {
    if (!input.needGoal || goalCached) return null;
    return inferGoal({
      evidence,
      invoker: deps.invoker,
      timeoutMs: input.timeoutMs,
      onRejected: deps.onRejected,
    });
  })();

  const basicsTask = (async () => {
    const language = input.needLanguage
      ? detectContentLanguage(input.profileText)
      : null;
    let niche = input.needNiche ? catalogNiche(input.profileText) : null;
    let usage: LlmUsage | null = null;
    if (input.needNiche && !niche && evidence.strength !== "none") {
      const inferred = await inferNicheLabel({
        evidence,
        invoker: deps.invoker,
        timeoutMs: Math.min(input.timeoutMs ?? 12_000, 12_000),
      });
      niche = inferred.niche;
      usage = inferred.usage;
    }
    return { niche, language, usage };
  })();

  let goalResult: Awaited<ReturnType<typeof inferGoal>> | null = null;
  let goalError: IntelligenceError | null = null;
  try {
    goalResult = await goalTask;
  } catch (err) {
    if (err instanceof IntelligenceError) goalError = err;
    else throw err;
  }
  const basics = await basicsTask;

  const usage = goalResult && goalResult.status !== "needs_clarification"
    ? goalResult.usage
    : (basics.usage ?? goalError?.usage ?? EMPTY_USAGE);

  let inserted = 0;
  if (await postsChanged()) return { status: "stale_discarded", usage };
  if (goalResult && goalResult.status === "suggested") {
    const wrote = await commitSuggestions(deps.store, {
      profileId: input.profileId,
      items: input.items,
      kind: "goal",
      suggestions: [
        {
          kind: "goal",
          payload: { text: goalResult.goal },
          evidence: "profile_inferred",
          analysisRunId: null,
        },
      ],
      inputsHash: input.inputsHash,
      versionAtStart: input.versionAtStart,
      confidence: goalResult.confidence,
      evidence,
      promptVersion: GOAL_PROMPT_VERSION,
      usage: goalResult.usage,
      attempts: goalResult.attempts,
    });
    if (wrote === "stale") return { status: "stale_discarded", usage: goalResult.usage };
    if (wrote === "applied") {
      inserted += 1;
      input.noteSaved("goal");
    }
  }

  if (basics.niche) {
    const wrote = await commitSuggestions(deps.store, {
      profileId: input.profileId,
      items: input.items,
      kind: "niche",
      suggestions: [
        {
          kind: "niche",
          payload: {
            slug: basics.niche.slug,
            label: basics.niche.label,
          } satisfies NichePayload,
          evidence: "profile_inferred",
          analysisRunId: null,
        },
      ],
      inputsHash: input.inputsHash,
      versionAtStart: input.versionAtStart,
      confidence: "medium",
      evidence,
      promptVersion: "niche-v1",
      usage: basics.usage ?? EMPTY_USAGE,
      attempts: basics.usage ? 1 : 0,
    });
    if (wrote === "stale")
      return { status: "stale_discarded", usage };
    if (wrote === "applied") {
      inserted += 1;
      input.noteSaved("niche");
    }
  }

  if (basics.language) {
    const wrote = await commitSuggestions(deps.store, {
      profileId: input.profileId,
      items: input.items,
      kind: "language",
      suggestions: [
        {
          kind: "language",
          payload: basics.language satisfies LanguagePayload,
          evidence: "profile_inferred",
          analysisRunId: null,
        },
      ],
      inputsHash: input.inputsHash,
      versionAtStart: input.versionAtStart,
      confidence: "medium",
      evidence,
      promptVersion: "language-v1",
      usage: EMPTY_USAGE,
      attempts: 0,
    });
    if (wrote === "stale") return { status: "stale_discarded", usage };
    if (wrote === "applied") {
      inserted += 1;
      input.noteSaved("language");
    }
  }

  // Niche and language can be saved from the profile while the goal model fails.
  // That fallback must not be reported as a finished goal.
  const goalStillOpen = input.needGoal && !goalCached;
  if (goalResult && goalResult.status === "needs_clarification" && goalStillOpen) {
    return {
      status: "needs_clarification",
      question: goalResult.question,
      reason: goalResult.reason,
      usage: goalResult.usage,
    };
  }
  if (goalError && goalStillOpen)
    return {
      status: "failed",
      kind: goalError.kind,
      usage: goalError.usage,
      reason: safeValidationReason(goalError.message),
    };
  if (inserted === 0) {
    const live = input.items.filter(
      i => i.kind === "goal" && (i.status === "suggested" || i.status === "confirmed")
    );
    return {
      status: "reused",
      liveSuggestionIds: live.map(i => i.id),
      dismissedForTheseInputs: false,
    };
  }
  return {
    status: "generated",
    inserted,
    usage,
    confidence:
      goalResult && goalResult.status === "suggested" ? goalResult.confidence : "medium",
  };
}

