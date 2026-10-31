/**
 * Step 4a "Why you create": infer the creator's PURPOSE, not a summary of
 * their posts. One short sentence, starting with a verb.
 *
 * Never invents a business objective: a commercial goal needs commercial
 * evidence. With no evidence it does not call the model and asks the user.
 * When the model is called, its suggest or clarify decision stands. Evidence
 * strength only caps confidence. It does not override that decision.
 */
import { z } from "zod";
import type { SuggestionConfidence } from "@shared/personalization/model";
import {
  evidenceBlock,
  offerQuoteIsVerbatim,
  UNTRUSTED_DATA_RULE,
  untrustedEvidenceBlock,
  type CreatorEvidence,
  type EvidenceSource,
} from "./evidence";
import {
  EMPTY_POST_CONTEXT,
  POST_EVIDENCE_RULE,
  postImagesForCall,
  postsPromptBlock,
  type PostContext,
} from "./postVisuals";
import {
  capitalizationMarksNames,
  commercialWordsAreTopic,
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

export const GOAL_PROMPT_VERSION = "goal-v4";
/** Hard cap after parsing. The prompt still asks for 18 words; this only stops rambling. */
const MAX_GOAL_WORDS = 24;
const MAX_GOAL_CHARS = 170;
export const DEFAULT_CLARIFYING_QUESTION =
  "In one sentence, why do you create content? For example: to grow your business, teach a skill, or entertain people.";

export type GoalInference =
  | {
      status: "suggested";
      goal: string;
      confidence: SuggestionConfidence;
      evidenceBasis: (EvidenceSource | "posts")[];
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
          "captions",
          "brand_description",
          "niche",
          "user_answers",
          "posts",
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
      "captions",
      "brand_description",
      "niche",
      "user_answers",
      "posts",
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
      basis: (EvidenceSource | "posts")[];
    }
  | { kind: "clarify"; question: string };

export function buildGoalPrompt(
  e: CreatorEvidence,
  posts: PostContext = EMPTY_POST_CONTEXT
): {
  system: string;
  user: string;
} {
  const system = [
    "You help short-form video creators state why they create content.",
    UNTRUSTED_DATA_RULE,
    "Write the creator's PURPOSE (why they create), not a description of what they posted.",
    "Rules:",
    "- One sentence, at most 18 words, starting with a verb such as Help, Teach, Share, Entertain, Inspire, Show.",
    "- Only use facts present in the evidence. Do not invent products, places, names, numbers, or a business. A purpose that follows from the stated subject is a recommendation, not an invented fact.",
    '- Mention a business outcome (clients, sales, customers, bookings, growing a business) ONLY if the bio, brand description or name shows the creator sells something. Then copy the exact words that show it into offer_quote (for example "Now taking new clients"). Otherwise leave offer_quote empty. Affiliate links ("link in bio", "shop my picks") are not a business. A word that names the subject itself, such as sales for a sales trainer, is not a business outcome.',
    "- A bio that names the subject is enough for one initial purpose, even when there are no posts.",
    '- A niche the creator picked themselves (evidence source "niche") also names the subject, even with no bio and no posts. Then suggest one starter purpose for that niche instead of asking.',
    "- If several purposes fit that same subject, choose the most direct one. Do not ask the user to pick among purposes that all fit the evidence.",
    '- Choose decision "clarify" only when neither the bio nor a picked niche says what the content is about, or the evidence contradicts itself. Write one short question in the output language. Otherwise leave clarifying_question empty.',
    '- evidence_basis lists only the evidence sources you actually relied on. Use "posts" for the creator\'s own posts and thumbnails.',
    `- ${POST_EVIDENCE_RULE}`,
    `- Write in ${e.outputLanguage.label}. The evidence may be in any language.`,
  ].join("\n");
  const user = [
    `Evidence strength: ${e.strength}.`,
    evidenceBlock(e),
    postsPromptBlock(posts, untrustedEvidenceBlock),
    "Return the JSON object.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
  return { system, user };
}

/** The creator's own words about their subject: bio, brand, site facts and picked niche. */
function creatorTopicText(e: CreatorEvidence): string {
  const niches = e.snippets.filter(s => s.source === "niche").map(s => s.text.toLowerCase());
  return [e.declaredText, ...niches].join("\n");
}

export function parseGoalOutput(
  raw: unknown,
  e: CreatorEvidence,
  /** The creator's posts were shown, so "posts" is a real evidence source. */
  hasPosts = false
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
  let goal = sanitizeCopy(o.goal).replace(/^"|"$/g, "");
  if (!goal) return { ok: false, reason: "goal was empty" };
  // A second sentence is extra detail: keep the first one when it stands alone.
  if (!isSingleSentence(goal)) {
    const first = goal.split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
    if (wordCount(first) < 4) return { ok: false, reason: "goal must be one sentence" };
    goal = first;
  }
  if (wordCount(goal) > MAX_GOAL_WORDS || goal.length > MAX_GOAL_CHARS)
    return { ok: false, reason: "goal is longer than one short sentence" };
  if (copiesSourceText(goal, e.declaredText))
    return { ok: false, reason: "goal copies the profile bio instead of stating a purpose" };
  const nums = unsupportedNumbers(goal, e.corpus);
  if (nums.length)
    return {
      ok: false,
      reason: `goal contains numbers not in the evidence (${nums.join(", ")})`,
    };
  const names = capitalizationMarksNames(e.outputLanguage.code)
    ? unsupportedProperNouns(goal, e.corpus, [e.outputLanguage.label])
    : [];
  if (names.length)
    return {
      ok: false,
      reason: `goal names things not in the evidence (${names.join(", ")})`,
    };
  // A business goal needs an offer the creator stated: either our fast-path
  // signal, or the model's quote of the creator's own words, checked verbatim.
  const offerProven =
    e.commercialSignals ||
    offerQuoteIsVerbatim(o.offer_quote, e) ||
    commercialWordsAreTopic(goal, creatorTopicText(e));
  if (inventsCommercialObjective(goal, offerProven)) {
    return {
      ok: false,
      reason: "goal claims a business objective the evidence does not show",
    };
  }
  const basis = o.evidence_basis.filter(b =>
    b === "posts" ? hasPosts : e.sources.includes(b)
  );
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
  /** The creator's indexed posts and thumbnails. Omitted: text evidence only. */
  posts?: PostContext;
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
  const posts = input.posts ?? EMPTY_POST_CONTEXT;
  const prompt = buildGoalPrompt(e, posts);
  const { value, usage, attempts } = await callStructured({
    operation: "personalization_goal_inference",
    system: prompt.system,
    user: prompt.user,
    schemaName: "creator_goal",
    schema: SCHEMA,
    parse: raw => parseGoalOutput(raw, e, posts.posts.length > 0),
    invoker: input.invoker,
    timeoutMs: input.timeoutMs,
    onRejected: input.onRejected,
    maxTokens: 400,
    images: postImagesForCall(posts),
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
  // Confidence can never exceed what the evidence quantity supports.
  // A low-confidence suggestion is still a suggestion. The model already
  // chose suggest rather than clarify.
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
