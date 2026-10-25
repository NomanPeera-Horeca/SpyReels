/**
 * Step 4c "What you'll create": STRATEGIC content pillars built from the
 * confirmed goal and audiences, with account and niche context. Historical
 * top posts are passed as context only when enough posts have real view
 * counts, and the model is told not to copy past categories.
 *
 * Recommended pillars never carry numbers: viewSharePercent is always null
 * here and any performance claim ("viral", "%", "best performing") is
 * rejected. Measured view shares are a separate, deterministic feature.
 */
import { z } from "zod";
import type {
  AudiencePayload,
  PillarPayload,
  SuggestionConfidence,
} from "@shared/personalization/model";
import { itemIdentity } from "@shared/personalization/state";
import {
  evidenceBlock,
  UNTRUSTED_DATA_RULE,
  type CreatorEvidence,
} from "./evidence";
import {
  claimsPerformance,
  commercialIntentAllowed,
  copiesSourceText,
  inventsCommercialObjective,
  inventsMonetization,
  isGenericPillarTitle,
  sanitizeCopy,
  unsupportedNumbers,
  unsupportedProperNouns,
  wordCount,
} from "./guards";
import {
  callStructured,
  type LlmInvoker,
  type LlmUsage,
  type ParseResult,
} from "./structuredLlm";

export const PILLAR_PROMPT_VERSION = "pillars-v2";
export const MIN_PILLARS = 3;
export const MAX_PILLARS = 5;

export type PillarResult = {
  status: "suggested";
  pillars: PillarPayload[];
  /** Subtopics aligned with `pillars` (empty when the model omitted them). */
  subtopics: string[][];
  confidence: SuggestionConfidence;
  usedHistoricalContext: boolean;
  usage: LlmUsage;
  attempts: number;
};

const SCHEMA = {
  type: "object",
  properties: {
    pillars: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          serves: { type: "string" },
          subtopics: { type: "array", items: { type: "string" } },
        },
        required: ["title", "serves", "subtopics"],
        additionalProperties: false,
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["pillars", "confidence"],
  additionalProperties: false,
};

const Shape = z.object({
  pillars: z.array(
    z.object({
      title: z.string(),
      serves: z.string(),
      subtopics: z.array(z.string()).optional(),
    })
  ),
  confidence: z.enum(["high", "medium", "low"]),
});

export function buildPillarPrompt(
  e: CreatorEvidence,
  goal: string,
  audiences: AudiencePayload[],
  keep: PillarPayload[]
) {
  const system = [
    "You design strategic content pillars for a short-form video creator.",
    UNTRUSTED_DATA_RULE,
    "A pillar is a recurring theme the creator should make videos about. Use the confirmed goal and audience when they exist. When they do not, use the profile evidence and do not invent a goal.",
    "Past posting topics are context only. Do not just relabel what they posted before.",
    "Rules:",
    `- Between ${MIN_PILLARS} and ${MAX_PILLARS} distinct pillars, not counting pillars the user already confirmed.`,
    "- title: 1 to 4 words. serves: one sentence (max 20 words) saying how it serves the goal and the audience.",
    "- subtopics: 3 short video topics under that pillar (2 to 4 words each). Specific themes, not a copy of the bio.",
    '- No numbers, percentages, view counts or claims about past performance (no "viral", "best performing").',
    "- Do not invent facts, names or products about the creator.",
    "- Do not add a pillar about products, affiliates, shopping, or monetization unless the evidence or the confirmed goal shows the creator sells that offer.",
    "- Each title names the creator's subject. Do not use a title made only of generic words such as Daily Life, Content, Moments, or Tips.",
    "- Do not add a pillar the evidence does not support.",
    `- Write in ${e.outputLanguage.label}.`,
  ].join("\n");
  const user = [
    goal.trim()
      ? `Confirmed goal (trusted): ${JSON.stringify(goal)}`
      : "No goal is confirmed yet.",
    audiences.length
      ? `Confirmed audiences (trusted): ${JSON.stringify(audiences.map(a => (a.outcome ? `${a.who}, who want to ${a.outcome}` : a.who)))}`
      : "No audience is confirmed yet.",
    `Already confirmed pillars: ${JSON.stringify(keep.map(p => p.title))}`,
    e.topCaptions.length
      ? `Topics of their strongest past posts (context only, untrusted):\n<creator_evidence>${JSON.stringify(e.topCaptions)}</creator_evidence>`
      : "No reliable performance history is available.",
    evidenceBlock(e),
    "Return the JSON object.",
  ].join("\n");
  return { system, user };
}

