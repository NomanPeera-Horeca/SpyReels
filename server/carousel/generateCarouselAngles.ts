/**
 * Carousel Studio: propose creative briefs from source content.
 * Review Plan: one Sonnet call for 3 full briefs, plus at most one repair.
 * Auto generateFromInput: target exactly 3 compact candidates (one compact
 * repair for any shortfall), then expand ALL THREE into complete creative
 * briefs concurrently. Rank only after full development. If fewer than 3
 * complete briefs exist after repairs, telemetry marks that degradation.
 * Does not generate full slide copy. Selected brief is passed into
 * generateCarouselRemake separately from sourceContent.
 */

import {
  assignCarouselBriefId,
  CAROUSEL_ANGLE_TYPES,
  CAROUSEL_BRIEF_EVIDENCE_MAX,
  CAROUSEL_BRIEF_KEY_POINTS_MAX,
  CAROUSEL_BRIEF_KEY_POINTS_MIN,
  CAROUSEL_BRIEF_PROHIBITED_MAX,
  CAROUSEL_CLAIM_RISKS,
  CAROUSEL_CONTENT_FORMATS,
  CAROUSEL_CONTENT_GOALS,
  CAROUSEL_LAYOUT_FAMILIES,
  CAROUSEL_RECOMMENDED_VISUALS,
  CAROUSEL_RESEARCH_MODES,
  CAROUSEL_SLIDE_ROLES,
  CAROUSEL_STUDIO_ANGLE_COUNT,
  CAROUSEL_STUDIO_MAX_SLIDES,
  CAROUSEL_STUDIO_MIN_SLIDES,
  detectExplicitCarouselListContract,
  expectedExplicitListicleSlideCount,
  normalizeGeneratedCarouselBrief,
  normalizeGeneratedCarouselBriefs,
  rankCarouselCreativeBriefs,
  scoreCarouselCreativeBrief,
  selectSemanticallyValidCarouselBriefs,
  validateCarouselBriefSemantics,
  type CarouselAngleType,
  type CarouselClaimRisk,
  type CarouselContentFormat,
  type CarouselContentGoal,
  type CarouselCreativeBrief,
  type CarouselCreativeBriefScores,
  type CarouselLayoutFamily,
  type CarouselListContract,
  type CarouselResearchMode,
} from "@shared/carouselStudio";
import {
  applyCarouselSourceFormatFitToBriefs,
  CAROUSEL_FORMAT_FIT_SCORING_GUIDANCE,
  CAROUSEL_FORMAT_SELECTION_GUIDANCE,
} from "@shared/carouselSourceFormatIntent";
import { invokeLLM } from "../_core/llm";
import {
  logAngleGenerationCompleted,
  logAngleGenerationFailed,
  logAngleGenerationStarted,
  logAngleSubstageCompleted,
  resolveAngleGenerationCorrelationId,
  resolveAngleGenerationEntryPoint,
  type CarouselAngleGenerationMode,
  type CompactSubstageMetrics,
  type ExpansionAttemptMetrics,
  type ExpansionSubstageMetrics,
  type SemanticIssuesByCandidate,
} from "./angleGenerationObservability";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";

export const ANGLE_HAIKU_MODEL = "claude-haiku-4-5-20251001";
export const ANGLE_REVIEW_PLAN_MODEL = "claude-sonnet-4-6";
/** Compact model for sources with an explicit list contract. */
export const ANGLE_COMPACT_CANDIDATE_MODEL = ANGLE_HAIKU_MODEL;
export const ANGLE_EXPANSION_MODEL = ANGLE_REVIEW_PLAN_MODEL;
const ANGLE_GENERATION_REQUESTED_MODEL = ANGLE_REVIEW_PLAN_MODEL;
const COMPACT_CANDIDATE_MAX_TOKENS = 2048;

/**
 * Compact candidates use Haiku only when the source has an explicit list
 * contract. Open-ended stories and opinions stay on Sonnet.
 */
export function resolveCompactCandidateModel(
  sourceContent: string,
  listContract?: CarouselListContract | null
): string {
  const contract =
    listContract === undefined
      ? detectExplicitCarouselListContract(sourceContent)
      : listContract;
  return contract?.explicitListContract
    ? ANGLE_COMPACT_CANDIDATE_MODEL
    : ANGLE_EXPANSION_MODEL;
}

type BriefsLlmPayload = {
  angles?: unknown[];
};

type FullBriefLlmPayload = {
  brief?: unknown;
};

export const CAROUSEL_ANGLE_STRATEGY_FIELDS = [
  "kicker",
  "title",
  "description",
  "estimatedSlideCount",
  "topic",
  "inferredAudience",
  "contentGoal",
  "contentFormat",
  "angleType",
  "hook",
  "corePromise",
  "centralInsight",
  "layoutFamily",
  "claimRisk",
  "researchMode",
  "scores",
  "confidence",
] as const;

export type CarouselAngleCandidate = {
  kicker: string;
  title: string;
  description: string;
  estimatedSlideCount: number;
  topic: string;
  inferredAudience: string;
  contentGoal: CarouselContentGoal;
  contentFormat: CarouselContentFormat;
  angleType: CarouselAngleType;
  hook: string;
  corePromise: string;
  centralInsight: string;
  layoutFamily: CarouselLayoutFamily;
  claimRisk: CarouselClaimRisk;
  researchMode: CarouselResearchMode;
  scores: CarouselCreativeBriefScores;
  confidence: number;
};

function includesUnion<T extends string>(
  values: readonly T[],
  value: unknown
): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function clampStudioSlideCount(value: unknown): number | null {
  const raw = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(raw)) return null;
  if (raw < CAROUSEL_STUDIO_MIN_SLIDES || raw > CAROUSEL_STUDIO_MAX_SLIDES) {
    return null;
  }
  return raw;
}

type AngleCallTelemetry = {
  inputCharacterCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
};

function llmTokenUsage(response: {
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}): {
  inputTokens: number | null;
  outputTokens: number | null;
} {
  const input = response.usage?.prompt_tokens;
  const output = response.usage?.completion_tokens;
  return {
    inputTokens: typeof input === "number" && Number.isFinite(input) ? input : null,
    outputTokens:
      typeof output === "number" && Number.isFinite(output) ? output : null,
  };
}

const ENUM_STRING = (values: readonly string[], description: string) => ({
  type: "string" as const,
  enum: [...values],
  description,
});

