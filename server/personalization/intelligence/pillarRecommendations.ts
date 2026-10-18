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

export const PILLAR_PROMPT_VERSION = "pillars-v1";
export const MIN_PILLARS = 3;
export const MAX_PILLARS = 5;

export type PillarResult = {
  status: "suggested";
  pillars: PillarPayload[];
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
        properties: { title: { type: "string" }, serves: { type: "string" } },
        required: ["title", "serves"],
        additionalProperties: false,
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["pillars", "confidence"],
  additionalProperties: false,
};

const Shape = z.object({
  pillars: z.array(z.object({ title: z.string(), serves: z.string() })),
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
    "A pillar is a recurring theme the creator should make videos about BECAUSE it serves their confirmed goal and audience.",
    "Past posting topics are context only. Do not just relabel what they posted before.",
    "Rules:",
    `- Between ${MIN_PILLARS} and ${MAX_PILLARS} distinct pillars, not counting pillars the user already confirmed.`,
    "- title: 1 to 4 words. serves: one sentence (max 20 words) saying how it serves the goal and the audience.",
    '- No numbers, percentages, view counts or claims about past performance (no "viral", "best performing").',
    "- Do not invent facts, names or products about the creator.",
    `- Write in ${e.outputLanguage.label}.`,
  ].join("\n");
  const user = [
    `Confirmed goal (trusted): ${JSON.stringify(goal)}`,
    `Confirmed audiences (trusted): ${JSON.stringify(audiences.map(a => (a.outcome ? `${a.who}, who want to ${a.outcome}` : a.who)))}`,
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
): ParseResult<{ pillars: PillarPayload[]; confidence: SuggestionConfidence }> {
  const shape = Shape.safeParse(raw);
  if (!shape.success)
    return { ok: false, reason: "output did not match the schema" };
  const corpus = `${e.corpus}\n${goal.toLowerCase()}\n${audiences
    .map(a => `${a.who} ${a.outcome}`)
    .join(" ")
    .toLowerCase()}`;
  const seen = new Set(keep.map(p => itemIdentity("pillar", p)));
  const out: PillarPayload[] = [];
  for (const p of shape.data.pillars) {
    const title = sanitizeCopy(p.title).replace(/\.$/, "");
    const description = sanitizeCopy(p.serves);
    if (!title || wordCount(title) > 5 || title.length > 45)
      return { ok: false, reason: "a pillar title is empty or too long" };
    if (!description || wordCount(description) > 26)
      return { ok: false, reason: "a pillar explanation is empty or too long" };
    if (claimsPerformance(`${title} ${description}`))
      return {
        ok: false,
        reason: "pillars must not claim performance or use percentages",
      };
    const nums = unsupportedNumbers(`${title} ${description}`, corpus);
    if (nums.length)
      return {
        ok: false,
        reason: `pillar contains numbers not in the evidence (${nums.join(", ")})`,
      };
    const names = unsupportedProperNouns(`${title}. ${description}`, corpus);
    if (names.length)
      return {
        ok: false,
        reason: `pillar names things not in the evidence (${names.join(", ")})`,
      };
    const key = itemIdentity("pillar", {
      title,
      description,
      viewSharePercent: null,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, description, viewSharePercent: null });
  }
  const needed = Math.max(0, MIN_PILLARS - keep.length);
  if (out.length < Math.min(needed, MIN_PILLARS))
    return {
      ok: false,
      reason: `need at least ${needed} new distinct pillars`,
    };
  return {
    ok: true,
    value: {
      pillars: out.slice(0, MAX_PILLARS),
      confidence: shape.data.confidence,
    },
  };
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
    maxTokens: 700,
  });
  return {
    status: "suggested",
    pillars: value.pillars,
    confidence: value.confidence,
    usedHistoricalContext: input.evidence.topCaptions.length > 0,
    usage,
    attempts,
  };
}
