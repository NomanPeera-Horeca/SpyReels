/**
 * Carousel Studio: propose 3 complete creative briefs from source content.
 * One LLM call. Does not generate full slide copy. Selected brief is passed
 * into generateCarouselRemake separately from sourceContent.
 */

import {
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
  normalizeGeneratedCarouselBriefs,
  type CarouselCreativeBrief,
} from "@shared/carouselStudio";
import { invokeLLM } from "../_core/llm";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";

type BriefsLlmPayload = {
  angles?: unknown[];
};

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
    },
    required: ["position", "role", "objective", "recommendedVisual"],
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
          minItems: CAROUSEL_STUDIO_ANGLE_COUNT,
          maxItems: CAROUSEL_STUDIO_ANGLE_COUNT,
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
                minItems: CAROUSEL_BRIEF_KEY_POINTS_MIN,
                maxItems: CAROUSEL_BRIEF_KEY_POINTS_MAX,
                description: `${CAROUSEL_BRIEF_KEY_POINTS_MIN}-${CAROUSEL_BRIEF_KEY_POINTS_MAX} useful, specific points. Plans only.`,
                items: keyPointSchema,
              },
              slideOutline: {
                type: "array",
                minItems: CAROUSEL_STUDIO_MIN_SLIDES,
                maxItems: CAROUSEL_STUDIO_MAX_SLIDES,
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
                maxItems: CAROUSEL_BRIEF_EVIDENCE_MAX,
                description: `What would need verification before publishing. Max ${CAROUSEL_BRIEF_EVIDENCE_MAX}. No citations.`,
                items: { type: "string" },
              },
              prohibitedClaims: {
                type: "array",
                maxItems: CAROUSEL_BRIEF_PROHIBITED_MAX,
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

export function buildCarouselAnglesUserPrompt(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
}): string {
  const brand = args.brandVoice?.trim();
  const override = args.niche?.trim() ?? "";
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

async function invokeCarouselAnglesOnce(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
  repairNote?: string;
}): Promise<CarouselCreativeBrief[]> {
  const schema = buildCarouselAnglesJsonSchema();
  const basePrompt = buildCarouselAnglesUserPrompt({
    sourceContent: args.sourceContent,
    niche: args.niche,
    brandVoice: args.brandVoice,
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
  return normalizeGeneratedCarouselBriefs(parsed.angles);
}

/**
 * One Sonnet call: return exactly 3 complete creative briefs (no slide bodies).
 * Retries once with a repair note if the first payload is not exactly 3 valid briefs.
 */
export async function generateCarouselAngles(args: {
  sourceContent: string;
  niche?: string | null;
  brandVoice?: string | null;
}): Promise<CarouselCreativeBrief[]> {
  const sourceContent = args.sourceContent.trim();
  const niche = args.niche?.trim() || undefined;
  if (!sourceContent) {
    throw new Error("sourceContent is required to generate carousel angles.");
  }

  let briefs = await invokeCarouselAnglesOnce({
    sourceContent,
    niche,
    brandVoice: args.brandVoice,
  });

  if (briefs.length !== CAROUSEL_STUDIO_ANGLE_COUNT) {
    briefs = await invokeCarouselAnglesOnce({
      sourceContent,
      niche,
      brandVoice: args.brandVoice,
      repairNote: `Expected exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} valid creative briefs, each with kicker, title, description, topic, inferredAudience, contentGoal, contentFormat, angleType, hook, corePromise, centralInsight, ${CAROUSEL_BRIEF_KEY_POINTS_MIN}-${CAROUSEL_BRIEF_KEY_POINTS_MAX} keyPoints, slideOutline length equal to estimatedSlideCount (${CAROUSEL_STUDIO_MIN_SLIDES}-${CAROUSEL_STUDIO_MAX_SLIDES}), layoutFamily, claimRisk, researchMode, ctaDirection, component scores, and confidence. Do not include id, schemaVersion, or overall. Got ${briefs.length} valid briefs.`,
    });
  }

  if (briefs.length !== CAROUSEL_STUDIO_ANGLE_COUNT) {
    throw new Error(
      `Expected ${CAROUSEL_STUDIO_ANGLE_COUNT} carousel briefs, got ${briefs.length}.`
    );
  }

  return briefs;
}
