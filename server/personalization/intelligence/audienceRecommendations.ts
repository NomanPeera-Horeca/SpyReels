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
  untrustedEvidenceBlock,
  type CreatorEvidence,
} from "./evidence";
import {
  citableSources,
  EMPTY_POST_CONTEXT,
  keepCited,
  POST_EVIDENCE_RULE,
  postImagesForCall,
  postsPromptBlock,
  SOURCES_RULE,
  type PostContext,
} from "./postVisuals";
import {
  capitalizationMarksNames,
  commercialIntentAllowed,
  inventsMonetization,
  isGenericAudience,
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

export const AUDIENCE_PROMPT_VERSION = "audience-v6";
/** Soft proof never leaves fewer audiences than this when the model returned more. */
export const MIN_AUDIENCES_AFTER_PROOF = 2;
export const MAX_AUDIENCES = 3;

export type AudienceRecommendation = AudiencePayload & { why: string };

export type AudienceResult = {
  status: "suggested";
  audiences: AudienceRecommendation[];
  confidence: SuggestionConfidence;
  /** Public profile data does not include who actually watches. Never guessed. */
  observedAudience: null;
  /** Audiences dropped because they cited nothing in the evidence. */
  uncitedDropped: number;
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
          sources: { type: "array", items: { type: "string" } },
        },
        required: ["who", "outcome", "why", "sources"],
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
      outcome: z.string(),
      why: z.string(),
      sources: z.array(z.string()).optional(),
    })
  ),
  confidence: z.enum(["high", "medium", "low"]),
});

