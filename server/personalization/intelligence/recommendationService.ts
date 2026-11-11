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
import {
  loadPostImages,
  noPostImages,
  postImagesEnabled,
  postIndex,
  type PostContext,
  type PostImageLoader,
  type PostRef,
} from "./postVisuals";
import { GOAL_PROMPT_VERSION, inferGoal } from "./goalInference";
import {
  PILLAR_PROMPT_VERSION,
  recommendPillars,
} from "./pillarRecommendations";
import {
  detectContentLanguage,
  inferNicheLabel,
  isCatalogBucket,
  isPlaceholderNiche,
  NICHE_PROMPT_VERSION,
} from "./profileBasics";
import {
  IntelligenceError,
  type LlmInvoker,
  type LlmUsage,
} from "./structuredLlm";
import { subtopicSaveFailureFields } from "../subtopics";
import {
  enrichUnconfirmedPillars,
  type NicheExampleReader,
} from "./nicheEnrichment";

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
      reason: "insufficient_evidence" | "ambiguous" | "unverified";
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
  if (step === "goal") return stableHash(`goal|${PROMPT_VERSION.goal}|${evidence.hash}`);
  // Keep the upstream hash as a prefix so an evidence refresh is not treated as an edit.
  return `${upstreamInputsHash(STEP_KIND[step], items)}|${PROMPT_VERSION[step]}|${evidence.hash}`;
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

/** The creator's indexed posts plus whichever thumbnails could be loaded. Never throws. */
async function loadPostContext(posts: PostRef[], load: PostImageLoader): Promise<PostContext> {
  if (posts.length === 0) return { posts, images: [] };
  try {
    return { posts, images: await load(posts) };
  } catch {
    return { posts, images: [] };
  }
}

/** Counts only, no profile text. Shows how often post evidence and images are used. */
function logPostEvidence(step: string, ctx: PostContext, uncitedDropped: number): void {
  console.info("[personalization] post_evidence", {
    step,
    posts: ctx.posts.length,
    images: ctx.images.length,
    uncitedDropped,
  });
}

/** Parser reason only. Drops parenthetical evidence so logs stay free of profile text. */
export function safeValidationReason(message: string): string {
  const stripped = message.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim();
  if (!stripped || stripped.length > 140) return "validation_failed";
  if (/https?:|@\w/i.test(stripped)) return "validation_failed";
  return stripped;
}

/**
 * Whether the current niche inference should read this profile. Any bio, caption, or later user
 * answer is enough to ask. The model decides if a subject is there. An empty
 * profile is not sent. Word count is not a subject test.
 */
export function evidenceSupportsNiche(
  evidence: CreatorEvidence,
  userAnswer = ""
): boolean {
  if (userAnswer.trim()) return true;
  return evidence.snippets.some(
    item =>
      (item.source === "bio" ||
        item.source === "brand_description" ||
        item.source === "captions") &&
      item.text.trim().length > 0
  );
}

/**
 * Quantity only. Stops audience and pillar drafts before a goal exists.
 * A niche the creator picked or confirmed names the subject, so it is enough.
 */
