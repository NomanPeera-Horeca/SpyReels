/**
 * Step 4a "Why you create": infer the creator's PURPOSE, not a summary of
 * their posts. One short sentence, starting with a verb.
 *
 * Never invents a business objective: a commercial goal needs commercial
 * evidence. With no evidence it does not call the model and asks the user.
 * With weak evidence and low model confidence it also asks the user.
 */
import { z } from "zod";
import type { SuggestionConfidence } from "@shared/personalization/model";
import {
  evidenceBlock,
  offerQuoteIsVerbatim,
  UNTRUSTED_DATA_RULE,
  type CreatorEvidence,
  type EvidenceSource,
} from "./evidence";
import {
  copiesSourceText,
  inventsCommercialObjective,
  isSingleSentence,
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

export const GOAL_PROMPT_VERSION = "goal-v2";
export const DEFAULT_CLARIFYING_QUESTION =
  "In one sentence, why do you create content? For example: to grow your business, teach a skill, or entertain people.";

export type GoalInference =
  | {
      status: "suggested";
      goal: string;
      confidence: SuggestionConfidence;
      evidenceBasis: EvidenceSource[];
      usage: LlmUsage;
      attempts: number;
    }
  | {
      status: "needs_clarification";
      reason: "insufficient_evidence" | "ambiguous";
      question: string;
      usage: LlmUsage | null;
      attempts: number;
    };

const SCHEMA = {
  type: "object",
  properties: {
    decision: { type: "string", enum: ["suggest", "clarify"] },
    goal: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    evidence_basis: {
      type: "array",
      items: {
        type: "string",
        enum: [
          "display_name",
          "bio",
          "category",
          "cta",
          "website",
          "captions",
          "brand_description",
          "niche",
          "user_answers",
        ],
      },
    },
    clarifying_question: { type: "string" },
    offer_quote: { type: "string" },
  },
  required: [
    "decision",
    "goal",
    "confidence",
    "evidence_basis",
    "clarifying_question",
    "offer_quote",
  ],
  additionalProperties: false,
};

const Shape = z.object({
  decision: z.enum(["suggest", "clarify"]),
  goal: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
  evidence_basis: z.array(
    z.enum([
      "display_name",
      "bio",
      "category",
      "cta",
      "website",
      "captions",
      "brand_description",
      "niche",
      "user_answers",
    ])
  ),
  clarifying_question: z.string(),
  offer_quote: z.string(),
});

type Parsed =
  | {
      kind: "suggest";
      goal: string;
      confidence: SuggestionConfidence;
      basis: EvidenceSource[];
    }
  | { kind: "clarify"; question: string };

export function buildGoalPrompt(e: CreatorEvidence): {
  system: string;
  user: string;
} {
  const system = [
    "You help short-form video creators state why they create content.",
    UNTRUSTED_DATA_RULE,
    "Write the creator's PURPOSE (why they create), not a description of what they posted.",
    "Use the biography, a stated call to action, retrieved website facts (offers, customers, and calls to action), and confirmed answers. Do not invent an outcome those sources do not support.",
    "Cite website only when those retrieved facts are present. A website address alone is not page content.",
    "Rules:",
    "- One sentence, at most 18 words, starting with a verb such as Help, Teach, Share, Entertain, Inspire, Show.",
    "- Only use facts present in the evidence. Do not invent products, places, names, numbers or audiences.",
    '- Mention a business outcome (clients, sales, customers, bookings, growing a business) ONLY if the bio, brand description or name shows the creator sells something. Then copy the exact words that show it into offer_quote (for example "Now taking new clients"). Otherwise leave offer_quote empty. Affiliate links ("link in bio", "shop my picks") are not a business.',
    '- If the evidence is too thin or contradictory to know their purpose, choose decision "clarify" and write one short question in the output language. Otherwise leave clarifying_question empty.',
    "- evidence_basis lists only the evidence sources you actually relied on.",
    `- Write in ${e.outputLanguage.label}. The evidence may be in any language.`,
  ].join("\n");
  const user = [
    `Evidence strength: ${e.strength}.`,
    evidenceBlock(e),
    "Return the JSON object.",
  ].join("\n");
  return { system, user };
}

export function parseGoalOutput(
  raw: unknown,
  e: CreatorEvidence
): ParseResult<Parsed> {
  const shape = Shape.safeParse(raw);
  if (!shape.success)
    return { ok: false, reason: "output did not match the schema" };
  const o = shape.data;
  if (o.decision === "clarify") {
    const q = sanitizeCopy(o.clarifying_question);
    return {
      ok: true,
      value: {
        kind: "clarify",
        question:
          q.endsWith("?") && q.length <= 200 ? q : DEFAULT_CLARIFYING_QUESTION,
      },
    };
  }
  const goal = sanitizeCopy(o.goal).replace(/^"|"$/g, "");
  if (!goal) return { ok: false, reason: "goal was empty" };
  if (wordCount(goal) > 18 || goal.length > 140)
    return { ok: false, reason: "goal is longer than one short sentence" };
  if (copiesSourceText(goal, e.declaredText))
    return { ok: false, reason: "goal copies the profile bio instead of stating a purpose" };
  if (!isSingleSentence(goal))
    return { ok: false, reason: "goal must be one sentence" };
  const nums = unsupportedNumbers(goal, e.corpus);
  if (nums.length)
    return {
      ok: false,
      reason: `goal contains numbers not in the evidence (${nums.join(", ")})`,
    };
  const names = unsupportedProperNouns(goal, e.corpus);
  if (names.length)
    return {
      ok: false,
      reason: `goal names things not in the evidence (${names.join(", ")})`,
    };
  // A business goal needs an offer the creator stated: either our fast-path
  // signal, or the model's quote of the creator's own words, checked verbatim.
  const offerProven =
    e.commercialSignals || offerQuoteIsVerbatim(o.offer_quote, e);
  if (inventsCommercialObjective(goal, offerProven)) {
    return {
      ok: false,
      reason: "goal claims a business objective the evidence does not show",
    };
  }
  const basis = o.evidence_basis.filter(b => e.sources.includes(b));
  if (basis.length === 0)
    return { ok: false, reason: "evidence_basis must name sources that exist" };
  return {
    ok: true,
    value: {
      kind: "suggest",
      goal: goal.endsWith(".") ? goal : `${goal}.`,
      confidence: o.confidence,
      basis,
    },
  };
}

export async function inferGoal(input: {
  evidence: CreatorEvidence;
  invoker?: LlmInvoker;
  timeoutMs?: number;
  onRejected?: (reason: string) => void;
}): Promise<GoalInference> {
  const e = input.evidence;
  if (e.strength === "none") {
    return {
      status: "needs_clarification",
      reason: "insufficient_evidence",
      question: DEFAULT_CLARIFYING_QUESTION,
      usage: null,
      attempts: 0,
    };
  }
  const prompt = buildGoalPrompt(e);
  const { value, usage, attempts } = await callStructured({
    operation: "personalization_goal_inference",
    system: prompt.system,
    user: prompt.user,
    schemaName: "creator_goal",
    schema: SCHEMA,
    parse: raw => parseGoalOutput(raw, e),
    invoker: input.invoker,
    timeoutMs: input.timeoutMs,
    onRejected: input.onRejected,
    maxTokens: 400,
  });
  if (value.kind === "clarify") {
    return {
      status: "needs_clarification",
      reason: "ambiguous",
      question: value.question,
      usage,
      attempts,
    };
  }
  // Weak evidence + low confidence: ask instead of guessing.
  if (e.strength === "weak" && value.confidence === "low") {
    return {
      status: "needs_clarification",
      reason: "insufficient_evidence",
      question: DEFAULT_CLARIFYING_QUESTION,
      usage,
      attempts,
    };
  }
  // Confidence can never exceed what the evidence supports.
  const cap: Record<CreatorEvidence["strength"], SuggestionConfidence> = {
    none: "low",
    weak: "low",
    moderate: "medium",
    strong: "high",
  };
  const order: SuggestionConfidence[] = ["low", "medium", "high"];
  const confidence =
    order[
      Math.min(order.indexOf(value.confidence), order.indexOf(cap[e.strength]))
    ];
  return {
    status: "suggested",
    goal: value.goal,
    confidence,
    evidenceBasis: value.basis,
    usage,
    attempts,
  };
}
