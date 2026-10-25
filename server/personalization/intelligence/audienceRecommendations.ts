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
  wordCount,
} from "./guards";
import {
  callStructured,
  type LlmInvoker,
  type LlmUsage,
  type ParseResult,
} from "./structuredLlm";

export const AUDIENCE_PROMPT_VERSION = "audience-v2";
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
          problem: { type: "string" },
          outcome: { type: "string" },
          why: { type: "string" },
        },
        required: ["who", "problem", "outcome", "why"],
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
    z.object({
      who: z.string(),
      problem: z.string().optional(),
      outcome: z.string(),
      why: z.string(),
    })
  ),
  confidence: z.enum(["high", "medium", "low"]),
});

const PROBLEM_STOP = new Set([
  "about",
  "after",
  "also",
  "and",
  "are",
  "because",
  "before",
  "but",
  "can",
  "does",
  "from",
  "have",
  "into",
  "just",
  "more",
  "need",
  "over",
  "than",
  "that",
  "their",
  "them",
  "they",
  "this",
  "very",
  "want",
  "when",
  "with",
  "your",
]);

const GENERIC_PROBLEM_WORDS = new Set([
  "account",
  "audience",
  "best",
  "better",
  "brand",
  "brands",
  "business",
  "businesses",
  "client",
  "clients",
  "company",
  "companies",
  "content",
  "creator",
  "creators",
  "customer",
  "customers",
  "easy",
  "every",
  "everyone",
  "first",
  "followers",
  "getting",
  "good",
  "growth",
  "hard",
  "help",
  "life",
  "like",
  "looking",
  "make",
  "many",
  "media",
  "money",
  "most",
  "much",
  "next",
  "online",
  "owner",
  "owners",
  "people",
  "person",
  "post",
  "posts",
  "product",
  "products",
  "really",
  "right",
  "service",
  "services",
  "simple",
  "social",
  "some",
  "someone",
  "something",
  "start",
  "thing",
  "things",
  "time",
  "today",
  "trying",
  "user",
  "users",
  "using",
  "video",
  "videos",
  "work",
  "world",
]);

const MIN_SPECIFIC_PROBLEM_MATCHES = 2;

function wholeWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z]{4,}/g) ?? [];
}

function wordForms(token: string): string[] {
  if (token.endsWith("s") && token.length > 4) return [token, token.slice(0, -1)];
  return [token, `${token}s`];
}

/**
 * A problem needs two specific whole words that already appear in the evidence
 * or the goal. One shared word, a generic word such as "owners", or a
 * substring of a longer word is not support. Callers omit an unsupported
 * problem and keep the segment and outcome.
 */
export function problemSupportedByEvidence(problem: string, corpus: string): boolean {
  const hay = new Set(wholeWords(corpus));
  const tokens = wholeWords(problem).filter(
    token => !PROBLEM_STOP.has(token) && !GENERIC_PROBLEM_WORDS.has(token)
  );
  const matched = new Set<string>();
  for (const token of tokens) {
    const hit = wordForms(token).find(
      form => hay.has(form) && !GENERIC_PROBLEM_WORDS.has(form) && !PROBLEM_STOP.has(form)
    );
    if (hit) matched.add(hit);
  }
  return matched.size >= MIN_SPECIFIC_PROBLEM_MATCHES;
}

export function buildAudiencePrompt(
  e: CreatorEvidence,
  goal: string,
  keep: AudiencePayload[]
) {
  const system = [
    "You recommend who a short-form video creator should try to reach.",
    UNTRUSTED_DATA_RULE,
    "Recommend INTENDED audiences who help the creator achieve their confirmed goal when one exists. When no goal is confirmed, use the profile evidence. Do not assume their current viewers are the right audience.",
    "Rules:",
    `- Between 1 and ${MAX_AUDIENCES} distinct segments. Fewer, more useful segments beat many.`,
    "- who: a short noun phrase (max 8 words). problem: the obstacle this segment has (max 12 words), or empty when the evidence does not show one. outcome: what they want instead (max 10 words). why: one short sentence on how this audience serves the goal.",
    "- Do not add age, gender, ethnicity, religion, family role or orientation unless the evidence or goal mentions it.",
    "- Do not invent names, numbers or facts about the creator.",
    "- Do not repeat audiences the user already confirmed.",
    `- Write in ${e.outputLanguage.label}.`,
  ].join("\n");
  const user = [
    goal.trim()
      ? `Confirmed goal (written by the user, trusted): ${JSON.stringify(goal)}`
      : "No goal is confirmed yet. Use the profile evidence. Do not invent a business objective.",
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
    const problem = sanitizeCopy(a.problem ?? "").replace(/\.$/, "");
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
    if (problem && (problem.length > 120 || wordCount(problem) > 16)) {
      return { ok: false, reason: "an audience problem is too long" };
    }
    const text = `${who} ${problem} ${outcome} ${why}`;
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
    const problemNames = problem ? unsupportedProperNouns(`${problem}.`, corpus) : [];
    const supportedProblem =
      problem && problemNames.length === 0 && problemSupportedByEvidence(problem, corpus)
        ? problem
        : "";
    const key = itemIdentity("audience", { who, outcome });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ who, outcome, why, ...(supportedProblem ? { problem: supportedProblem } : {}) });
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
