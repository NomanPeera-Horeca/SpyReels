/**
 * Second pass for pillars. The first pass has already been saved.
 * This replaces only unconfirmed AI pillars, and only when qualified niche
 * examples exist. A confirmed pillar is left as the user saved it.
 * Subtopic writes go through the existing store, which checks migrations
 * 0104 and 0105 before inserting.
 */
import type { AudiencePayload, GenerationMeta, PillarPayload } from "@shared/personalization/model";
import {
  planAiSuggestionMerge,
  upstreamInputsHash,
  type ItemRecord,
} from "@shared/personalization/state";
import type { RecommendationStore } from "./recommendationService";
import type { CreatorEvidence } from "./evidence";
import {
  MIN_PILLARS,
  PILLAR_PROMPT_VERSION,
  recommendPillars,
  type PillarNicheExample,
} from "./pillarRecommendations";
import { subtopicSaveFailureFields } from "../subtopics";
import { IntelligenceError, type LlmInvoker } from "./structuredLlm";

export type NicheExampleReader = (input: {
  nicheText: string;
  pillarTitles: string[];
  excludeHandles: string[];
}) => Promise<PillarNicheExample[]>;

const NICHE_BASIS = "niche_examples";
const ENRICH_MODEL_TIMEOUT_MS = 12_000;

function suggestedPillars(items: ItemRecord[]): ItemRecord[] {
  return items.filter(
    item =>
      item.kind === "pillar" &&
      item.status === "suggested" &&
      item.source === "ai_suggested"
  );
}

export function unconfirmedPillarsNeedNichePass(items: ItemRecord[]): boolean {
  const suggested = suggestedPillars(items);
  if (suggested.length === 0) return false;
  return suggested.some(
    item => !item.generationMeta?.evidenceBasis?.includes(NICHE_BASIS)
  );
}

export async function enrichUnconfirmedPillars(input: {
  store: RecommendationStore;
  read: NicheExampleReader;
  profileId: string;
  evidence: CreatorEvidence;
  inputsHash: string;
  confirmedGoal: string;
  confirmedAudiences: AudiencePayload[];
  nicheText: string;
  excludeHandles: string[];
  invoker?: LlmInvoker;
  timeoutMs?: number;
  onRejected?: (reason: string) => void;
}): Promise<"enriched" | "skipped" | "failed"> {
  const nicheText = input.nicheText.trim();
  if (!nicheText) return "skipped";
  const before = await input.store.loadItems(input.profileId);
  if (!unconfirmedPillarsNeedNichePass(before)) return "skipped";
  const versionBefore = await input.store.loadPersonalizationVersion(input.profileId);
  let examples: PillarNicheExample[] = [];
  try {
    examples = await input.read({
      nicheText,
      pillarTitles: before
        .filter(item => item.kind === "pillar" && item.status !== "superseded" && item.status !== "dismissed")
        .map(item => (item.payload as PillarPayload).title),
      excludeHandles: input.excludeHandles,
    });
  } catch {
    return "skipped";
  }
  if (examples.length === 0) return "skipped";

  const confirmed = before
    .filter(item => item.kind === "pillar" && item.status === "confirmed")
    .map(item => item.payload as PillarPayload);
  let generated;
  try {
    generated = await recommendPillars({
      evidence: input.evidence,
      confirmedGoal: input.confirmedGoal,
      confirmedAudiences: input.confirmedAudiences,
      confirmedPillars: confirmed,
      nicheExamples: examples,
      invoker: input.invoker,
      timeoutMs: Math.min(input.timeoutMs ?? ENRICH_MODEL_TIMEOUT_MS, ENRICH_MODEL_TIMEOUT_MS),
      onRejected: input.onRejected,
    });
  } catch (err) {
    if (err instanceof IntelligenceError) return "failed";
    throw err;
  }
  if (generated.pillars.length === 0) return "skipped";

  const versionAfter = await input.store.loadPersonalizationVersion(input.profileId);
  if (versionAfter !== versionBefore) return "skipped";
  const fresh = await input.store.loadItems(input.profileId);
  if (!unconfirmedPillarsNeedNichePass(fresh)) return "skipped";
  const confirmedNow = fresh.filter(item => item.kind === "pillar" && item.status === "confirmed").length;
  const suggestedNow = suggestedPillars(fresh);

  const supersedeIds = suggestedNow.map(item => item.id);
  const shadow = fresh.map(item =>
    supersedeIds.includes(item.id) ? { ...item, status: "superseded" as const } : item
  );
  const meta: GenerationMeta = {
    promptVersion: PILLAR_PROMPT_VERSION,
    model: generated.usage.model,
    inputTokens: generated.usage.inputTokens,
    outputTokens: generated.usage.outputTokens,
    estimatedUsd: generated.usage.estimatedUsd,
    attempts: generated.attempts,
    evidenceStrength: input.evidence.strength,
    evidenceBasis: [...input.evidence.sources, NICHE_BASIS],
  };
  const plan = planAiSuggestionMerge(
    shadow,
    generated.pillars.map(pillar => ({
      kind: "pillar" as const,
      payload: pillar,
      evidence: "profile_inferred" as const,
      analysisRunId: null,
      basedOnInputsHash: input.inputsHash,
      confidence: generated.confidence,
    })),
    versionAfter,
    "unavailable"
  );
  if (plan.insert.length === 0) return "skipped";
  const liveAfter = plan.insert.length + confirmedNow;
  const liveBefore = suggestedNow.length + confirmedNow;
  if (liveAfter < MIN_PILLARS && liveAfter < liveBefore) return "skipped";
  const applied = await input.store.applyGeneratedSuggestions(input.profileId, {
    kind: "pillar",
    guard: {
      type: "inputs_unchanged",
      expected: upstreamInputsHash("pillar", fresh),
    },
    expectedVersion: versionBefore,
    supersedeIds,
    inserts: plan.insert.map(row => ({ ...row, generationMeta: meta })),
  });
  if (applied !== "applied") return "skipped";
  try {
    await input.store.saveSubtopics?.(
      input.profileId,
      generated.pillars.map((pillar, index) => ({
        title: pillar.title,
        labels: generated.subtopics[index] ?? [],
        pillarHash: input.inputsHash,
      }))
    );
  } catch (err) {
    console.warn(
      "[personalization] niche pillar topics not saved; pillars kept",
      subtopicSaveFailureFields(err)
    );
  }
  console.info("[personalization] niche_enrich", {
    examples: examples.length,
    inserted: plan.insert.length,
  });
  return "enriched";
}