export function buildAudiencePrompt(
  e: CreatorEvidence,
  goal: string,
  keep: AudiencePayload[],
  posts: PostContext = EMPTY_POST_CONTEXT
) {
  const system = [
    "You recommend who a short-form video creator should try to reach.",
    UNTRUSTED_DATA_RULE,
    "Recommend INTENDED audiences who help the creator achieve their confirmed goal when one exists. When no goal is confirmed, use the profile evidence. Do not assume their current viewers are the right audience.",
    "Rules:",
    `- Between 2 and ${MAX_AUDIENCES} distinct segments. Return only 1 when the evidence names a single narrow audience and nothing else.`,
    "- Who the bio and the confirmed goal speak to decides your first segment. If they address people who already run or own something (for example \"grow your restaurant\", \"restaurant owners\", \"your clinic\"), the first segment is those existing owners or operators. People who want to start the same thing (aspiring, would-be or future owners) may only be a later segment, and only when several posts are about starting.",
    "- who: a short noun phrase (max 8 words). outcome: what this audience wants to achieve (max 10 words). why: one short sentence on how this audience serves the goal.",
    "- Do not add age, gender, ethnicity, religion, family role or orientation unless the evidence or goal mentions it.",
    "- Do not invent names, numbers or facts about the creator.",
    "- First identify the overall content subject and primary purpose from the bio, name, and confirmed goal. Use recurring caption themes to refine that audience, not to replace it.",
    "- A single post about a secondary subject must not narrow the entire audience or turn the creator into a different type of account.",
    "- Your first segment must represent the primary intended audience for the creator\'s overall subject and goal. Additional segments may represent distinct recurring interests, not variations of one incidental topic.",
    "- For creators who share personal life, entertainment, or experiences, audience outcomes may be connection, enjoyment, empathy, or inspiration; do not automatically recast them as shopping, budgeting, or business problems.",
    "- A sensible audience names the role or situation implied by the subject, such as pet owners for pet videos or founders for someone building an app.",
    "- A link in bio, a favorite product, or an affiliate mention is not a business. Do not recommend shoppers or affiliate audiences unless the evidence or the confirmed goal shows the creator sells their own offer.",
    "- Do not use a generic viewer group such as people, viewers, fans, followers, or social-media browsers as the whole audience.",
    "- When the evidence is thin, stay close to it. Do not invent a lifestyle, product, or problem that is not in the evidence.",
    "- Do not repeat audiences the user already confirmed.",
    `- ${SOURCES_RULE} Every audience needs at least one source.`,
    `- ${POST_EVIDENCE_RULE}`,
    `- Write in ${e.outputLanguage.label}.`,
  ].join("\n");
  const user = [
    goal.trim()
      ? `Confirmed goal (written by the user, trusted): ${JSON.stringify(goal)}`
      : "No goal is confirmed yet. Use the profile evidence. Do not invent a business objective.",
    `Already confirmed audiences: ${JSON.stringify(keep.map(a => a.who))}`,
    evidenceBlock(e),
    postsPromptBlock(posts, untrustedEvidenceBlock),
    "Return the JSON object.",
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
  return { system, user };
}

const STARTING_OUT = /\b(?:aspiring|would[- ]be|wannabe|future|soon[- ]to[- ]be|prospective)\b/i;
const SPEAKS_TO_EXISTING = /\b(?:your (?:restaurant|business|clinic|practice|store|shop|salon|gym|studio|cafe|caf\u00e9|bar|brand|team|company|agency)|owners?|operators?)\b/i;
const ABOUT_STARTING = /\b(?:aspiring|start(?:ing)? (?:a|your)|open(?:ing)? (?:a|your)|launch(?:ing)? (?:a|your)|would[- ]be|future)\b/i;

/**
 * When the bio or confirmed goal speaks to people who already own or run
 * something, an "aspiring/future" segment must not lead. Moves the first
 * established-audience segment to the front; never adds or removes one.
 */
export function existingOwnersFirst<T extends { who: string }>(list: T[], declaredAndGoal: string): T[] {
  if (list.length < 2 || !STARTING_OUT.test(list[0]!.who)) return list;
  if (!SPEAKS_TO_EXISTING.test(declaredAndGoal) || ABOUT_STARTING.test(declaredAndGoal)) return list;
  const lead = list.findIndex(a => !STARTING_OUT.test(a.who));
  if (lead <= 0) return list;
  return [list[lead]!, ...list.filter((_, i) => i !== lead)];
}

export function parseAudienceOutput(
  raw: unknown,
  e: CreatorEvidence,
  goal: string,
  keep: AudiencePayload[],
  /** What an audience may cite. Omitted: the source check is skipped. */
  citable?: ReadonlySet<string>
): ParseResult<{
  audiences: AudienceRecommendation[];
  confidence: SuggestionConfidence;
  uncitedDropped: number;
}> {
  const shape = Shape.safeParse(raw);
  if (!shape.success)
    return { ok: false, reason: "output did not match the schema" };
  const corpus = `${e.corpus}\n${goal.toLowerCase()}`;
  const seen = new Set(keep.map(a => itemIdentity("audience", a)));
  const out: { item: AudienceRecommendation; sources: string[] }[] = [];
  let droppedFor: string | null = null;
  const monetizationAllowed = commercialIntentAllowed(goal, e.commercialSignals);
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
      droppedFor = "an audience is empty or too long";
      continue;
    }
    const text = `${who} ${outcome} ${why}`;
    if (isGenericAudience(who)) {
      droppedFor = "audience is a generic viewer group";
      continue;
    }
    if (inventsMonetization(text, monetizationAllowed)) {
      droppedFor = "audience assumes a product or affiliate offer the evidence does not show";
      continue;
    }
    const demo = unsupportedDemographics(text, corpus);
    if (demo.length) {
      droppedFor = `audience assumes demographics not in the evidence (${demo.join(", ")})`;
      continue;
    }
    const nums = unsupportedNumbers(text, corpus);
    if (nums.length) {
      droppedFor = `audience contains numbers not in the evidence (${nums.join(", ")})`;
      continue;
    }
    const names = capitalizationMarksNames(e.outputLanguage.code)
      ? unsupportedProperNouns(`${who}. ${outcome}.`, corpus)
      : [];
    if (names.length) {
      droppedFor = `audience names things not in the evidence (${names.join(", ")})`;
      continue;
    }
    const key = itemIdentity("audience", { who, outcome });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ item: { who, outcome, why }, sources: a.sources ?? [] });
  }
  if (out.length === 0 && keep.length === 0)
    return { ok: false, reason: droppedFor ?? "no usable audience" };
  const { kept, dropped } = citable
    ? keepCited(out, citable, MIN_AUDIENCES_AFTER_PROOF)
    : { kept: out.map(entry => entry.item), dropped: 0 };
  const ordered = existingOwnersFirst(kept, `${e.declaredText} ${goal.toLowerCase()}`);
  return {
    ok: true,
    value: {
      audiences: ordered.slice(0, MAX_AUDIENCES),
      confidence: shape.data.confidence,
      uncitedDropped: dropped,
    },
  };
}

export async function recommendAudiences(input: {
  evidence: CreatorEvidence;
  confirmedGoal: string;
  confirmedAudiences: AudiencePayload[];
  /** The creator's indexed posts and thumbnails. Omitted: text evidence only. */
  posts?: PostContext;
  invoker?: LlmInvoker;
  timeoutMs?: number;
  onRejected?: (reason: string) => void;
}): Promise<AudienceResult> {
  const posts = input.posts ?? EMPTY_POST_CONTEXT;
  const prompt = buildAudiencePrompt(
    input.evidence,
    input.confirmedGoal,
    input.confirmedAudiences,
    posts
  );
  const citable = citableSources(input.evidence.sources, posts, input.confirmedGoal, {
    bioLink: Boolean(input.evidence.websiteUrlOnly),
  });
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
        input.confirmedAudiences,
        citable
      ),
    invoker: input.invoker,
    timeoutMs: input.timeoutMs,
    onRejected: input.onRejected,
    maxTokens: 700,
    images: postImagesForCall(posts),
  });
  return {
    status: "suggested",
    audiences: value.audiences,
    confidence: value.confidence,
    observedAudience: null,
    uncitedDropped: value.uncitedDropped,
    usage,
    attempts,
  };
}