export function buildCarouselAnglesJsonSchema(): {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} {
  const scoresSchema = {
    type: "object",
    description:
      "Component scores from 0 to 100. Do not include an overall score.",
    properties: {
      relevance: { type: "number", description: "0-100 topic fit to the source." },
      usefulness: {
        type: "number",
        description: "0-100 practical value for the inferred audience.",
      },
      specificity: {
        type: "number",
        description: "0-100 concrete, non-generic planning.",
      },
      visualPotential: {
        type: "number",
        description: "0-100 how clearly the plan can be visualized.",
      },
      factualSafety: {
        type: "number",
        description: "0-100 how avoidable unsupported claims are.",
      },
      originality: {
        type: "number",
        description: "0-100 distinctiveness versus generic carousel advice.",
      },
    },
    required: [
      "relevance",
      "usefulness",
      "specificity",
      "visualPotential",
      "factualSafety",
      "originality",
    ],
    additionalProperties: false,
  };

  const keyPointSchema = {
    type: "object",
    properties: {
      title: { type: "string", description: "Short point title, not slide copy." },
      explanation: {
        type: "string",
        description: "One concise sentence. Not full slide copy.",
      },
      purpose: {
        type: "string",
        description: "Why this point belongs in the carousel.",
      },
    },
    required: ["title", "explanation", "purpose"],
    additionalProperties: false,
  };

  const slideOutlineItemSchema = {
    type: "object",
    properties: {
      position: {
        type: "integer",
        description: "1-based slide position matching estimatedSlideCount.",
      },
      role: ENUM_STRING(
        CAROUSEL_SLIDE_ROLES,
        "Functional role of this planned slide. The last slide must be cta or takeaway. takeaway and cta cannot both appear in the same outline."
      ),
      objective: {
        type: "string",
        description: "One concise sentence. Distinct from other slides.",
      },
      recommendedVisual: ENUM_STRING(
        CAROUSEL_RECOMMENDED_VISUALS,
        "Planned visual treatment. Not a rendered layout."
      ),
      listItemIndex: {
        type: ["integer", "null"],
        description:
          "1-based promised list item number. Set only on actual list items. Null on cover, context, example, takeaway, and CTA. Never derive from physical slide position.",
      },
    },
    required: [
      "position",
      "role",
      "objective",
      "recommendedVisual",
      "listItemIndex",
    ],
    additionalProperties: false,
  };

  const briefRequired = [
    "kicker",
    "title",
    "description",
    "estimatedSlideCount",
    "topic",
    "inferredAudience",
    "audienceReasoning",
    "contentGoal",
    "contentFormat",
    "angleType",
    "hook",
    "corePromise",
    "centralInsight",
    "keyPoints",
    "slideOutline",
    "layoutFamily",
    "visualDirection",
    "imageDirection",
    "claimRisk",
    "researchMode",
    "evidenceRequirements",
    "prohibitedClaims",
    "ctaDirection",
    "scores",
    "confidence",
  ];

  return {
    name: "carousel_studio_angles",
    strict: true,
    schema: {
      type: "object",
      properties: {
        angles: {
          type: "array",
          description: `Exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} complete creative briefs. Do not include id, schemaVersion, or overall score.`,
          items: {
            type: "object",
            properties: {
              kicker: {
                type: "string",
                description:
                  "Short category label for the strategy (e.g. Contrarian, Framework, Story).",
              },
              title: {
                type: "string",
                description:
                  "Punchy carousel-ready title / hook for this direction (not full slide copy). If it names N items, the outline must deliver exactly N item slides or the number must be removed.",
              },
              description: {
                type: "string",
                description:
                  "One sentence explaining the strategic approach and why it works on social.",
              },
              estimatedSlideCount: {
                type: "integer",
                description: `Ideal slide count between ${CAROUSEL_STUDIO_MIN_SLIDES} and ${CAROUSEL_STUDIO_MAX_SLIDES} inclusive.`,
              },
              topic: {
                type: "string",
                description: "Source topic in a short phrase. Preserve the user's subject.",
              },
              inferredAudience: {
                type: "string",
                description:
                  "Who this carousel is for. Infer only when the user did not name one.",
              },
              audienceReasoning: {
                type: "string",
                description: "One concise sentence for why this audience fits.",
              },
              contentGoal: ENUM_STRING(
                CAROUSEL_CONTENT_GOALS,
                "Primary social outcome for this brief."
              ),
              contentFormat: ENUM_STRING(
                CAROUSEL_CONTENT_FORMATS,
                "Must match layoutFamily."
              ),
              angleType: ENUM_STRING(
                CAROUSEL_ANGLE_TYPES,
                "Strategic angle. The three briefs must differ."
              ),
              hook: {
                type: "string",
                description:
                  "Planned opening hook. Not finished slide copy. If it names N items, the outline must deliver exactly N item slides or the number must be removed.",
              },
              corePromise: {
                type: "string",
                description: "What the reader will walk away with.",
              },
              centralInsight: {
                type: "string",
                description: "The one idea the carousel is built around.",
              },
              keyPoints: {
                type: "array",
                description: `${CAROUSEL_BRIEF_KEY_POINTS_MIN}-${CAROUSEL_BRIEF_KEY_POINTS_MAX} useful, specific points. Plans only.`,
                items: keyPointSchema,
              },
              slideOutline: {
                type: "array",
                description:
                  "One item per planned slide. Length must equal estimatedSlideCount. Distinct objectives. No full slide copy. If title or hook names N items, include exactly N item slides then one closing. Do not add a standalone context slide on a straightforward listicle.",
                items: slideOutlineItemSchema,
              },
              layoutFamily: ENUM_STRING(
                CAROUSEL_LAYOUT_FAMILIES,
                "Planned/recommended format. Must match contentFormat."
              ),
              visualDirection: {
                type: "string",
                description: "One sentence on the planned visual system.",
              },
              imageDirection: {
                type: "string",
                description: "One sentence on photo or graphic direction.",
              },
              claimRisk: ENUM_STRING(
                CAROUSEL_CLAIM_RISKS,
                "How risky unsupported claims would be."
              ),
              researchMode: ENUM_STRING(
                CAROUSEL_RESEARCH_MODES,
                "Classify research need only. Do not perform research."
              ),
              evidenceRequirements: {
                type: "array",
                description: `What would need verification before publishing. Max ${CAROUSEL_BRIEF_EVIDENCE_MAX}. No citations.`,
                items: { type: "string" },
              },
              prohibitedClaims: {
                type: "array",
                description: `Claims this brief must not make. Max ${CAROUSEL_BRIEF_PROHIBITED_MAX}. Include unsupported absolutes.`,
                items: { type: "string" },
              },
              ctaDirection: {
                type: "string",
                description:
                  "Specific CTA direction. Never default to Follow for more.",
              },
              scores: scoresSchema,
              confidence: {
                type: "number",
                description: "Model confidence from 0 to 1.",
              },
            },
            required: briefRequired,
            additionalProperties: false,
          },
        },
      },
      required: ["angles"],
      additionalProperties: false,
    },
  };
}

export function buildCarouselAnglesSystemPrompt(): string {
  return withAiFormattingRules(
    [
      "You are a SpyReels carousel strategist. Return three complete production-ready creative briefs as structured tool output only.",
      "Source content is the primary authority for topic, industry, and audience.",
      "If the source explicitly mentions an audience or industry, preserve it.",
      "Never convert the source into the creator's saved niche unless an explicit audience override was provided.",
      "Audience override affects targeting only; it must not replace unrelated source facts.",
      "Brand voice may affect tone but never topic, industry, or audience.",
      "Return plans, not finished slide copy. No citations or invented sources.",
      "Do not create id or schemaVersion fields. Do not include an overall score.",
    ].join(" ")
  );
}

function explicitListContractPromptLines(
  listContract: CarouselListContract | null
): string[] {
  if (!listContract) return [];
  const { promisedCount, promisedItemType } = listContract;
  const slideCount = expectedExplicitListicleSlideCount(promisedCount);
  return [
    `EXPLICIT LIST CONTRACT from the user source: promised count ${promisedCount}, promised item type "${promisedItemType}".`,
    `Preserve this count and semantic item type. Hook wording may improve, but do not replace "${promisedItemType}" with a different taxonomy such as myths, reasons, tips, or signs unless that is the promised type.`,
    `Default structure: cover, then ${promisedCount} ${promisedItemType} item slides, then one final closing. estimatedSlideCount should be ${slideCount}. Put setup on the cover. Do not insert a standalone context slide.`,
    `Only the ${promisedCount} promised item slides get listItemIndex 1 through ${promisedCount}. Cover, context, example, takeaway, and CTA must set listItemIndex to null. Never derive listItemIndex from physical slide position.`,
  ];
}

function inventedListContractPromptLines(): string[] {
  return [
    "If you create an enumerated list in the title, hook, corePromise, or centralInsight, that list is a contract: deliver exactly that many item slides of that item type.",
    "If title or hook names N steps, signs, mistakes, lessons, rooms, or other list items, slideOutline must contain exactly N item slides with listItemIndex 1 through N. estimatedSlideCount must be N plus cover plus one closing.",
    "If you cannot outline all N items, remove the number from title, hook, corePromise, and centralInsight instead of under-delivering.",
    "Straightforward enumerated listicles use cover, then the N item slides, then one closing. Put setup on the cover. Do not add a standalone context slide.",
    "Only promised item slides get listItemIndex 1 through N. Cover, context, example, takeaway, and CTA stay null. Never put a list item number on a context or closing slide.",
    "Keep exactly one closing as the last slide after the N items.",
  ];
}

export const ONE_CLOSING_EXPANSION_CONTRACT =
  "slideOutline must contain exactly ONE final closing. takeaway and cta are both closing roles. Never include both. Valid last two roles: insight then cta, example then cta, or insight then takeaway. Invalid: takeaway then cta. If the last slide is cta, the penultimate role must be insight, example, problem, or framework, never takeaway. Preserve estimatedSlideCount. Do not drop a slide to hide an extra closing.";

export const COMPETING_ENDINGS_REPAIR_CONTRACT =
  "Exactly one closing. takeaway and cta cannot both appear. If the outline currently ends takeaway then cta, change the penultimate role from takeaway to insight or example and keep the last slide as cta. Preserve the total slide count. Do not keep a takeaway slide when a cta slide exists.";

export const INVENTED_LIST_REPAIR_CONTRACT =
  "If title or hook promises N items, outline exactly N item slides with listItemIndex 1 through N, or remove the number from title, hook, corePromise, and centralInsight. Straightforward invented listicles are cover plus N items plus one closing. Do not add a standalone context slide. Keep exactly one closing as the last slide.";

export function buildCarouselAnglesUserPrompt(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  listContract?: CarouselListContract | null;
}): string {
  const brand = args.brandVoice?.trim();
  const override = args.niche?.trim() ?? "";
  const listContract =
    args.listContract ??
    detectExplicitCarouselListContract(args.sourceContent);
  const audienceLine = override
    ? `Audience override (targeting only; do not replace unrelated source facts): ${override}`
    : "Audience / industry: infer from the source content.";
  const lines = [
    audienceLine,
    "",
    "Source content is the primary authority for topic, industry, and audience.",
    "If the source explicitly mentions an audience or industry, preserve it.",
    "Never convert the source into the creator's saved niche unless an explicit audience override was provided.",
    "Audience override affects targeting only; it must not replace unrelated source facts.",
    "Infer an audience only when the user has not provided one.",
    "",
    "Source content (use as material; do not copy wording verbatim into titles):",
    args.sourceContent.trim(),
    "",
    `Propose exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} genuinely different content strategies for an Instagram carousel.`,
    "Do not write the same idea three times with different hooks.",
    CAROUSEL_FORMAT_SELECTION_GUIDANCE,
    "Decide the core promise and central insight before listing key points.",
    "Select useful, specific key points before any slide writing.",
    "Give every planned slide a distinct objective. Do not repeat the same slide objective.",
    "For numbered problem-solution formats: outline Leak/Problem N before Fix N, include every promised item, and do not summarize N plugs or fixes that were never introduced.",
    ...explicitListContractPromptLines(listContract),
    ...(listContract ? [] : inventedListContractPromptLines()),
    "End with exactly one intentional final closing. The last slide role must be cta or takeaway. Choose the ending from contentGoal, audience, angleType, creator voice, ctaDirection, and funnel intent. A takeaway or soft close is valid. Do not add a second competing ending.",
    "Match contentFormat and layoutFamily.",
    "Avoid a generic Follow for more CTA. Write a specific ctaDirection.",
    "Avoid unsupported absolutes and sensational claims.",
    "Record risky or unsupported statements under prohibitedClaims.",
    "Classify researchMode only. Do not perform research or add citations.",
    "",
    "researchMode = none: personal stories, motivation, general productivity, creative inspiration, low-risk opinion content.",
    "researchMode = claim_verification: health and fitness, nutrition, business finance, mortgages and home buying, marketing statistics, product comparisons, technical performance claims.",
    "researchMode = research_required: diagnosis or medical treatment, legal advice, tax guidance, investment recommendations, safety-critical instructions, laws or regulations, current events, current statistics.",
    "",
    "Return plans, not finished slide copy. No paragraph-length reasoning.",
    `Each brief needs ${CAROUSEL_BRIEF_KEY_POINTS_MIN}-${CAROUSEL_BRIEF_KEY_POINTS_MAX} keyPoints.`,
    `estimatedSlideCount must be an integer from ${CAROUSEL_STUDIO_MIN_SLIDES} to ${CAROUSEL_STUDIO_MAX_SLIDES}.`,
    "slideOutline length must equal estimatedSlideCount.",
    `evidenceRequirements max ${CAROUSEL_BRIEF_EVIDENCE_MAX}. prohibitedClaims max ${CAROUSEL_BRIEF_PROHIBITED_MAX}.`,
    "Each explanation and objective must be one concise sentence.",
    "Score relevance, usefulness, specificity, visualPotential, factualSafety, and originality from 0-100. Do not compute overall.",
    CAROUSEL_FORMAT_FIT_SCORING_GUIDANCE,
  ];
  if (brand) {
    lines.push("", `Brand voice guidance (tone only, not a topic override): ${brand}`);
  }
  return lines.join("\n");
}

