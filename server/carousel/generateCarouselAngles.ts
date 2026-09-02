/**
 * Carousel Studio: propose 3 complete creative briefs from source content.
 * One LLM call. Does not generate full slide copy. Selected brief is passed
 * into generateCarouselRemake separately from sourceContent.
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
  normalizeGeneratedCarouselBriefs,
  rankCarouselCreativeBriefs,
  selectSemanticallyValidCarouselBriefs,
  validateCarouselBriefSemantics,
  type CarouselCreativeBrief,
  type CarouselListContract,
} from "@shared/carouselStudio";
import { invokeLLM } from "../_core/llm";
import {
  logAngleGenerationCompleted,
  logAngleGenerationFailed,
  logAngleGenerationStarted,
  resolveAngleGenerationCorrelationId,
  resolveAngleGenerationEntryPoint,
  type SemanticIssuesByCandidate,
} from "./angleGenerationObservability";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";

const ANGLE_GENERATION_REQUESTED_MODEL = "claude-sonnet-4-6";

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
    `Default structure: cover, then ${promisedCount} ${promisedItemType} item slides, then one final closing. estimatedSlideCount should be ${slideCount}. Put setup on the cover. Do not insert a standalone context slide unless it is materially necessary.`,
    `Only the ${promisedCount} promised item slides get listItemIndex 1 through ${promisedCount}. Cover, context, example, takeaway, and CTA must set listItemIndex to null. Never derive listItemIndex from physical slide position.`,
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
      `Preserve the explicit list contract: exactly ${listContract.promisedCount} ${listContract.promisedItemType}. Do not change the item type or count. Only promised item slides may use listItemIndex 1 through ${listContract.promisedCount}.`
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

/**
 * Propose creative briefs from source content.
 * requiredValidBriefs defaults to 3 (Review Plan). Auto generateFromInput uses 1.
 * At most one repair call. Valid first-attempt briefs are never discarded.
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
    const first = await invokeCarouselAnglesOnce({
      sourceContent,
      niche,
      brandVoice: args.brandVoice,
    });
    rawCandidateCount = first.rawCandidateCount;
    normalizedCandidateCount = first.normalizedCandidateCount;

    const firstValid = first.briefs;
    const firstAttemptValidCount = firstValid.length;
    const loggedIssues: SemanticIssuesByCandidate[] = semanticIssuesByCandidate(
      "first",
      first.allNormalized,
      first.listContract
    );

    let repairValid: CarouselCreativeBrief[] = [];
    let repairAttemptValidCount = 0;
    const needsRepair =
      requiredValidBriefs === 1
        ? firstAttemptValidCount === 0
        : firstAttemptValidCount < CAROUSEL_STUDIO_ANGLE_COUNT;

    if (needsRepair) {
      repairRan = true;
      repairIteration = 1;
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
            ...(requiredValidBriefs === 3
              ? {
                  missingCount,
                  acceptedBriefs: firstValid.map((brief) => ({
                    title: brief.title,
                    angleType: brief.angleType,
                  })),
                }
              : {}),
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

    const merged =
      requiredValidBriefs === 3 && repairRan
        ? mergeValidCarouselBriefs(firstValid, repairValid)
        : firstAttemptValidCount > 0
          ? firstValid
          : repairValid;
    const ranked = rankCarouselCreativeBriefs(merged).slice(
      0,
      CAROUSEL_STUDIO_ANGLE_COUNT
    );
    const briefs = reindexCarouselBriefs(ranked);
    const mergedValidCount = merged.length;
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
