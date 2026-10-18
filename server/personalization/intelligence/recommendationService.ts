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
 * Wiring: not connected yet. It will run as a durable job keyed by
 * recommendationJobKey() once the tables exist.
 */
import type {
  AnalysisSourceSnapshot,
  AudiencePayload,
  GenerationMeta,
  ItemPayloadByKind,
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
      supersedeIds: string[];
      inserts: GeneratedInsert[];
    }
  ): Promise<"applied" | "stale">;
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
  if (input.step === "goal" && goals.length > 0)
    return { status: "already_confirmed" };
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
  try {
    if (input.step === "goal") {
      const r = await inferGoal({
        evidence,
        invoker: deps.invoker,
        timeoutMs: deps.timeoutMs,
        onRejected: deps.onRejected,
      });
      if (r.status === "needs_clarification") {
        return {
          status: "needs_clarification",
          question: r.question,
          reason: r.reason,
          usage: r.usage,
        };
      }
      usage = r.usage;
      attempts = r.attempts;
      confidence = r.confidence;
      suggestions = [
        {
          kind: "goal",
          payload: { text: r.goal },
          evidence: "profile_inferred",
          analysisRunId: null,
        },
      ];
    } else if (input.step === "audience") {
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
  const version = await deps.store.loadPersonalizationVersion(profile.id);
  const plan = planAiSuggestionMerge(
    items,
    suggestions.map(s => ({ ...s, basedOnInputsHash: inputsHash, confidence })),
    version,
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
    guard:
      input.step === "goal"
        ? { type: "no_confirmed" }
        : { type: "inputs_unchanged", expected: inputsHash },
    supersedeIds,
    inserts: plan.insert.map(i => ({ ...i, generationMeta: meta })),
  });
  if (applied === "stale") return { status: "stale_discarded", usage };
  return {
    status: "generated",
    inserted: plan.insert.length,
    usage,
    confidence,
  };
}
