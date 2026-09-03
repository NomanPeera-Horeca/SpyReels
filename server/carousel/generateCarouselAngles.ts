/**
 * Carousel Studio: propose creative briefs from source content.
 * Review Plan: one call for 3 full briefs, plus at most one repair.
 * Auto generateFromInput: compact candidates, then expand the selected brief.
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
  validateCarouselListContractFraming,
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
import { invokeLLM } from "../_core/llm";
import {
  logAngleGenerationCompleted,
  logAngleGenerationFailed,
  logAngleGenerationStarted,
  logAngleSubstageCompleted,
  resolveAngleGenerationCorrelationId,
  resolveAngleGenerationEntryPoint,
  type SemanticIssuesByCandidate,
} from "./angleGenerationObservability";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";

const ANGLE_GENERATION_REQUESTED_MODEL = "claude-sonnet-4-6";
const COMPACT_CANDIDATE_MAX_TOKENS = 2048;
const EXPANSION_MAX_TOKENS = 4096;

type BriefsLlmPayload = {
  angles?: unknown[];
};

type BriefLlmPayload = {
  brief?: unknown;
};

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

export type CarouselAngleGenerationMode = "full_briefs" | "candidates_then_expand";

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
      role: ENUM_STRING(CAROUSEL_SLIDE_ROLES, "Functional role of this planned slide."),
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
                  "Punchy carousel-ready title / hook for this direction (not full slide copy).",
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
                description: "Planned opening hook. Not finished slide copy.",
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
                  "One item per planned slide. Length must equal estimatedSlideCount. Distinct objectives. No full slide copy.",
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

function scoresSchema() {
  return {
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
}

const COMPACT_CANDIDATE_REQUIRED = [
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

function compactListContractFieldNote(
  listContract: CarouselListContract | null | undefined
): string {
  if (!listContract?.explicitListContract) {
    return " If the user message states an explicit list contract, keep that promised count and item type.";
  }
  return ` Keep promised count ${listContract.promisedCount} and item type "${listContract.promisedItemType}". Do not switch taxonomy.`;
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
    scores: scoresSchema(),
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
            required: [...COMPACT_CANDIDATE_REQUIRED],
            additionalProperties: false,
          },
        },
      },
      required: ["angles"],
      additionalProperties: false,
    },
  };
}

export function buildCarouselAngleExpansionJsonSchema(): {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} {
  const full = buildCarouselAnglesJsonSchema();
  const angles = (full.schema.properties as { angles: { items: Record<string, unknown> } })
    .angles;
  return {
    name: "carousel_studio_angle_expansion",
    strict: true,
    schema: {
      type: "object",
      properties: {
        brief: {
          ...angles.items,
          description:
            "One complete production-ready creative brief for the selected candidate. Do not include id, schemaVersion, or overall score.",
        },
      },
      required: ["brief"],
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
      "You are a SpyReels carousel strategist. Expand exactly one already-selected candidate into one complete production-ready creative brief as structured tool output only.",
      "Do not propose alternative strategies.",
      "Preserve the selected strategy.",
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
    `Every candidate must honor this contract. Strategies may differ in hook, insight, and framing, but not in item type, count, or cover-plus-items-plus-closing structure.`,
    `Default structure: cover, then ${promisedCount} ${promisedItemType} item slides, then one final closing. estimatedSlideCount should be ${slideCount}. Put setup on the cover. Do not insert a standalone context slide.`,
    `Only the ${promisedCount} promised item slides get listItemIndex 1 through ${promisedCount}. Cover, context, example, takeaway, and CTA must set listItemIndex to null. Never derive listItemIndex from physical slide position.`,
  ];
}

function explicitCompactListContractPromptLines(
  listContract: CarouselListContract | null
): string[] {
  if (!listContract) return [];
  const { promisedCount, promisedItemType } = listContract;
  const slideCount = expectedExplicitListicleSlideCount(promisedCount);
  return [
    "EXPLICIT LIST CONTRACT. This is mandatory for every candidate.",
    `promised item type = ${promisedItemType}`,
    `promised count = ${promisedCount}`,
    `estimated slide count = ${slideCount}`,
    `Every candidate must remain a ${promisedCount}-item ${promisedItemType} carousel.`,
    "Candidates may differ by angle or framing, not by taxonomy or count.",
    `Do not replace "${promisedItemType}" with myths, reasons, tips, signs, or any other item type.`,
    `title, hook, and corePromise must each keep the promised count ${promisedCount} and the item type ${promisedItemType}.`,
    `estimatedSlideCount must be ${slideCount}.`,
  ];
}

function explicitSelectedBriefListContractPromptLines(
  listContract: CarouselListContract | null
): string[] {
  if (!listContract) return [];
  const { promisedCount, promisedItemType } = listContract;
  const slideCount = expectedExplicitListicleSlideCount(promisedCount);
  return [
    `EXPLICIT LIST CONTRACT from the user source: promised count ${promisedCount}, promised item type "${promisedItemType}".`,
    `This selected brief must honor the contract. Keep ${promisedCount} ${promisedItemType}. Do not replace "${promisedItemType}" with a different taxonomy such as myths, reasons, tips, or signs.`,
    `Default structure: cover, then ${promisedCount} ${promisedItemType} item slides, then one final closing. estimatedSlideCount should be ${slideCount}. Put setup on the cover. Do not insert a standalone context slide.`,
    `Only the ${promisedCount} promised item slides get listItemIndex 1 through ${promisedCount}. Cover, context, example, takeaway, and CTA must set listItemIndex to null. Never derive listItemIndex from physical slide position.`,
  ];
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

function inventedListContractPromptLines(): string[] {
  return [
    "If you create an enumerated list in the title, hook, corePromise, or centralInsight, that list is a contract: deliver exactly that many item slides of that item type.",
    "Straightforward enumerated listicles use cover, then the N item slides, then one closing. Put setup on the cover. Do not add a standalone context slide.",
    "Only promised item slides get listItemIndex 1 through N. Cover, context, example, takeaway, and CTA stay null.",
  ];
}

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
    "The three candidates should normally represent meaningfully different strategies, such as diagnostic/breakdown, story, and practical framework, unless another combination fits the source better.",
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
  ];
  if (brand) {
    lines.push("", `Brand voice guidance (tone only, not a topic override): ${brand}`);
  }
  return lines.join("\n");
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
    "Candidates should differ by angle or framing, such as diagnostic, story, and practical framing, unless another mix fits the source better.",
    "Do not change the source taxonomy or promised item count when an explicit list contract is present.",
    ...explicitCompactListContractPromptLines(listContract),
    ...(listContract ? [] : inventedListContractPromptLines()),
    "Match contentFormat and layoutFamily.",
    "Classify researchMode only. Do not perform research or add citations.",
    `estimatedSlideCount must be an integer from ${CAROUSEL_STUDIO_MIN_SLIDES} to ${CAROUSEL_STUDIO_MAX_SLIDES}.`,
    "Score relevance, usefulness, specificity, visualPotential, factualSafety, and originality from 0-100. Do not compute overall.",
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
    "Expand ONLY the selected candidate below into one complete production-ready creative brief.",
    "Do not propose other strategies. Do not return multiple briefs.",
    "Preserve its title, angleType, contentFormat, layoutFamily, hook, corePromise, centralInsight, and estimatedSlideCount unless a list contract forces a legal slide count.",
    ...explicitSelectedBriefListContractPromptLines(listContract),
    ...(listContract ? [] : inventedListContractPromptLines()),
    "Decide the core promise and central insight before listing key points.",
    "Select useful, specific key points before any slide writing.",
    "Give every planned slide a distinct objective. Do not repeat the same slide objective.",
    "For numbered problem-solution formats: outline Leak/Problem N before Fix N, include every promised item, and do not summarize N plugs or fixes that were never introduced.",
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
    `This brief needs ${CAROUSEL_BRIEF_KEY_POINTS_MIN}-${CAROUSEL_BRIEF_KEY_POINTS_MAX} keyPoints.`,
    `estimatedSlideCount must be an integer from ${CAROUSEL_STUDIO_MIN_SLIDES} to ${CAROUSEL_STUDIO_MAX_SLIDES}.`,
    "slideOutline length must equal estimatedSlideCount.",
    `evidenceRequirements max ${CAROUSEL_BRIEF_EVIDENCE_MAX}. prohibitedClaims max ${CAROUSEL_BRIEF_PROHIBITED_MAX}.`,
    "Each explanation and objective must be one concise sentence.",
    "Score relevance, usefulness, specificity, visualPotential, factualSafety, and originality from 0-100. Do not compute overall.",
    "",
    "Selected compact candidate:",
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

type AngleCallTelemetry = {
  inputCharacterCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
};

function llmTokenUsage(response: { usage?: { prompt_tokens?: number; completion_tokens?: number } }): {
  inputTokens: number | null;
  outputTokens: number | null;
} {
  const input = response.usage?.prompt_tokens;
  const output = response.usage?.completion_tokens;
  return {
    inputTokens: typeof input === "number" && Number.isFinite(input) ? input : null,
    outputTokens: typeof output === "number" && Number.isFinite(output) ? output : null,
  };
}

function messageCharacterCount(system: string, user: string): number {
  return system.length + user.length;
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
    parts.push(
      "If a brief creates an enumerated list, honor that count and item type. Straightforward listicles are cover plus N items plus one closing, with no standalone context slide."
    );
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
      const framingIssues = validateCarouselListContractFraming(
        candidate,
        listContract
      );
      if (framingIssues.length > 0) {
        semanticIssues.push(
          `Candidate "${candidate.title}": ${framingIssues.join("; ")}`
        );
        continue;
      }
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

function rankCarouselAngleCandidates(
  candidates: CarouselAngleCandidate[]
): CarouselAngleCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.scores.overall !== b.scores.overall) {
      return b.scores.overall - a.scores.overall;
    }
    if (a.scores.factualSafety !== b.scores.factualSafety) {
      return b.scores.factualSafety - a.scores.factualSafety;
    }
    if (a.scores.usefulness !== b.scores.usefulness) {
      return b.scores.usefulness - a.scores.usefulness;
    }
    if (a.scores.relevance !== b.scores.relevance) {
      return b.scores.relevance - a.scores.relevance;
    }
    return 0;
  });
}

async function invokeCarouselAngleCandidatesOnce(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
}): Promise<{
  candidates: CarouselAngleCandidate[];
  fullBriefs: CarouselCreativeBrief[];
  allNormalizedFull: CarouselCreativeBrief[];
  semanticIssues: string[];
  rawCandidateCount: number;
  listContract: CarouselListContract | null;
  telemetry: AngleCallTelemetry;
}> {
  const listContract = detectExplicitCarouselListContract(args.sourceContent);
  const system = buildCarouselAngleCandidatesSystemPrompt();
  const user = buildCarouselAngleCandidatesUserPrompt({
    sourceContent: args.sourceContent,
    niche: args.niche,
    brandVoice: args.brandVoice,
    listContract,
  });
  const startedAt = performance.now();
  const response = await invokeLLM({
    operation: "angle_generation",
    repairIteration: 0,
    maxTokens: COMPACT_CANDIDATE_MAX_TOKENS,
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
  const normalizedFull = normalizeGeneratedCarouselBriefs(rawAngles);
  const selectedFull = selectSemanticallyValidCarouselBriefs(
    normalizedFull,
    listContract
  );
  return {
    candidates: compact.candidates,
    fullBriefs: selectedFull.briefs,
    allNormalizedFull: normalizedFull,
    semanticIssues: [...compact.semanticIssues, ...selectedFull.semanticIssues],
    rawCandidateCount: rawAngles.length,
    listContract,
    telemetry: {
      inputCharacterCount: messageCharacterCount(system, user),
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
  };
}

async function invokeCarouselAngleExpansionOnce(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  candidate: CarouselAngleCandidate;
  repairNote?: string;
}): Promise<{
  briefs: CarouselCreativeBrief[];
  allNormalized: CarouselCreativeBrief[];
  semanticIssues: string[];
  listContract: CarouselListContract | null;
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
  const userPrompt = args.repairNote
    ? `${basePrompt}\n\nPREVIOUS OUTPUT FAILED VALIDATION. Fix ONLY these issues and return one complete brief:\n${args.repairNote}`
    : basePrompt;
  const startedAt = performance.now();

  const response = await invokeLLM({
    operation: "angle_generation",
    repairIteration: args.repairNote ? 1 : 0,
    maxTokens: EXPANSION_MAX_TOKENS,
    messages: [
      {
        role: "system",
        content: system,
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: buildCarouselAngleExpansionJsonSchema(),
    },
  });
  const tokens = llmTokenUsage(response);

  const raw = String(response.choices[0]?.message?.content ?? "");
  const parsed = parseLlmJson<BriefLlmPayload>(raw, {});
  const normalized = normalizeGeneratedCarouselBrief(parsed.brief, 0);
  const allNormalized = normalized ? [normalized] : [];
  const selected = selectSemanticallyValidCarouselBriefs(
    allNormalized,
    listContract
  );
  return {
    ...selected,
    allNormalized,
    listContract,
    telemetry: {
      inputCharacterCount: messageCharacterCount(system, userPrompt),
      inputTokens: tokens.inputTokens,
      outputTokens: tokens.outputTokens,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    },
  };
}

/**
 * Propose creative briefs from source content.
 * requiredValidBriefs defaults to 3 (Review Plan). Auto generateFromInput uses 1.
 * Review Plan: one full 3-brief call, at most one repair.
 * Auto: compact candidates, then expand only the selected brief.
 */