export function parsePillarOutput(
  raw: unknown,
  e: CreatorEvidence,
  goal: string,
  audiences: AudiencePayload[],
  keep: PillarPayload[]
): ParseResult<{
  pillars: PillarPayload[];
  subtopics: string[][];
  confidence: SuggestionConfidence;
}> {
  const shape = Shape.safeParse(raw);
  if (!shape.success)
    return { ok: false, reason: "output did not match the schema" };
  const corpus = `${e.corpus}\n${goal.toLowerCase()}\n${audiences
    .map(a => `${a.who} ${a.outcome}`)
    .join(" ")
    .toLowerCase()}`;
  const seen = new Set(keep.map(p => itemIdentity("pillar", p)));
  const out: PillarPayload[] = [];
  const subtopics: string[][] = [];
  let droppedFor: string | null = null;
  for (const p of shape.data.pillars) {
    const title = sanitizeCopy(p.title).replace(/\.$/, "");
    const description = sanitizeCopy(p.serves);
    // One bad pillar is dropped. The rest of the batch can still be saved.
    if (!title || wordCount(title) > 5 || title.length > 45) {
      droppedFor = "a pillar title is empty or too long";
      continue;
    }
    if (!description || wordCount(description) > 26) {
      droppedFor = "a pillar explanation is empty or too long";
      continue;
    }
    if (copiesSourceText(description, e.declaredText)) {
      droppedFor = "a pillar copies the biography";
      continue;
    }
    if (claimsPerformance(`${title} ${description}`)) {
      droppedFor = "pillars must not claim performance or use percentages";
      continue;
    }
    if (isGenericPillarTitle(title)) {
      droppedFor = "a pillar title does not name a subject";
      continue;
    }
    const allowed = commercialIntentAllowed(goal, e.commercialSignals);
    if (
      inventsCommercialObjective(`${title} ${description}`, allowed) ||
      inventsMonetization(`${title} ${description}`, allowed)
    ) {
      droppedFor = "a pillar assumes a business or product offer the evidence does not show";
      continue;
    }
    if (unsupportedNumbers(`${title} ${description}`, corpus).length) {
      droppedFor = "a pillar contains numbers that are not in the evidence";
      continue;
    }
    if (unsupportedProperNouns(`${titleCaseAsWords(title)}. ${description}`, corpus).length) {
      droppedFor = "a pillar names things that are not in the evidence";
      continue;
    }
    const key = itemIdentity("pillar", {
      title,
      description,
      viewSharePercent: null,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, description, viewSharePercent: null });
    subtopics.push(cleanSubtopics(p.subtopics, corpus));
  }
  const needed = Math.max(0, MIN_PILLARS - keep.length);
  if (needed > 0 && out.length === 0)
    return {
      ok: false,
      reason: droppedFor ?? "no usable pillars in the model output",
    };
  const capped = out.slice(0, MAX_PILLARS);
  return {
    ok: true,
    value: {
      pillars: capped,
      subtopics: subtopics.slice(0, capped.length),
      confidence: shape.data.confidence,
    },
  };
}

/**
 * Short titles are written in Title Case. That is not a proper noun.
 * A word with an internal capital, such as a brand, is left unchanged.
 */
function titleCaseAsWords(title: string): string {
  return title
    .split(/\s+/)
    .map(word => {
      if (word.length < 2) return word;
      const rest = word.slice(1);
      if (rest !== rest.toLowerCase()) return word;
      return `${word.charAt(0).toLowerCase()}${rest}`;
    })
    .join(" ");
}