function audienceAndSourcePromptLines(args: {
  sourceContent: string;
  niche?: string | null;
}): string[] {
  const override = args.niche?.trim() ?? "";
  const audienceLine = override
    ? `Audience override (targeting only; do not replace unrelated source facts): ${override}`
    : "Audience / industry: infer from the source content.";
  return [
    audienceLine,
    "",
    "Source content is the primary authority for topic, industry, and audience.",
    "If the source explicitly mentions an audience or industry, preserve it.",
    "Never convert the source into the creator's saved niche unless an explicit audience override was provided.",
    "Audience override affects targeting only; it must not replace unrelated source facts.",
    "Infer an audience only when the user has not provided one.",
    "",
    "Source content (use as material; do not copy wording verbatim into titles):",
    args.sourceContent.trim(),
  ];
}

function compactListContractFieldNote(
  listContract: CarouselListContract | null | undefined
): string {
  if (!listContract?.explicitListContract) {
    return " If the user message states an explicit list contract, keep that promised count and item type.";
  }
  return ` Keep promised count ${listContract.promisedCount} and item type "${listContract.promisedItemType}". Do not switch taxonomy.`;
}

function explicitCompactListContractPromptLines(
  listContract: CarouselListContract | null
): string[] {
  if (!listContract) return [];
  const { promisedCount, promisedItemType } = listContract;
  const slideCount = expectedExplicitListicleSlideCount(promisedCount);
  return [
    `EXPLICIT LIST CONTRACT from the user source: promised count ${promisedCount}, promised item type "${promisedItemType}".`,
    "EXPLICIT LIST CONTRACT. This is mandatory for every candidate.",
    `Every candidate must remain a ${promisedCount}-item ${promisedItemType} carousel.`,
    `Every candidate must honor this contract. Strategies may differ in hook, insight, and framing, but not in item type, count, or cover-plus-items-plus-closing structure.`,
    `estimatedSlideCount should be ${slideCount}.`,
  ];
}

function compactCandidateProperties(
  listContract?: CarouselListContract | null
): Record<string, unknown> {
  const contractNote = compactListContractFieldNote(listContract);
  const expectedSlideCount = listContract?.explicitListContract
    ? expectedExplicitListicleSlideCount(listContract.promisedCount)
    : null;
  return {
    kicker: {
      type: "string",
      description: "Short category label (e.g. Contrarian, Framework, Story).",
    },
    title: {
      type: "string",
      description: `Punchy carousel-ready title. Not slide copy.${contractNote}`,
    },
    description: {
      type: "string",
      description: `One sentence on the strategic approach.${contractNote}`,
    },
    estimatedSlideCount: {
      type: "integer",
      description:
        expectedSlideCount != null
          ? `Must be ${expectedSlideCount}. Cover plus ${listContract!.promisedCount} ${listContract!.promisedItemType} plus one closing.`
          : `Ideal slide count between ${CAROUSEL_STUDIO_MIN_SLIDES} and ${CAROUSEL_STUDIO_MAX_SLIDES}. If the user message states an explicit list contract, use that estimated slide count.`,
    },
    topic: {
      type: "string",
      description: "Source topic in a short phrase.",
    },
    inferredAudience: {
      type: "string",
      description: "Who this carousel is for.",
    },
    contentGoal: ENUM_STRING(CAROUSEL_CONTENT_GOALS, "Primary social outcome."),
    contentFormat: ENUM_STRING(
      CAROUSEL_CONTENT_FORMATS,
      "Must match layoutFamily."
    ),
    angleType: ENUM_STRING(
      CAROUSEL_ANGLE_TYPES,
      "Strategic angle. The three candidates must differ by framing, not by list taxonomy or count."
    ),
    hook: {
      type: "string",
      description: `Planned opening hook. Not finished slide copy.${contractNote}`,
    },
    corePromise: {
      type: "string",
      description: `What the reader will walk away with.${contractNote}`,
    },
    centralInsight: {
      type: "string",
      description: "The one idea the carousel is built around.",
    },
    layoutFamily: ENUM_STRING(
      CAROUSEL_LAYOUT_FAMILIES,
      "Must match contentFormat."
    ),
    claimRisk: ENUM_STRING(CAROUSEL_CLAIM_RISKS, "Unsupported-claim risk."),
    researchMode: ENUM_STRING(
      CAROUSEL_RESEARCH_MODES,
      "Classify research need only. Do not perform research."
    ),
    scores: {
      type: "object",
      description:
        "Component scores from 0 to 100. Do not include an overall score.",
      properties: {
        relevance: { type: "number", description: "0-100 topic fit to the source." },
        usefulness: {
          type: "number",
          description: "0-100 practical value for the inferred audience.",
        },
        specificity: {
          type: "number",
          description: "0-100 concrete, non-generic planning.",
        },
        visualPotential: {
          type: "number",
          description: "0-100 how clearly the plan can be visualized.",
        },
        factualSafety: {
          type: "number",
          description: "0-100 how avoidable unsupported claims are.",
        },
        originality: {
          type: "number",
          description: "0-100 distinctiveness versus generic carousel advice.",
        },
      },
      required: [
        "relevance",
        "usefulness",
        "specificity",
        "visualPotential",
        "factualSafety",
        "originality",
      ],
      additionalProperties: false,
    },
    confidence: {
      type: "number",
      description: "Model confidence from 0 to 1.",
    },
  };
}

export function buildCarouselAngleCandidatesJsonSchema(
  listContract?: CarouselListContract | null
): {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} {
  return {
    name: "carousel_studio_angle_candidates",
    strict: true,
    schema: {
      type: "object",
      properties: {
        angles: {
          type: "array",
          description: `Exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} compact angle candidates. No keyPoints, slideOutline, or finished copy.`,
          items: {
            type: "object",
            properties: compactCandidateProperties(listContract),
            required: [...CAROUSEL_ANGLE_STRATEGY_FIELDS],
            additionalProperties: false,
          },
        },
      },
      required: ["angles"],
      additionalProperties: false,
    },
  };
}

function fullBriefItemSchema(): Record<string, unknown> {
  const schema = buildCarouselAnglesJsonSchema();
  const angles = (schema.schema.properties as { angles: { items: Record<string, unknown> } })
    .angles;
  return angles.items;
}

export function buildCarouselAngleFullBriefExpansionJsonSchema(): {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} {
  return {
    name: "carousel_studio_angle_full_brief_expansion",
    strict: true,
    schema: {
      type: "object",
      properties: {
        brief: {
          ...(fullBriefItemSchema() as Record<string, unknown>),
          description:
            "One complete production-ready creative brief developed from a single candidate. Include every brief field. Do not return a slim expansion payload.",
        },
      },
      required: ["brief"],
      additionalProperties: false,
    },
  };
}

export function buildCarouselAngleCandidatesSystemPrompt(): string {
  return withAiFormattingRules(
    [
      `You are a SpyReels carousel strategist. Generate exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} concise strategic candidates as structured tool output only.`,
      "These are not complete creative briefs.",
      "Do not write keyPoints, slideOutline, visualDirection, imageDirection, evidenceRequirements, prohibitedClaims, audienceReasoning, or CTA planning.",
      "Obey any explicit list contract in the user message for every candidate.",
      "Source content is the primary authority for topic, industry, and audience.",
      "If the source explicitly mentions an audience or industry, preserve it.",
      "Never convert the source into the creator's saved niche unless an explicit audience override was provided.",
      "Audience override affects targeting only; it must not replace unrelated source facts.",
      "Brand voice may affect tone but never topic, industry, or audience.",
      "Return structured output only. No citations or invented sources.",
      "Do not create id or schemaVersion fields. Do not include an overall score.",
    ].join(" ")
  );
}