export async function generateCarouselAngles(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  correlationId?: string;
  entryPoint?: string;
  requiredValidBriefs?: CarouselAngleRequiredValidBriefs;
}): Promise<CarouselCreativeBrief[]> {
  const sourceContent = args.sourceContent.trim();
  const niche = args.niche?.trim() || undefined;
  if (!sourceContent) {
    throw new Error("sourceContent is required to generate carousel angles.");
  }

  const requiredValidBriefs: CarouselAngleRequiredValidBriefs =
    args.requiredValidBriefs === 1 ? 1 : 3;
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
    let compactMetrics: {
      inputCharacterCount: number;
      inputTokens: number | null;
      outputTokens: number | null;
      durationMs: number;
      rawCandidateCount: number;
      validCompactCandidateCount: number;
    } | null = null;
    let expansionMetrics: {
      inputCharacterCount: number;
      inputTokens: number | null;
      outputTokens: number | null;
      durationMs: number;
      firstPassValid: boolean;
      repairRan: boolean;
    } | null = null;

    if (requiredValidBriefs === 1) {
      angleGenerationMode = "candidates_then_expand";
      const compact = await invokeCarouselAngleCandidatesOnce({
        sourceContent,
        niche,
        brandVoice: args.brandVoice,
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
      loggedIssues.push(
        ...semanticIssuesByCandidate(
          "first",
          compact.allNormalizedFull,
          compact.listContract
        )
      );

      if (compact.fullBriefs.length > 0) {
        firstAttemptValidCount = compact.fullBriefs.length;
        normalizedCandidateCount = compact.allNormalizedFull.length;
        merged = compact.fullBriefs;
      } else if (compact.candidates.length === 0) {
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
        repairReason = "zero_compact_candidates";
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
        const selected = rankCarouselAngleCandidates(compact.candidates)[0]!;
        expansionRan = true;
        const expanded = await invokeCarouselAngleExpansionOnce({
          sourceContent,
          niche,
          brandVoice: args.brandVoice,
          candidate: selected,
        });
        firstAttemptValidCount = expanded.briefs.length;
        normalizedCandidateCount = expanded.allNormalized.length;
        loggedIssues.push(
          ...semanticIssuesByCandidate(
            "first",
            expanded.allNormalized,
            expanded.listContract
          )
        );
        if (expanded.briefs.length > 0) {
          merged = expanded.briefs;
          expansionMetrics = {
            inputCharacterCount: expanded.telemetry.inputCharacterCount,
            inputTokens: expanded.telemetry.inputTokens,
            outputTokens: expanded.telemetry.outputTokens,
            durationMs: expanded.telemetry.durationMs,
            firstPassValid: true,
            repairRan: false,
          };
        } else {
          repairRan = true;
          repairIteration = 1;
          repairReason = "expansion_invalid";
          const repaired = await invokeCarouselAngleExpansionOnce({
            sourceContent,
            niche,
            brandVoice: args.brandVoice,
            candidate: selected,
            repairNote: buildCarouselAnglesRepairNote(
              0,
              expanded.semanticIssues,
              { listContract: expanded.listContract }
            ),
          });
          repairAttemptValidCount = repaired.briefs.length;
          normalizedCandidateCount += repaired.allNormalized.length;
          merged = repaired.briefs;
          loggedIssues.push(
            ...semanticIssuesByCandidate(
              "repair",
              repaired.allNormalized,
              repaired.listContract
            )
          );
          expansionMetrics = {
            inputCharacterCount: expanded.telemetry.inputCharacterCount,
            inputTokens: expanded.telemetry.inputTokens,
            outputTokens: expanded.telemetry.outputTokens,
            durationMs: expanded.telemetry.durationMs,
            firstPassValid: false,
            repairRan: true,
          };
        }
        if (expansionMetrics) {
          logAngleSubstageCompleted({
            correlationId,
            substage: "expansion",
            ...expansionMetrics,
          });
        }
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

    const ranked = rankCarouselCreativeBriefs(merged).slice(
      0,
      CAROUSEL_STUDIO_ANGLE_COUNT
    );
    const briefs = reindexCarouselBriefs(ranked);
    mergedValidCount = merged.length;
    acceptedSemanticCandidateCount = briefs.length;
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
      requestedModel: ANGLE_GENERATION_REQUESTED_MODEL,
      angleGenerationMode,
      expansionRan,
      compactCandidateCount: compactCandidateCount ?? undefined,
      repairReason,
      compact: compactMetrics,
      expansion: expansionMetrics,
    });

    return briefs;
  } catch (err) {
    logAngleGenerationFailed({
      correlationId,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      error: err,
      operation: "angle_generation",
      requestedModel: ANGLE_GENERATION_REQUESTED_MODEL,
      repairIteration,
    });
    throw err;
  }
}