function cleanSubtopics(raw: string[] | undefined, corpus: string): string[] {
  const out: string[] = [];
  for (const s of raw ?? []) {
    const label = sanitizeCopy(s).replace(/\.$/, "");
    if (!label || wordCount(label) > 4 || label.length > 40) continue;
    if (claimsPerformance(label)) continue;
    if (unsupportedNumbers(label, corpus).length) continue;
    if (unsupportedProperNouns(label, corpus).length) continue;
    if (out.some(x => x.toLowerCase() === label.toLowerCase())) continue;
    out.push(label);
    if (out.length === 4) break;
  }
  return out;
}

export async function recommendPillars(input: {
  evidence: CreatorEvidence;
  confirmedGoal: string;
  confirmedAudiences: AudiencePayload[];
  confirmedPillars: PillarPayload[];
  invoker?: LlmInvoker;
  timeoutMs?: number;
  onRejected?: (reason: string) => void;
}): Promise<PillarResult> {
  const prompt = buildPillarPrompt(
    input.evidence,
    input.confirmedGoal,
    input.confirmedAudiences,
    input.confirmedPillars
  );
  const { value, usage, attempts } = await callStructured({
    operation: "personalization_pillar_recommendations",
    system: prompt.system,
    user: prompt.user,
    schemaName: "content_pillars",
    schema: SCHEMA,
    parse: raw =>
      parsePillarOutput(
        raw,
        input.evidence,
        input.confirmedGoal,
        input.confirmedAudiences,
        input.confirmedPillars
      ),
    invoker: input.invoker,
    timeoutMs: input.timeoutMs,
    onRejected: input.onRejected,
    maxTokens: 900,
  });
  return {
    status: "suggested",
    pillars: value.pillars,
    subtopics: value.subtopics,
    confidence: value.confidence,
    usedHistoricalContext: input.evidence.topCaptions.length > 0,
    usage,
    attempts,
  };
}

const SUBTOPIC_SCHEMA = {
  type: "object",
  properties: {
    pillars: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          subtopics: { type: "array", items: { type: "string" } },
        },
        required: ["title", "subtopics"],
        additionalProperties: false,
      },
    },
  },
  required: ["pillars"],
  additionalProperties: false,
};

/** One short call to fill subtopics for pillars that were saved without any. */
export async function recommendSubtopics(input: {
  evidence: CreatorEvidence;
  confirmedGoal: string;
  pillars: { title: string; description: string }[];
  invoker?: LlmInvoker;
  timeoutMs?: number;
}): Promise<{ groups: { title: string; labels: string[] }[]; usage: LlmUsage }> {
  const { value, usage } = await callStructured({
    operation: "personalization_pillar_subtopics",
    system: [
      "You name short video subtopics for content pillars a creator already has.",
      "Each subtopic is 2 to 4 words. Specific themes a video could cover.",
      "No numbers, no performance claims, and do not copy the biography.",
      UNTRUSTED_DATA_RULE,
    ].join("\n"),
    user: [
      `Goal: ${input.confirmedGoal}`,
      ...input.pillars.map(p => `Pillar: ${p.title}. ${p.description}`),
      "Return 3 subtopics for each pillar.",
    ].join("\n"),
    schemaName: "pillar_subtopics",
    schema: SUBTOPIC_SCHEMA,
    parse: raw => {
      const shape = z
        .object({
          pillars: z.array(
            z.object({ title: z.string(), subtopics: z.array(z.string()) })
          ),
        })
        .safeParse(raw);
      if (!shape.success)
        return { ok: false as const, reason: "output did not match the schema" };
      return {
        ok: true as const,
        value: shape.data.pillars.map(p => ({
          title: sanitizeCopy(p.title),
          labels: cleanSubtopics(p.subtopics, input.evidence.corpus),
        })),
      };
    },
    invoker: input.invoker,
    timeoutMs: input.timeoutMs ?? 12_000,
    maxTokens: 500,
  });
  return { groups: value, usage };
}