export function buildCarouselAngleExpansionSystemPrompt(): string {
  return withAiFormattingRules(
    [
      "You are a SpyReels carousel strategist. Expand exactly one strategic candidate into one complete production-ready creative brief as structured tool output only.",
      "Honor the candidate strategic direction: angleType, core promise, central insight, and hook framing.",
      "Produce every brief field, including keyPoints, slideOutline, visualDirection, imageDirection, evidenceRequirements, prohibitedClaims, audienceReasoning, ctaDirection, scores, and confidence.",
      "End with exactly one closing. The last slide role must be cta or takeaway, never both in the same outline.",
      "Do not return a slim expansion payload. Do not propose alternative strategies. Do not return multiple briefs.",
      "Source content is the primary authority for topic, industry, and audience.",
      "If the source explicitly mentions an audience or industry, preserve it.",
      "Never convert the source into the creator's saved niche unless an explicit audience override was provided.",
      "Audience override affects targeting only; it must not replace unrelated source facts.",
      "Brand voice may affect tone but never topic, industry, or audience.",
      "Return plans, not finished slide copy. No citations or invented sources.",
      "Do not create id or schemaVersion fields. Do not include an overall score.",
    ].join(" ")
  );
}

export function buildCarouselAngleCandidatesUserPrompt(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  listContract?: CarouselListContract | null;
}): string {
  const brand = args.brandVoice?.trim();
  const listContract =
    args.listContract ??
    detectExplicitCarouselListContract(args.sourceContent);
  const lines = [
    ...audienceAndSourcePromptLines(args),
    "",
    `Return exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} concise strategic candidates for an Instagram carousel.`,
    "These are compact candidates only, not complete briefs.",
    "Do not write keyPoints, slideOutline, visualDirection, imageDirection, evidenceRequirements, prohibitedClaims, audienceReasoning, or ctaDirection.",
    "Keep every string to one concise sentence. Do not write finished slide copy.",
    CAROUSEL_FORMAT_SELECTION_GUIDANCE,
    "Do not change the source taxonomy or promised item count when an explicit list contract is present.",
    ...explicitCompactListContractPromptLines(listContract),
    ...(listContract ? [] : inventedListContractPromptLines()),
    "Match contentFormat and layoutFamily.",
    "Classify researchMode only. Do not perform research or add citations.",
    `estimatedSlideCount must be an integer from ${CAROUSEL_STUDIO_MIN_SLIDES} to ${CAROUSEL_STUDIO_MAX_SLIDES}.`,
    "Score relevance, usefulness, specificity, visualPotential, factualSafety, and originality from 0-100. Do not compute overall.",
    CAROUSEL_FORMAT_FIT_SCORING_GUIDANCE,
  ];
  if (brand) {
    lines.push("", `Brand voice guidance (tone only, not a topic override): ${brand}`);
  }
  return lines.join("\n");
}

export function buildCarouselAngleExpansionUserPrompt(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  listContract?: CarouselListContract | null;
  candidate: CarouselAngleCandidate;
}): string {
  const brand = args.brandVoice?.trim();
  const listContract =
    args.listContract ??
    detectExplicitCarouselListContract(args.sourceContent);
  const lines = [
    ...audienceAndSourcePromptLines(args),
    "",
    "Develop the candidate below into one complete production-ready creative brief.",
    "Honor the candidate strategic direction. You may refine wording, scores, slide count, and supporting fields so the brief is production-ready.",
    "Do not propose other strategies. Do not return multiple briefs.",
    "Write every brief field. This is not a slim expansion payload.",
    "Decide the core promise and central insight before listing key points.",
    "Select useful, specific key points before any slide writing.",
    "Give every planned slide a distinct objective. Do not repeat the same slide objective.",
    "For numbered problem-solution formats: outline Leak/Problem N before Fix N, include every promised item, and do not summarize N plugs or fixes that were never introduced.",
    ...explicitListContractPromptLines(listContract),
    ...(listContract ? [] : inventedListContractPromptLines()),
    "End with exactly one intentional final closing. The last slide role must be cta or takeaway, never both in the same outline. Choose the ending from contentGoal, audience, angleType, creator voice, ctaDirection, and funnel intent. A takeaway ending is valid only when there is no cta slide. Do not add a second competing ending.",
    ONE_CLOSING_EXPANSION_CONTRACT,
    "Match contentFormat and layoutFamily.",
    "Avoid a generic Follow for more CTA. Write a specific ctaDirection.",
    "Avoid unsupported absolutes and sensational claims.",
    "Record risky or unsupported statements under prohibitedClaims.",
    "Classify researchMode only. Do not perform research or add citations.",
    "",
    "researchMode = none: personal stories, motivation, general productivity, creative inspiration, low-risk opinion content.",
    "researchMode = claim_verification: health and fitness, nutrition, business finance, mortgages and home buying, marketing statistics, product comparisons, technical performance claims.",
    "researchMode = research_required: diagnosis or medical treatment, legal advice, tax guidance, investment recommendations, safety-critical instructions, laws or regulations, current events, current statistics.",
    "",
    "Return plans, not finished slide copy. No paragraph-length reasoning.",
    `This brief needs ${CAROUSEL_BRIEF_KEY_POINTS_MIN}-${CAROUSEL_BRIEF_KEY_POINTS_MAX} keyPoints.`,
    `estimatedSlideCount must be an integer from ${CAROUSEL_STUDIO_MIN_SLIDES} to ${CAROUSEL_STUDIO_MAX_SLIDES}.`,
    "slideOutline length must equal estimatedSlideCount.",
    `evidenceRequirements max ${CAROUSEL_BRIEF_EVIDENCE_MAX}. prohibitedClaims max ${CAROUSEL_BRIEF_PROHIBITED_MAX}.`,
    "Each explanation and objective must be one concise sentence.",
    "Score relevance, usefulness, specificity, visualPotential, factualSafety, and originality from 0-100. Do not compute overall.",
    CAROUSEL_FORMAT_FIT_SCORING_GUIDANCE,
    "",
    "Strategic candidate to develop:",
    JSON.stringify({
      kicker: args.candidate.kicker,
      title: args.candidate.title,
      description: args.candidate.description,
      estimatedSlideCount: args.candidate.estimatedSlideCount,
      topic: args.candidate.topic,
      inferredAudience: args.candidate.inferredAudience,
      contentGoal: args.candidate.contentGoal,
      contentFormat: args.candidate.contentFormat,
      angleType: args.candidate.angleType,
      hook: args.candidate.hook,
      corePromise: args.candidate.corePromise,
      centralInsight: args.candidate.centralInsight,
      layoutFamily: args.candidate.layoutFamily,
      claimRisk: args.candidate.claimRisk,
      researchMode: args.candidate.researchMode,
    }),
  ];
  if (brand) {
    lines.push("", `Brand voice guidance (tone only, not a topic override): ${brand}`);
  }
  return lines.join("\n");
}

export type CarouselAngleRequiredValidBriefs = 1 | 3;

export type AcceptedCarouselBriefSummary = {
  title: string;
  angleType: string;
};