function canDraftAudienceWithoutGoal(evidence: CreatorEvidence): boolean {
  if (evidence.strength === "none") return false;
  if (evidence.snippets.some(item => item.source === "niche")) return true;
  const bioWords = evidence.snippets
    .filter(item => item.source === "bio" || item.source === "brand_description")
    .reduce((sum, item) => sum + item.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const captions = evidence.snippets.filter(item => item.source === "captions").length;
  if (evidence.strength === "weak" && bioWords < 5 && captions < 3) return false;
  return true;
}

function confirmedGoalText(items: ItemRecord[]): string {
  return items
    .filter(item => item.kind === "goal" && item.status === "confirmed")
    .map(item => (item.payload as ItemPayloadByKind["goal"]).text.trim())
    .filter(Boolean)
    .join("\n");
}

/** An unconfirmed catalog bucket is not a finished specific niche. */
function freshSpecificNiche(items: ItemRecord[], inputsHash: string): boolean {
  const live = items.filter(
    item =>
      item.kind === "niche" &&
      item.status !== "superseded" &&
      item.status !== "dismissed"
  );
  return (
    live.length > 0 &&
    live.every(item => {
      const label = (item.payload as NichePayload).label;
      return (
        item.source === "ai_suggested" &&
        item.basedOnInputsHash === inputsHash &&
        !isCatalogBucket(label) &&
        !isPlaceholderNiche(label) &&
        (item.status === "suggested" || item.status === "confirmed")
      );
    })
  );
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

function nicheTextFor(items: ItemRecord[], profile: GenerationProfile): string {
  const niche = items.find(
    item =>
      item.kind === "niche" &&
      item.status !== "superseded" &&
      item.status !== "dismissed"
  );
  const label = niche ? (niche.payload as NichePayload).label.trim() : "";
  if (label) return label;
  return [profile.displayName, profile.bio]
    .filter(text => Boolean(text && text.trim()))
    .join(". ");
}

async function safeNicheEnrich(input: {
  deps: {
    store: RecommendationStore;
    invoker?: LlmInvoker;
    timeoutMs?: number;
    onRejected?: (reason: string) => void;
    nicheExamples?: { read: NicheExampleReader };
    /** Loads post thumbnails. Defaults to the server fetch. Tests pass a fake. */
    loadPostImages?: PostImageLoader;
  };
  profile: GenerationProfile;
  evidence: CreatorEvidence;
  inputsHash: string;
  confirmedGoal: string;
  confirmedAudiences: AudiencePayload[];
  excludeHandles: string[];
}): Promise<void> {
  const read = input.deps.nicheExamples?.read;
  if (!read) return;
  try {
    const items = await input.deps.store.loadItems(input.profile.id);
    await enrichUnconfirmedPillars({
      store: input.deps.store,
      read,
      profileId: input.profile.id,
      evidence: input.evidence,
      inputsHash: input.inputsHash,
      confirmedGoal: input.confirmedGoal,
      confirmedAudiences: input.confirmedAudiences,
      nicheText: nicheTextFor(items, input.profile),
      excludeHandles: input.excludeHandles,
      invoker: input.deps.invoker,
      timeoutMs: input.deps.timeoutMs,
      onRejected: input.deps.onRejected,
    });
  } catch (err) {
    console.warn("[personalization] niche_enrich_skipped", {
      code: err instanceof Error ? err.name : "error",
    });
  }
}

export async function generateRecommendations(
  deps: {
    store: RecommendationStore;
    invoker?: LlmInvoker;
    /** Evidence review model (ONBOARDING_CLAIM_SUPPORT). Tests pass a fake. */
    reviewInvoker?: LlmInvoker;
    timeoutMs?: number;
    onRejected?: (reason: string) => void;
    /** Read-only niche supply. Absent in tests. Never blocks the first write. */
    nicheExamples?: { read: NicheExampleReader };
    /** Loads post thumbnails. Defaults to the server fetch. Tests pass a fake. */
    loadPostImages?: PostImageLoader;
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
  // Loaded once, only when a model call is about to happen.
  const indexedPosts = postIndex(snapshot, snapshot?.profileEvidence ?? openEvidence);
  let postContextLoad: Promise<PostContext> | null = null;
  const postContext = () =>
    (postContextLoad ??= loadPostContext(
      indexedPosts,
      deps.loadPostImages ?? (postImagesEnabled() ? loadPostImages : noPostImages)
    ));

  // No confirmed goal and not enough profile evidence: ask, do not invent an audience or pillar.
  if (
    input.step !== "goal" &&
    goals.length === 0 &&
    !canDraftAudienceWithoutGoal(evidence)
  ) {
    return {
      status: "needs_clarification",
      reason: "insufficient_evidence",
      question:
        "In one sentence, why do you create content, and who are you hoping to reach?",
      usage: null,
    };
  }

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
      needNiche: !lockedByUser(items, "niche") && !freshSpecificNiche(items, inputsHash),
      needLanguage:
        !lockedByUser(items, "language") && !freshAiCovers(items, "language", inputsHash),
      noteSaved,
      fingerprintAtStart,
      timeoutMs: deps.timeoutMs,
      postContext,
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
    if (input.step === "pillars") {
      await safeNicheEnrich({
        deps,
        profile,
        evidence,
        inputsHash,
        confirmedGoal: goals.map(g => g.text).join(" "),
        confirmedAudiences: audiences,
        excludeHandles: snapshot?.handle ? [snapshot.handle] : [],
      });
    }
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
      const posts = await postContext();
      const r = await recommendAudiences({
        evidence,
        confirmedGoal: goals.map(g => g.text).join(" "),
        confirmedAudiences: audiences,
        posts,
        invoker: deps.invoker,
        reviewInvoker: deps.reviewInvoker,
        timeoutMs: deps.timeoutMs,
        onRejected: deps.onRejected,
      });
      logPostEvidence("audience", posts, r.uncitedDropped);
      usage = r.usage;
      attempts = r.attempts;
      confidence = r.confidence;
      suggestions = r.audiences.map(a => ({
        kind: "audience" as const,
        payload: {
          who: a.who,
          outcome: a.outcome,
          ...(a.problem ? { problem: a.problem } : {}),
        } satisfies AudiencePayload,
        evidence: "profile_inferred" as const,
        analysisRunId: null,
      }));
    } else {
      const posts = await postContext();
      const r = await recommendPillars({
        evidence,
        confirmedGoal: goals.map(g => g.text).join(" "),
        confirmedAudiences: audiences,
        confirmedPillars: confirmedOf(items, "pillar"),
        posts,
        invoker: deps.invoker,
        timeoutMs: deps.timeoutMs,
        onRejected: deps.onRejected,
      });
      logPostEvidence("pillars", posts, r.uncitedDropped);
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
  const append = appendSuggestionsEnabled();
  const supersedeIds = append
    ? [] // ONBOARDING_APPEND_SUGGESTIONS: suggestions already on screen stay.
    : idsToSupersedeOnRegeneration(items, "__none__", [kind]).filter(id => {
        const row = items.find(i => i.id === id);
        return row?.basedOnInputsHash !== inputsHash;
      });
  const inserts = append ? appendedInserts(kind, items, plan.insert) : plan.insert;
  const applied = await deps.store.applyGeneratedSuggestions(profile.id, {
    kind,
    guard: { type: "inputs_unchanged", expected: upstream },
    expectedVersion: versionAtStart,
    supersedeIds,
    inserts: inserts.map(i => ({ ...i, generationMeta: meta })),
  });
  if (applied === "stale") return { status: "stale_discarded", usage };
  if (applied === "applied" && inserts.length) noteSaved(input.step);
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
  if (input.step === "pillars" && applied === "applied") {
    await safeNicheEnrich({
      deps,
      profile,
      evidence,
      inputsHash,
      confirmedGoal: goals.map(g => g.text).join(" "),
      confirmedAudiences: audiences,
      excludeHandles: snapshot?.handle ? [snapshot.handle] : [],
    });
  }
  return {
    status: "generated",
    inserted: plan.insert.length,
    usage,
    confidence,
  };
}

/**
 * ONBOARDING_APPEND_SUGGESTIONS=on (off by default): when a step runs again
 * (for example after the creator's posts are analysed), audience and pillar
 * suggestions already on screen are kept and the new ones are ADDED after them,
 * up to APPEND_CAP live items. Exact duplicates are already skipped by
 * planAiSuggestionMerge. Before, the second pass superseded every unconfirmed
 * suggestion, so what the creator was reading disappeared.
 */
export function appendSuggestionsEnabled(): boolean {
  return process.env.ONBOARDING_APPEND_SUGGESTIONS === "on";
}

export const APPEND_CAP: Partial<Record<PersonalizationItemKind, number>> = { audience: 5, pillar: 7 };

const NEAR_DUP_STOP = new Set(
  "a an and are as at be by for from how in is it its of on or that the this to with your you who their them they".split(" ")
);

/** Content words of a suggestion's visible text, lightly stemmed. Pure. */
function suggestionWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]+/gu, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !NEAR_DUP_STOP.has(w))
      .map(w => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w))
  );
}

