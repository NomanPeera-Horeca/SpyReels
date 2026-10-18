/**
 * Step 4b "Who you want to reach": INTENDED audiences that serve the
 * confirmed goal. Not the current viewers: public data has no audience
 * demographics, so observed audience is reported as unavailable rather than
 * guessed. A few useful segments, never a long list. No demographic
 * attributes unless the evidence or the user's own answers mention them.
 */
import { z } from "zod";
import type {
  AudiencePayload,
  SuggestionConfidence,
} from "@shared/personalization/model";
import { itemIdentity } from "@shared/personalization/state";
import {
  evidenceBlock,
  UNTRUSTED_DATA_RULE,
  type CreatorEvidence,
} from "./evidence";
import {
  sanitizeCopy,
  unsupportedDemographics,
  unsupportedNumbers,
  unsupportedProperNouns,
} from "./guards";
import {
  callStructured,
  type LlmInvoker,
  type LlmUsage,
  type ParseResult,
} from "./structuredLlm";

export const AUDIENCE_PROMPT_VERSION = "audience-v1";
export const MAX_AUDIENCES = 3;

export type AudienceRecommendation = AudiencePayload & { why: string };

export type AudienceResult = {
  status: "suggested";
  audiences: AudienceRecommendation[];
  confidence: SuggestionConfidence;
  /** Public profile data does not include who actually watches. Never guessed. */
  observedAudience: null;
  usage: LlmUsage;
  attempts: number;
};

const SCHEMA = {
  type: "object",
  properties: {
    audiences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          who: { type: "string" },
          outcome: { type: "string" },
          why: { type: "string" },
        },
        required: ["who", "outcome", "why"],
        additionalProperties: false,
      },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["audiences", "confidence"],
  additionalProperties: false,
};

const Shape = z.object({
  audiences: z.array(
    z.object({ who: z.string(), outcome: z.string(), why: z.string() })
  ),
  confidence: z.enum(["high", "medium", "low"]),
});

export function buildAudiencePrompt(
  e: CreatorEvidence,
  goal: string,
  keep: AudiencePayload[]
) {
  const system = [
    "You recommend who a short-form video creator should try to reach.",
    UNTRUSTED_DATA_RULE,
    "Recommend INTENDED audiences who help the creator achieve their confirmed goal. Do not assume their current viewers are the right audience.",
    "Rules:",
    `- Between 1 and ${MAX_AUDIENCES} distinct segments. Fewer, more useful segments beat many.`,
    "- who: a short noun phrase (max 8 words). outcome: what this audience wants to achieve (max 10 words). why: one short sentence on how this audience serves the goal.",
    "- Do not add age, gender, ethnicity, religion, family role or orientation unless the evidence or goal mentions it.",
    "- Do not invent names, numbers or facts about the creator.",
    "- Do not repeat audiences the user already confirmed.",
    `- Write in ${e.outputLanguage.label}.`,
  ].join("\n");
  const user = [
    `Confirmed goal (written by the user, trusted): ${JSON.stringify(goal)}`,
    `Already confirmed audiences: ${JSON.stringify(keep.map(a => a.who))}`,
    evidenceBlock(e),
    "Return the JSON object.",
  ].join("\n");
  return { system, user };
}

export function parseAudienceOutput(
  raw: unknown,
  e: CreatorEvidence,
  goal: string,
  keep: AudiencePayload[]
): ParseResult<{
  audiences: AudienceRecommendation[];
  confidence: SuggestionConfidence;
}> {
  const shape = Shape.safeParse(raw);
  if (!shape.success)
    return { ok: false, reason: "output did not match the schema" };
  const corpus = `${e.corpus}\n${goal.toLowerCase()}`;
  const seen = new Set(keep.map(a => itemIdentity("audience", a)));
  const out: AudienceRecommendation[] = [];
  for (const a of shape.data.audiences) {
    const who = sanitizeCopy(a.who);
    const outcome = sanitizeCopy(a.outcome).replace(/\.$/, "");
    const why = sanitizeCopy(a.why);
    if (
      !who ||
      who.length > 70 ||
      !outcome ||
      outcome.length > 90 ||
      why.length > 180
    ) {
      return { ok: false, reason: "an audience is empty or too long" };
    }
    const text = `${who} ${outcome} ${why}`;
    const demo = unsupportedDemographics(text, corpus);
    if (demo.length)
      return {
        ok: false,
        reason: `audience assumes demographics not in the evidence (${demo.join(", ")})`,
      };
    const nums = unsupportedNumbers(text, corpus);
    if (nums.length)
      return {
        ok: false,
        reason: `audience contains numbers not in the evidence (${nums.join(", ")})`,
      };
    const names = unsupportedProperNouns(`${who}. ${outcome}.`, corpus);
    if (names.length)
      return {
        ok: false,
        reason: `audience names things not in the evidence (${names.join(", ")})`,
      };
    const key = itemIdentity("audience", { who, outcome });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ who, outcome, why });
  }
  if (out.length === 0 && keep.length === 0)
    return { ok: false, reason: "no usable audience" };
  return {
    ok: true,
    value: {
      audiences: out.slice(0, MAX_AUDIENCES),
      confidence: shape.data.confidence,
    },
  };
}

export async function recommendAudiences(input: {
  evidence: CreatorEvidence;
  confirmedGoal: string;
  confirmedAudiences: AudiencePayload[];
  invoker?: LlmInvoker;
  timeoutMs?: number;
  onRejected?: (reason: string) => void;
}): Promise<AudienceResult> {
  const prompt = buildAudiencePrompt(
    input.evidence,
    input.confirmedGoal,
    input.confirmedAudiences
  );
  const { value, usage, attempts } = await callStructured({
    operation: "personalization_audience_recommendations",
    system: prompt.system,
    user: prompt.user,
    schemaName: "intended_audiences",
    schema: SCHEMA,
    parse: raw =>
      parseAudienceOutput(
        raw,
        input.evidence,
        input.confirmedGoal,
        input.confirmedAudiences
      ),
    invoker: input.invoker,
    timeoutMs: input.timeoutMs,
    onRejected: input.onRejected,
    maxTokens: 600,
  });
  return {
    status: "suggested",
    audiences: value.audiences,
    confidence: value.confidence,
    observedAudience: null,
    usage,
    attempts,
  };
}