function normalizeBriefIdentityPart(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

export function carouselBriefIdentityKey(brief: CarouselCreativeBrief): string {
  return [
    brief.title,
    brief.angleType,
    brief.contentFormat,
    brief.centralInsight,
  ]
    .map(normalizeBriefIdentityPart)
    .join("\u0001");
}

export function mergeValidCarouselBriefs(
  first: CarouselCreativeBrief[],
  repaired: CarouselCreativeBrief[]
): CarouselCreativeBrief[] {
  const seen = new Set<string>();
  const merged: CarouselCreativeBrief[] = [];
  for (const brief of [...first, ...repaired]) {
    const key = carouselBriefIdentityKey(brief);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(brief);
  }
  return merged;
}

function reindexCarouselBriefs(
  briefs: CarouselCreativeBrief[]
): CarouselCreativeBrief[] {
  return briefs.map((brief, index) => ({
    ...brief,
    id: assignCarouselBriefId(index),
  }));
}

function semanticIssueCode(issue: string): string {
  if (issue === "Brief must contain exactly one final closing") {
    return "missing_final_closing";
  }
  if (issue === "Brief has multiple competing endings") {
    return "competing_endings";
  }
  if (issue === "Duplicated closing language") {
    return "duplicated_closing";
  }
  if (issue.startsWith("Repeated objective creates a filler slide")) {
    return "repeated_objective";
  }
  if (/^Fix \d+ exists without Problem\/Leak \d+$/.test(issue)) {
    return "fix_without_problem";
  }
  if (/^Fix \d+ appears before Leak \d+$/.test(issue)) {
    return "fix_before_leak";
  }
  if (/^The hook promises \d+ items but fewer than \d+ are outlined$/.test(issue)) {
    return "promised_count_mismatch";
  }
  if (/^A summary claims \d+ solutions that were not introduced$/.test(issue)) {
    return "unintroduced_solutions";
  }
  if (issue === "The brief changed the promised item type") {
    return "list_type_changed";
  }
  if (issue === "The hook changed the promised item count") {
    return "list_count_changed";
  }
  if (/^The outline has more than \d+ item slides$/.test(issue)) {
    return "promised_count_mismatch";
  }
  if (issue === "A context or closing slide consumed a list item number") {
    return "non_item_consumed_index";
  }
  if (/^Item numbering must run exactly 1 through \d+$/.test(issue)) {
    return "list_numbering_invalid";
  }
  if (issue === "Slide titles use a different item type than the hook promised") {
    return "list_type_changed";
  }
  if (issue === "Simple listicles should not include a standalone context slide") {
    return "standalone_context_on_listicle";
  }
  return "semantic_invalid";
}

function semanticIssuesByCandidate(
  attempt: "first" | "repair",
  briefs: CarouselCreativeBrief[],
  listContract?: CarouselListContract | null
): SemanticIssuesByCandidate[] {
  return briefs.flatMap((brief, candidateIndex) => {
    const codes = validateCarouselBriefSemantics(brief, listContract).map(
      semanticIssueCode
    );
    if (codes.length === 0) return [];
    return [{ attempt, candidateIndex, codes }];
  });
}

export function buildCarouselAnglesRepairNote(
  validCount: number,
  semanticIssues: string[] = [],
  options?: {
    missingCount?: number;
    acceptedBriefs?: AcceptedCarouselBriefSummary[];
    listContract?: CarouselListContract | null;
  }
): string {
  const base = `Expected exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} valid creative briefs, each with kicker, title, description, topic, inferredAudience, contentGoal, contentFormat, angleType, hook, corePromise, centralInsight, ${CAROUSEL_BRIEF_KEY_POINTS_MIN}-${CAROUSEL_BRIEF_KEY_POINTS_MAX} keyPoints, slideOutline length equal to estimatedSlideCount (${CAROUSEL_STUDIO_MIN_SLIDES}-${CAROUSEL_STUDIO_MAX_SLIDES}), matching contentFormat and layoutFamily, claimRisk, researchMode, ctaDirection, component scores, and confidence. Do not include id, schemaVersion, or overall. Numbered problem-solution briefs must include every promised leak/problem before its fix, must not claim N plugs that were never outlined, must have exactly one final closing, and that closing must be a cta or takeaway last slide with no competing endings. Got ${validCount} valid briefs.`;
  const parts = [base];
  const missingCount = options?.missingCount;
  const accepted = options?.acceptedBriefs ?? [];
  if (missingCount != null && missingCount > 0) {
    parts.push(
      `Need ${missingCount} additional distinct brief${missingCount === 1 ? "" : "s"}.`
    );
  }
  if (accepted.length > 0) {
    const acceptedList = accepted
      .map((brief) => `"${brief.title}" (${brief.angleType})`)
      .join(", ");
    parts.push(`Already accepted: ${acceptedList}.`);
    parts.push(
      "Generate distinct replacements. Do not repeat accepted strategies."
    );
  }
  if (semanticIssues.length > 0) {
    parts.push(`Semantic issues to fix: ${semanticIssues.join(" ")}`);
  }
  const listContract = options?.listContract;
  if (listContract?.explicitListContract) {
    parts.push(
      `Preserve the explicit list contract: exactly ${listContract.promisedCount} ${listContract.promisedItemType}. Do not change the item type or count. Only promised item slides may use listItemIndex 1 through ${listContract.promisedCount}. Straightforward listicles are cover plus ${listContract.promisedCount} items plus one closing. Do not add a standalone context slide.`
    );
  } else {
    parts.push(INVENTED_LIST_REPAIR_CONTRACT);
  }
  return parts.join(" ");
}

export function compactCandidateIdentityKey(
  candidate: Pick<CarouselAngleCandidate, "title" | "angleType" | "centralInsight">
): string {
  return [candidate.title, candidate.angleType, candidate.centralInsight]
    .map(normalizeBriefIdentityPart)
    .join("\u0001");
}

export function mergeCompactCandidates(
  first: CarouselAngleCandidate[],
  repaired: CarouselAngleCandidate[]
): CarouselAngleCandidate[] {
  const seen = new Set<string>();
  const merged: CarouselAngleCandidate[] = [];
  for (const candidate of [...first, ...repaired]) {
    const key = compactCandidateIdentityKey(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(candidate);
    if (merged.length >= CAROUSEL_STUDIO_ANGLE_COUNT) break;
  }
  return merged;
}

export function buildCarouselAngleCandidatesRepairNote(args: {
  missingCount: number;
  accepted: Array<{ title: string; angleType: string }>;
  listContract?: CarouselListContract | null;
}): string {
  const parts = [
    `Target exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} distinct compact candidates before expansion.`,
    `Need ${args.missingCount} additional distinct compact candidate${args.missingCount === 1 ? "" : "s"}.`,
  ];
  if (args.accepted.length > 0) {
    const acceptedList = args.accepted
      .map((candidate) => `"${candidate.title}" (${candidate.angleType})`)
      .join(", ");
    parts.push(`Already accepted: ${acceptedList}.`);
    parts.push(
      "Do not duplicate an existing strategy. Change angleType, core promise, or central insight."
    );
  }
  parts.push(
    "Return compact candidates only. Do not write keyPoints, slideOutline, or finished copy."
  );
  const listContract = args.listContract;
  if (listContract?.explicitListContract) {
    parts.push(
      `Preserve the explicit list contract: exactly ${listContract.promisedCount} ${listContract.promisedItemType}.`
    );
  }
  return parts.join(" ");
}

const EXPANSION_REQUIRED_STRING_FIELDS = [
  "kicker",
  "title",
  "description",
  "topic",
  "inferredAudience",
  "audienceReasoning",
  "hook",
  "corePromise",
  "centralInsight",
  "visualDirection",
  "imageDirection",
  "ctaDirection",
] as const;

function rawTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

export function explainCarouselBriefNormalizeFailure(rawBrief: unknown): string[] {
  if (!rawBrief || typeof rawBrief !== "object" || Array.isArray(rawBrief)) {
    return ["schema/parse failure: expansion brief is missing or not an object"];
  }
  const row = rawBrief as Record<string, unknown>;
  const issues: string[] = [];
  for (const key of EXPANSION_REQUIRED_STRING_FIELDS) {
    if (!rawTrimmedString(row[key])) {
      issues.push(`schema/parse failure: missing required field ${key}`);
    }
  }
  if (!includesUnion(CAROUSEL_CONTENT_GOALS, row.contentGoal)) {
    issues.push("schema/parse failure: invalid contentGoal");
  }
  if (!includesUnion(CAROUSEL_CONTENT_FORMATS, row.contentFormat)) {
    issues.push("schema/parse failure: invalid contentFormat");
  }
  if (!includesUnion(CAROUSEL_ANGLE_TYPES, row.angleType)) {
    issues.push("schema/parse failure: invalid angleType");
  }
  if (!includesUnion(CAROUSEL_LAYOUT_FAMILIES, row.layoutFamily)) {
    issues.push("schema/parse failure: invalid layoutFamily");
  }
  if (
    typeof row.contentFormat === "string" &&
    typeof row.layoutFamily === "string" &&
    row.contentFormat !== row.layoutFamily
  ) {
    issues.push(
      `contentFormat/layoutFamily mismatch: contentFormat=${row.contentFormat} layoutFamily=${row.layoutFamily}`
    );
  }
  const keyPoints = Array.isArray(row.keyPoints) ? row.keyPoints : [];
  if (
    keyPoints.length < CAROUSEL_BRIEF_KEY_POINTS_MIN ||
    keyPoints.length > CAROUSEL_BRIEF_KEY_POINTS_MAX
  ) {
    issues.push(
      `keyPoint bounds: got ${keyPoints.length}, need ${CAROUSEL_BRIEF_KEY_POINTS_MIN}-${CAROUSEL_BRIEF_KEY_POINTS_MAX}`
    );
  }
  const estimated =
    typeof row.estimatedSlideCount === "number"
      ? row.estimatedSlideCount
      : Number(row.estimatedSlideCount);
  const outline = Array.isArray(row.slideOutline) ? row.slideOutline : [];
  if (
    !Number.isInteger(estimated) ||
    estimated < CAROUSEL_STUDIO_MIN_SLIDES ||
    estimated > CAROUSEL_STUDIO_MAX_SLIDES
  ) {
    issues.push(
      `schema/parse failure: estimatedSlideCount ${String(row.estimatedSlideCount)} is out of range`
    );
  } else if (outline.length !== estimated) {
    issues.push(
      `slideOutline length mismatch: got ${outline.length}, estimatedSlideCount ${estimated}`
    );
  }
  const invalidRoles: string[] = [];
  for (const item of outline) {
    if (!item || typeof item !== "object") continue;
    const role = (item as Record<string, unknown>).role;
    if (typeof role === "string" && !includesUnion(CAROUSEL_SLIDE_ROLES, role)) {
      invalidRoles.push(role);
    }
  }
  if (invalidRoles.length > 0) {
    issues.push(
      `unsupported structural ending or role: ${invalidRoles.join(", ")}`
    );
  }
  if (issues.length === 0) {
    issues.push("schema/parse failure: normalizeGeneratedCarouselBrief returned null");
  }
  return issues;
}

const NON_LIST_ITEM_ROLES = new Set([
  "hook",
  "context",
  "example",
  "comparison",
  "takeaway",
  "cta",
]);

export function alignExpansionListItemIndexes(
  brief: CarouselCreativeBrief
): CarouselCreativeBrief {
  return {
    ...brief,
    slideOutline: brief.slideOutline.map((slide) =>
      NON_LIST_ITEM_ROLES.has(slide.role) && slide.listItemIndex != null
        ? { ...slide, listItemIndex: null }
        : slide
    ),
  };
}

export function classifyCarouselAngleExpansionAttempt(
  rawBrief: unknown,
  listContract?: CarouselListContract | null
): { normalized: boolean; issues: string[] } {
  const normalized = normalizeGeneratedCarouselBrief(rawBrief, 0);
  if (!normalized) {
    return {
      normalized: false,
      issues: explainCarouselBriefNormalizeFailure(rawBrief),
    };
  }
  const aligned = alignExpansionListItemIndexes(normalized);
  return {
    normalized: true,
    issues: validateCarouselBriefSemantics(aligned, listContract),
  };
}

export function buildCarouselAngleExpansionRepairNote(
  semanticIssues: string[] = [],
  options?: {
    listContract?: CarouselListContract | null;
  }
): string {
  const parts = [
    "The complete creative brief failed validation.",
    `Return one full corrected brief with kicker, title, description, topic, inferredAudience, audienceReasoning, contentGoal, contentFormat, angleType, hook, corePromise, centralInsight, ${CAROUSEL_BRIEF_KEY_POINTS_MIN}-${CAROUSEL_BRIEF_KEY_POINTS_MAX} keyPoints, slideOutline length equal to estimatedSlideCount (${CAROUSEL_STUDIO_MIN_SLIDES}-${CAROUSEL_STUDIO_MAX_SLIDES}), matching contentFormat and layoutFamily, visualDirection, imageDirection, claimRisk, researchMode, evidenceRequirements, prohibitedClaims, ctaDirection, component scores, and confidence.`,
    "Honor the original candidate strategic direction. Do not switch to a different strategy.",
    "Numbered problem-solution briefs must include every promised leak/problem before its fix, must not claim N plugs that were never outlined, must have exactly one final closing, and that closing must be a cta or takeaway last slide with no competing endings.",
    COMPETING_ENDINGS_REPAIR_CONTRACT,
  ];
  if (semanticIssues.length > 0) {
    parts.push(`Semantic issues to fix: ${semanticIssues.join(" ")}`);
  }
  const listContract = options?.listContract;
  if (listContract?.explicitListContract) {
    parts.push(
      `Preserve the explicit list contract: exactly ${listContract.promisedCount} ${listContract.promisedItemType}. Do not change the item type or count. Only promised item slides may use listItemIndex 1 through ${listContract.promisedCount}. Straightforward listicles are cover plus ${listContract.promisedCount} items plus one closing. Do not add a standalone context slide.`
    );
  } else {
    parts.push(INVENTED_LIST_REPAIR_CONTRACT);
  }
  return parts.join(" ");
}

async function invokeCarouselAnglesOnce(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  repairNote?: string;
}): Promise<{
  briefs: CarouselCreativeBrief[];
  allNormalized: CarouselCreativeBrief[];
  semanticIssues: string[];
  rawCandidateCount: number;
  normalizedCandidateCount: number;
  listContract: CarouselListContract | null;
}> {
  const schema = buildCarouselAnglesJsonSchema();
  const listContract = detectExplicitCarouselListContract(args.sourceContent);
  const basePrompt = buildCarouselAnglesUserPrompt({
    sourceContent: args.sourceContent,
    niche: args.niche,
    brandVoice: args.brandVoice,
    listContract,
  });
  const userPrompt = args.repairNote
    ? `${basePrompt}\n\nPREVIOUS OUTPUT FAILED VALIDATION. Fix ONLY these issues and return a full corrected payload:\n${args.repairNote}`
    : basePrompt;

  const response = await invokeLLM({
    operation: "angle_generation",
    repairIteration: args.repairNote ? 1 : 0,
    messages: [
      {
        role: "system",
        content: buildCarouselAnglesSystemPrompt(),
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
  });

  const raw = String(response.choices[0]?.message?.content ?? "");
  const parsed = parseLlmJson<BriefsLlmPayload>(raw, { angles: [] });
  const rawAngles = Array.isArray(parsed.angles) ? parsed.angles : [];
  const normalized = normalizeGeneratedCarouselBriefs(parsed.angles);
  const selected = selectSemanticallyValidCarouselBriefs(
    normalized,
    listContract
  );
  return {
    ...selected,
    allNormalized: normalized,
    rawCandidateCount: rawAngles.length,
    normalizedCandidateCount: normalized.length,
    listContract,
  };
}

function trimCandidateSentence(value: unknown, maxLen: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function normalizeGeneratedCarouselAngleCandidate(
  value: unknown
): CarouselAngleCandidate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const kicker = trimCandidateSentence(row.kicker, 80);
  const title = trimCandidateSentence(row.title, 120);
  const description = trimCandidateSentence(row.description, 240);
  const topic = trimCandidateSentence(row.topic, 120);
  const inferredAudience = trimCandidateSentence(row.inferredAudience, 120);
  const hook = trimCandidateSentence(row.hook, 160);
  const corePromise = trimCandidateSentence(row.corePromise, 240);
  const centralInsight = trimCandidateSentence(row.centralInsight, 240);
  const estimatedSlideCount = clampStudioSlideCount(row.estimatedSlideCount);
  if (
    !kicker ||
    !title ||
    !description ||
    !topic ||
    !inferredAudience ||
    !hook ||
    !corePromise ||
    !centralInsight ||
    estimatedSlideCount == null
  ) {
    return null;
  }
  if (!includesUnion(CAROUSEL_CONTENT_GOALS, row.contentGoal)) return null;
  if (!includesUnion(CAROUSEL_CONTENT_FORMATS, row.contentFormat)) return null;
  if (!includesUnion(CAROUSEL_ANGLE_TYPES, row.angleType)) return null;
  if (!includesUnion(CAROUSEL_LAYOUT_FAMILIES, row.layoutFamily)) return null;
  if (row.contentFormat !== row.layoutFamily) return null;
  if (!includesUnion(CAROUSEL_CLAIM_RISKS, row.claimRisk)) return null;
  if (!includesUnion(CAROUSEL_RESEARCH_MODES, row.researchMode)) return null;
  const scoresRaw =
    row.scores && typeof row.scores === "object"
      ? (row.scores as Record<string, unknown>)
      : {};
  return {
    kicker,
    title,
    description,
    estimatedSlideCount,
    topic,
    inferredAudience,
    contentGoal: row.contentGoal,
    contentFormat: row.contentFormat,
    angleType: row.angleType,
    hook,
    corePromise,
    centralInsight,
    layoutFamily: row.layoutFamily,
    claimRisk: row.claimRisk,
    researchMode: row.researchMode,
    scores: scoreCarouselCreativeBrief(scoresRaw),
    confidence:
      typeof row.confidence === "number" && Number.isFinite(row.confidence)
        ? Math.min(1, Math.max(0, row.confidence))
        : 0,
  };
}

export function selectValidCarouselAngleCandidates(
  raw: unknown,
  listContract: CarouselListContract | null
): {
  candidates: CarouselAngleCandidate[];
  rawCandidateCount: number;
  semanticIssues: string[];
} {
  const list = Array.isArray(raw) ? raw : [];
  const candidates: CarouselAngleCandidate[] = [];
  const semanticIssues: string[] = [];
  for (const item of list) {
    let candidate = normalizeGeneratedCarouselAngleCandidate(item);
    if (!candidate) continue;
    if (listContract?.explicitListContract) {
      candidate = {
        ...candidate,
        estimatedSlideCount: expectedExplicitListicleSlideCount(
          listContract.promisedCount
        ),
      };
    }
    candidates.push(candidate);
    if (candidates.length >= CAROUSEL_STUDIO_ANGLE_COUNT) break;
  }
  return {
    candidates,
    rawCandidateCount: list.length,
    semanticIssues,
  };
}

async function invokeCarouselAngleCandidatesOnce(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  model?: string;
  repairNote?: string;
}): Promise<{
  candidates: CarouselAngleCandidate[];
  semanticIssues: string[];
  rawCandidateCount: number;
  listContract: CarouselListContract | null;
  telemetry: AngleCallTelemetry;
}> {
  const listContract = detectExplicitCarouselListContract(args.sourceContent);
  const system = buildCarouselAngleCandidatesSystemPrompt();
  const basePrompt = buildCarouselAngleCandidatesUserPrompt({
    sourceContent: args.sourceContent,
    niche: args.niche,
    brandVoice: args.brandVoice,
    listContract,
  });
  const user = args.repairNote
    ? `${basePrompt}\n\nPREVIOUS OUTPUT DID NOT PRODUCE ${CAROUSEL_STUDIO_ANGLE_COUNT} DISTINCT COMPACT CANDIDATES. Fix ONLY the shortfall:\n${args.repairNote}`
    : basePrompt;
  const startedAt = performance.now();
  const response = await invokeLLM({
    operation: "angle_generation",
    repairIteration: args.repairNote ? 1 : 0,
    maxTokens: COMPACT_CANDIDATE_MAX_TOKENS,
    model: args.model ?? resolveCompactCandidateModel(args.sourceContent, listContract),
    messages: [
      {
        role: "system",
        content: system,
      },
      {
        role: "user",
        content: user,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: buildCarouselAngleCandidatesJsonSchema(listContract),
    },
  });
  const tokens = llmTokenUsage(response);
  const raw = String(response.choices[0]?.message?.content ?? "");
  const parsed = parseLlmJson<BriefsLlmPayload>(raw, { angles: [] });
  const rawAngles = Array.isArray(parsed.angles) ? parsed.angles : [];
  const compact = selectValidCarouselAngleCandidates(rawAngles, listContract);
  return {
    candidates: compact.candidates,
    semanticIssues: compact.semanticIssues,
    rawCandidateCount: compact.rawCandidateCount,
    listContract,
    telemetry: {
      inputCharacterCount: system.length + user.length,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
  };
}

async function invokeCarouselAngleFullBriefExpansionOnce(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  candidate: CarouselAngleCandidate;
  model?: string;
  repairNote?: string;
}): Promise<{
  briefs: CarouselCreativeBrief[];
  allNormalized: CarouselCreativeBrief[];
  semanticIssues: string[];
  listContract: CarouselListContract | null;
  classification: { normalized: boolean; issues: string[] };
  telemetry: AngleCallTelemetry;
}> {
  const listContract = detectExplicitCarouselListContract(args.sourceContent);
  const system = buildCarouselAngleExpansionSystemPrompt();
  const basePrompt = buildCarouselAngleExpansionUserPrompt({
    sourceContent: args.sourceContent,
    niche: args.niche,
    brandVoice: args.brandVoice,
    listContract,
    candidate: args.candidate,
  });
  const user = args.repairNote
    ? `${basePrompt}\n\nPREVIOUS OUTPUT FAILED VALIDATION. Fix ONLY these issues and return one complete corrected brief:\n${args.repairNote}`
    : basePrompt;
  const startedAt = performance.now();
  const response = await invokeLLM({
    operation: "angle_generation",
    repairIteration: args.repairNote ? 1 : 0,
    model: args.model ?? ANGLE_EXPANSION_MODEL,
    messages: [
      {
        role: "system",
        content: system,
      },
      {
        role: "user",
        content: user,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: buildCarouselAngleFullBriefExpansionJsonSchema(),
    },
  });
  const tokens = llmTokenUsage(response);
  const raw = String(response.choices[0]?.message?.content ?? "");
  const parsed = parseLlmJson<FullBriefLlmPayload>(raw, {});
  const classification = classifyCarouselAngleExpansionAttempt(
    parsed.brief,
    listContract
  );
  const normalizedRaw = normalizeGeneratedCarouselBrief(parsed.brief, 0);
  const normalized = normalizedRaw
    ? alignExpansionListItemIndexes(normalizedRaw)
    : null;
  const allNormalized = normalized ? [normalized] : [];
  const selected = selectSemanticallyValidCarouselBriefs(
    allNormalized,
    listContract
  );
  return {
    ...selected,
    allNormalized,
    listContract,
    classification,
    telemetry: {
      inputCharacterCount: system.length + user.length,
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
  };
}

function expansionAttemptMetrics(
  telemetry: AngleCallTelemetry,
  issues: string[]
): ExpansionAttemptMetrics {
  return {
    inputCharacterCount: telemetry.inputCharacterCount,
    inputTokens: telemetry.inputTokens,
    outputTokens: telemetry.outputTokens,
    durationMs: telemetry.durationMs,
    issues,
  };
}

async function expandOneCandidateWithRepair(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  candidate: CarouselAngleCandidate;
  candidateIndex: number;
  model?: string;
}): Promise<{
  briefs: CarouselCreativeBrief[];
  allNormalized: CarouselCreativeBrief[];
  firstPassValid: boolean;
  repairRan: boolean;
  semanticIssues: SemanticIssuesByCandidate[];
  metrics: ExpansionSubstageMetrics;
}> {
  const model = args.model ?? ANGLE_EXPANSION_MODEL;
  const semanticIssues: SemanticIssuesByCandidate[] = [];
  const first = await invokeCarouselAngleFullBriefExpansionOnce({
    sourceContent: args.sourceContent,
    niche: args.niche,
    brandVoice: args.brandVoice,
    candidate: args.candidate,
    model,
  });
  semanticIssues.push(
    ...semanticIssuesByCandidate(
      "first",
      first.allNormalized,
      first.listContract
    ).map((row) => ({ ...row, candidateIndex: args.candidateIndex }))
  );
  const firstPassValid = first.briefs.length > 0;
  const firstPass = expansionAttemptMetrics(
    first.telemetry,
    first.classification.issues
  );
  let repair: ExpansionAttemptMetrics | null = null;
  let repairRan = false;
  let resolved = first;
  if (!firstPassValid) {
    repairRan = true;
    const repaired = await invokeCarouselAngleFullBriefExpansionOnce({
      sourceContent: args.sourceContent,
      niche: args.niche,
      brandVoice: args.brandVoice,
      candidate: args.candidate,
      model,
      repairNote: buildCarouselAngleExpansionRepairNote(
        first.classification.issues.length > 0
          ? first.classification.issues
          : first.semanticIssues,
        {
          listContract: first.listContract,
        }
      ),
    });
    semanticIssues.push(
      ...semanticIssuesByCandidate(
        "repair",
        repaired.allNormalized,
        repaired.listContract
      ).map((row) => ({ ...row, candidateIndex: args.candidateIndex }))
    );
    repair = expansionAttemptMetrics(
      repaired.telemetry,
      repaired.classification.issues
    );
    resolved = repaired;
  }
  return {
    briefs: resolved.briefs,
    allNormalized: resolved.allNormalized,
    firstPassValid,
    repairRan,
    semanticIssues,
    metrics: {
      candidateIndex: args.candidateIndex,
      model,
      inputCharacterCount:
        first.telemetry.inputCharacterCount +
        (repair?.inputCharacterCount ?? 0),
      inputTokens:
        first.telemetry.inputTokens != null &&
        (repair == null || repair.inputTokens != null)
          ? first.telemetry.inputTokens + (repair?.inputTokens ?? 0)
          : first.telemetry.inputTokens ?? repair?.inputTokens ?? null,
      outputTokens:
        first.telemetry.outputTokens != null &&
        (repair == null || repair.outputTokens != null)
          ? first.telemetry.outputTokens + (repair?.outputTokens ?? 0)
          : first.telemetry.outputTokens ?? repair?.outputTokens ?? null,
      durationMs:
        first.telemetry.durationMs + (repair?.durationMs ?? 0),
      firstPassValid,
      repairRan,
      firstPass,
      repair,
    },
  };
}

/**
 * Propose creative briefs from source content.
 * requiredValidBriefs defaults to 3 (Review Plan). Auto generateFromInput uses 1.
 * Auto path: target exactly 3 compact candidates, then expand every candidate
 * into a full brief concurrently. Rank only after developed full briefs exist.
 * Review Plan: one 3-brief call. At most one repair call.
 */
export async function generateCarouselAngles(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  correlationId?: string;
  entryPoint?: string;
  requiredValidBriefs?: CarouselAngleRequiredValidBriefs;
  compactModel?: string;
  expansionModel?: string;
}): Promise<CarouselCreativeBrief[]> {
  const sourceContent = args.sourceContent.trim();
  const niche = args.niche?.trim() || undefined;
  if (!sourceContent) {
    throw new Error("sourceContent is required to generate carousel angles.");
  }

  const requiredValidBriefs: CarouselAngleRequiredValidBriefs =
    args.requiredValidBriefs === 1 ? 1 : 3;
  const compactModel =
    args.compactModel?.trim() || resolveCompactCandidateModel(sourceContent);
  const expansionModel = args.expansionModel?.trim() || ANGLE_EXPANSION_MODEL;
  const requestedModel =
    requiredValidBriefs === 1 ? expansionModel : ANGLE_REVIEW_PLAN_MODEL;
  const correlationId = resolveAngleGenerationCorrelationId(args.correlationId);
  const startedAt = performance.now();
  let repairRan = false;
  let repairIteration = 0;
  let rawCandidateCount: number | null = null;
  let normalizedCandidateCount = 0;
  let acceptedSemanticCandidateCount = 0;

  logAngleGenerationStarted({
    entryPoint: resolveAngleGenerationEntryPoint(args.entryPoint),
    correlationId,
    sourceCharacterCount: sourceContent.length,
    hasNicheOverride: Boolean(niche),
    hasBrandVoice: Boolean(args.brandVoice?.trim()),
    timestamp: new Date().toISOString(),
  });

  try {
    const loggedIssues: SemanticIssuesByCandidate[] = [];
    let firstAttemptValidCount = 0;
    let repairAttemptValidCount = 0;
    let mergedValidCount = 0;
    let angleGenerationMode: CarouselAngleGenerationMode = "full_briefs";
    let expansionRan = false;
    let compactCandidateCount: number | null = null;
    let repairReason: string | null = null;
    let merged: CarouselCreativeBrief[] = [];
    let compactMetrics: CompactSubstageMetrics | null = null;
    let compactRepairMetrics: CompactSubstageMetrics | null = null;
    let expansionMetrics: ExpansionSubstageMetrics[] | null = null;
    let parallelExpansionWallClockMs: number | null = null;
    let compactRepairRan = false;
    let degradedToReviewPlanFallback = false;
    const targetCompactCandidateCount = CAROUSEL_STUDIO_ANGLE_COUNT;
    const targetFullBriefCount = CAROUSEL_STUDIO_ANGLE_COUNT;

    if (requiredValidBriefs === 1) {
      angleGenerationMode = "parallel_full_expansions";
      let compact = await invokeCarouselAngleCandidatesOnce({
        sourceContent,
        niche,
        brandVoice: args.brandVoice,
        model: compactModel,
      });
      rawCandidateCount = compact.rawCandidateCount;
      compactCandidateCount = compact.candidates.length;
      compactMetrics = {
        inputCharacterCount: compact.telemetry.inputCharacterCount,
        inputTokens: compact.telemetry.inputTokens,
        outputTokens: compact.telemetry.outputTokens,
        durationMs: compact.telemetry.durationMs,
        rawCandidateCount: compact.rawCandidateCount,
        validCompactCandidateCount: compact.candidates.length,
      };
      logAngleSubstageCompleted({
        correlationId,
        substage: "compact",
        ...compactMetrics,
      });

      if (compact.candidates.length < targetCompactCandidateCount) {
        const missingCount = Math.max(
          0,
          targetCompactCandidateCount - compact.candidates.length
        );
        const repairedCompact = await invokeCarouselAngleCandidatesOnce({
          sourceContent,
          niche,
          brandVoice: args.brandVoice,
          model: compactModel,
          repairNote: buildCarouselAngleCandidatesRepairNote({
            missingCount,
            accepted: compact.candidates.map((candidate) => ({
              title: candidate.title,
              angleType: candidate.angleType,
            })),
            listContract: compact.listContract,
          }),
        });
        compactRepairRan = true;
        repairRan = true;
        repairIteration = 1;
        repairReason =
          compact.candidates.length === 0
            ? "missing_compact_candidates"
            : "compact_shortfall";
        compactRepairMetrics = {
          inputCharacterCount: repairedCompact.telemetry.inputCharacterCount,
          inputTokens: repairedCompact.telemetry.inputTokens,
          outputTokens: repairedCompact.telemetry.outputTokens,
          durationMs: repairedCompact.telemetry.durationMs,
          rawCandidateCount: repairedCompact.rawCandidateCount,
          validCompactCandidateCount: repairedCompact.candidates.length,
        };
        logAngleSubstageCompleted({
          correlationId,
          substage: "compact",
          ...compactRepairMetrics,
        });
        compact = {
          ...compact,
          candidates: mergeCompactCandidates(
            compact.candidates,
            repairedCompact.candidates
          ),
          rawCandidateCount:
            compact.rawCandidateCount + repairedCompact.rawCandidateCount,
          semanticIssues: [
            ...compact.semanticIssues,
            ...repairedCompact.semanticIssues,
          ],
        };
        rawCandidateCount = compact.rawCandidateCount;
        compactCandidateCount = compact.candidates.length;
      }

      if (compact.candidates.length === 0) {
        const fallback = await invokeCarouselAnglesOnce({
          sourceContent,
          niche,
          brandVoice: args.brandVoice,
          repairNote: buildCarouselAnglesRepairNote(0, compact.semanticIssues, {
            listContract: compact.listContract,
          }),
        });
        repairRan = true;
        repairIteration = 1;
        repairReason = "zero_compact_candidates_after_repair";
        degradedToReviewPlanFallback = true;
        firstAttemptValidCount = 0;
        repairAttemptValidCount = fallback.briefs.length;
        rawCandidateCount =
          (rawCandidateCount ?? 0) + fallback.rawCandidateCount;
        normalizedCandidateCount = fallback.normalizedCandidateCount;
        merged = fallback.briefs;
        loggedIssues.push(
          ...semanticIssuesByCandidate(
            "repair",
            fallback.allNormalized,
            fallback.listContract
          )
        );
      } else {
        expansionRan = true;
        const expansionStartedAt = performance.now();
        const toExpand = compact.candidates.slice(0, targetFullBriefCount);
        const expansions = await Promise.all(
          toExpand.map((candidate, candidateIndex) =>
            expandOneCandidateWithRepair({
              sourceContent,
              niche,
              brandVoice: args.brandVoice,
              candidate,
              candidateIndex,
              model: expansionModel,
            }).catch(() => ({
              briefs: [] as CarouselCreativeBrief[],
              allNormalized: [] as CarouselCreativeBrief[],
              firstPassValid: false,
              repairRan: false,
              semanticIssues: [] as SemanticIssuesByCandidate[],
              metrics: {
                candidateIndex,
                model: expansionModel,
                inputCharacterCount: 0,
                inputTokens: null,
                outputTokens: null,
                durationMs: 0,
                firstPassValid: false,
                repairRan: false,
                firstPass: {
                  inputCharacterCount: 0,
                  inputTokens: null,
                  outputTokens: null,
                  durationMs: 0,
                  issues: ["schema/parse failure: expansion call failed"],
                },
                repair: null,
              } satisfies ExpansionSubstageMetrics,
            }))
          )
        );
        parallelExpansionWallClockMs = Math.max(
          0,
          Math.round(performance.now() - expansionStartedAt)
        );
        expansionMetrics = expansions.map((row) => row.metrics);
        for (const row of expansions) {
          logAngleSubstageCompleted({
            correlationId,
            substage: "expansion",
            inputCharacterCount: row.metrics.inputCharacterCount,
            inputTokens: row.metrics.inputTokens,
            outputTokens: row.metrics.outputTokens,
            durationMs: row.metrics.durationMs,
            candidateIndex: row.metrics.candidateIndex,
            firstPassValid: row.metrics.firstPassValid,
            repairRan: row.metrics.repairRan,
          });
          loggedIssues.push(...row.semanticIssues);
          normalizedCandidateCount += row.allNormalized.length;
          if (row.firstPassValid) firstAttemptValidCount += 1;
          if (row.repairRan) {
            repairRan = true;
            repairIteration = 1;
            if (row.briefs.length > 0) repairAttemptValidCount += 1;
          }
          merged.push(...row.briefs);
        }
        if (repairRan) repairReason = "expansion_invalid";
      }
    } else {
      const first = await invokeCarouselAnglesOnce({
        sourceContent,
        niche,
        brandVoice: args.brandVoice,
      });
      rawCandidateCount = first.rawCandidateCount;
      normalizedCandidateCount = first.normalizedCandidateCount;

      const firstValid = first.briefs;
      firstAttemptValidCount = firstValid.length;
      loggedIssues.push(
        ...semanticIssuesByCandidate(
          "first",
          first.allNormalized,
          first.listContract
        )
      );

      let repairValid: CarouselCreativeBrief[] = [];
      if (firstAttemptValidCount < CAROUSEL_STUDIO_ANGLE_COUNT) {
        repairRan = true;
        repairIteration = 1;
        repairReason = "missing_review_briefs";
        const missingCount = Math.max(
          0,
          CAROUSEL_STUDIO_ANGLE_COUNT - firstAttemptValidCount
        );
        const repaired = await invokeCarouselAnglesOnce({
          sourceContent,
          niche,
          brandVoice: args.brandVoice,
          repairNote: buildCarouselAnglesRepairNote(
            firstAttemptValidCount,
            first.semanticIssues,
            {
              missingCount,
              acceptedBriefs: firstValid.map((brief) => ({
                title: brief.title,
                angleType: brief.angleType,
              })),
              listContract: first.listContract,
            }
          ),
        });
        repairValid = repaired.briefs;
        repairAttemptValidCount = repairValid.length;
        rawCandidateCount = first.rawCandidateCount + repaired.rawCandidateCount;
        normalizedCandidateCount =
          first.normalizedCandidateCount + repaired.normalizedCandidateCount;
        loggedIssues.push(
          ...semanticIssuesByCandidate(
            "repair",
            repaired.allNormalized,
            repaired.listContract
          )
        );
      }

      merged = repairRan
        ? mergeValidCarouselBriefs(firstValid, repairValid)
        : firstValid;
    }

    const ranked = rankCarouselCreativeBriefs(
      applyCarouselSourceFormatFitToBriefs(merged, sourceContent)
    ).slice(0, CAROUSEL_STUDIO_ANGLE_COUNT);
    const briefs = reindexCarouselBriefs(ranked);
    mergedValidCount = merged.length;
    acceptedSemanticCandidateCount = briefs.length;
    const completeFullBriefCount = merged.length;
    const fewerThanThreeCompleteFullBriefs =
      requiredValidBriefs === 1 &&
      completeFullBriefCount < targetFullBriefCount;
    const proceededWithGracefulDegradation =
      briefs.length > 0 && briefs.length < CAROUSEL_STUDIO_ANGLE_COUNT;

    if (briefs.length === 0) {
      throw new Error(
        `Expected ${requiredValidBriefs === 1 ? "at least 1" : String(CAROUSEL_STUDIO_ANGLE_COUNT)} carousel briefs, got ${briefs.length}.`
      );
    }

    logAngleGenerationCompleted({
      correlationId,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      rawCandidateCount,
      normalizedCandidateCount,
      acceptedSemanticCandidateCount,
      repairRan,
      firstAttemptValidCount,
      repairAttemptValidCount,
      mergedValidCount,
      requiredValidBriefs,
      proceededWithGracefulDegradation,
      semanticIssuesByCandidate: loggedIssues,
      requestedModel,
      angleGenerationMode,
      expansionRan,
      compactCandidateCount,
      repairReason,
      compact: compactMetrics,
      compactRepair: compactRepairMetrics,
      expansions: expansionMetrics,
      parallelExpansionWallClockMs,
      targetCompactCandidateCount:
        requiredValidBriefs === 1 ? targetCompactCandidateCount : null,
      targetFullBriefCount:
        requiredValidBriefs === 1 ? targetFullBriefCount : CAROUSEL_STUDIO_ANGLE_COUNT,
      compactRepairRan,
      completeFullBriefCount,
      fewerThanThreeCompleteFullBriefs,
      rankedFullBriefCount: briefs.length,
      degradedToReviewPlanFallback,
    });

    return briefs;
  } catch (err) {
    logAngleGenerationFailed({
      correlationId,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      error: err,
      operation: "angle_generation",
      requestedModel,
      repairIteration,
    });
    throw err;
  }
}
