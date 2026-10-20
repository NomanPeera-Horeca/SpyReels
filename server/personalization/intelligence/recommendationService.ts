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
  | {
      status: "blocked";
      reason: "goal_not_confirmed" | "audience_not_confirmed";
    }
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

/** Inputs fingerprint for a step: evidence for the goal, confirmed upstream values for the others. */
export function stepInputsHash(
  step: RecommendationStep,
  items: ItemRecord[],
  evidence: CreatorEvidence
): string {
  return step === "goal"
    ? stableHash(`goal|${evidence.hash}`)
    : upstreamInputsHash(STEP_KIND[step], items);
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

  const goals = confirmedOf(items, "goal");
  const audiences = confirmedOf(items, "audience");
  if (input.step !== "goal" && goals.length === 0)
    return { status: "blocked", reason: "goal_not_confirmed" };
  if (input.step === "pillars" && audiences.length === 0)
    return { status: "blocked", reason: "audience_not_confirmed" };

  const snapshot = await deps.store.loadLatestSnapshot(profile.id);
  const evidence = buildCreatorEvidence({
    platform: profile.platform,
    displayName: profile.displayName,
    bio: profile.bio,
    snapshot,
    items,
  });
  const inputsHash = stepInputsHash(input.step, items, evidence);
  const versionAtStart = await deps.store.loadPersonalizationVersion(profile.id);

  const settled = (k: PersonalizationItemKind) =>
    items.some(i => i.kind === k && i.status !== "superseded");

  if (input.step === "goal") {
    return runGoalStep({
      deps,
      profileId: profile.id,
      items,
      evidence,
      inputsHash,
      versionAtStart,
      profileText: [profile.displayName, profile.bio, ...evidence.topCaptions]
        .filter((s): s is string => Boolean(s && s.trim()))
        .join("\n"),
      needGoal: !settled("goal"),
      needNiche: !settled("niche"),
      needLanguage: !settled("language"),
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
      return { status: "failed", kind: err.kind, usage: err.usage };
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
    guard: { type: "inputs_unchanged", expected: inputsHash },
    expectedVersion: versionAtStart,
    supersedeIds,
    inserts: plan.insert.map(i => ({ ...i, generationMeta: meta })),
  });
  if (applied === "stale") return { status: "stale_discarded", usage };
  if (input.step === "pillars" && subtopicGroups.length) {
    // The pillars are already saved. A failed topic save must not fail the pillar
    // step or be retried here: the pillar card offers "Find topic ideas" instead.
    // Only the error code is logged, never message text.
    try {
      await deps.store.saveSubtopics?.(
        profile.id,
        subtopicGroups.map(g => ({ ...g, pillarHash: inputsHash }))
      );
    } catch (err) {
      const code = (err as { code?: unknown })?.code;
      console.warn("[personalization] pillar topics not saved; pillars kept", {
        code: typeof code === "string" ? code.slice(0, 60) : "error",
      });
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
  timeoutMs?: number;
}): Promise<RecommendationResult> {
  const { deps, evidence } = input;
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
    if (wrote === "applied") inserted += 1;
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
    if (wrote === "applied") inserted += 1;
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
    if (wrote === "applied") inserted += 1;
  }

  if (goalResult && goalResult.status === "needs_clarification" && inserted === 0) {
    return {
      status: "needs_clarification",
      question: goalResult.question,
      reason: goalResult.reason,
      usage: goalResult.usage,
    };
  }
  if (goalError && inserted === 0)
    return { status: "failed", kind: goalError.kind, usage: goalError.usage };
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