/** The text a creator sees for an audience (who) or a pillar (title). */
function visibleText(payload: unknown): string {
  const p = (payload ?? {}) as { who?: unknown; title?: unknown };
  return String(p.who ?? p.title ?? "");
}

/**
 * Near-duplicates: at least three quarters of the words of the shorter one are shared
 * ("Small business owners seeking growth" / "Small business owners seeking
 * more leads"). Not: "Restaurant owners" / "New restaurant founders". Pure; exported for tests.
 */
export function isNearDuplicate(a: string, b: string): boolean {
  const wa = suggestionWords(a);
  const wb = suggestionWords(b);
  if (wa.size === 0 || wb.size === 0) return false;
  let shared = 0;
  for (const w of wa) if (wb.has(w)) shared += 1;
  return shared / Math.min(wa.size, wb.size) >= 0.75;
}

/**
 * New suggestions that fit after the live ones (suggested or confirmed):
 * near-duplicates of what is already there (or of each other) are skipped,
 * then capped at APPEND_CAP. Pure; exported for tests.
 */
export function appendedInserts<T extends { payload?: unknown }>(
  kind: PersonalizationItemKind,
  items: readonly ItemRecord[],
  inserts: readonly T[]
): T[] {
  const cap = APPEND_CAP[kind];
  if (cap === undefined) return [...inserts];
  const liveItems = items.filter(i => i.kind === kind && (i.status === "suggested" || i.status === "confirmed"));
  const seen = liveItems.map(i => visibleText(i.payload));
  const fresh: T[] = [];
  for (const ins of inserts) {
    const text = visibleText(ins.payload);
    if (text && seen.some(t => isNearDuplicate(t, text))) continue;
    seen.push(text);
    fresh.push(ins);
  }
  return fresh.slice(0, Math.max(0, cap - liveItems.length));
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
    reviewInvoker?: LlmInvoker;
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
  postContext: () => Promise<PostContext>;
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
    const posts = await input.postContext();
    logPostEvidence("goal", posts, 0);
    return inferGoal({
      evidence,
      posts,
      invoker: deps.invoker,
      reviewInvoker: deps.reviewInvoker,
      timeoutMs: input.timeoutMs,
      onRejected: deps.onRejected,
    });
  })();

  const basicsTask = (async () => {
    const language = input.needLanguage
      ? detectContentLanguage(input.profileText)
      : null;
    let niche: NichePayload | null = null;
    let usage: LlmUsage | null = null;
    const userAnswer = confirmedGoalText(input.items);
    if (input.needNiche && evidenceSupportsNiche(evidence, userAnswer)) {
      const inferred = await inferNicheLabel({
        evidence,
        userAnswer,
        invoker: deps.invoker,
        timeoutMs: Math.min(input.timeoutMs ?? 12_000, 12_000),
      });
      usage = inferred.usage;
      const specific = inferred.niche;
      if (
        specific &&
        !isCatalogBucket(specific.label) &&
        !isPlaceholderNiche(specific.label)
      ) {
        niche = {
          label: specific.label,
          slug: specific.slug,
          ...(specific.categoryLabel ? { categoryLabel: specific.categoryLabel } : {}),
        };
      }
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
          payload: goalResult.starter ? { text: goalResult.goal, starter: true } : { text: goalResult.goal },
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
          payload: basics.niche satisfies NichePayload,
          evidence: "profile_inferred",
          analysisRunId: null,
        },
      ],
      inputsHash: input.inputsHash,
      versionAtStart: input.versionAtStart,
      confidence: "medium",
      evidence,
      promptVersion: NICHE_PROMPT_VERSION,
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

