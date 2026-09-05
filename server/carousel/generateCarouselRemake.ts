import { eq } from "drizzle-orm";
import {
  CAROUSEL_TEMPLATES_BY_ID,
  type CarouselSlideSpec,
  type CarouselTemplate,
} from "@shared/carouselTemplates";
import {
  carouselFactPool,
  factFitsTemplate,
  nicheMatchesFact,
  type VettedFact,
} from "@shared/carouselFactPool";
import { carouselRemakes } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";
import {
  CAROUSEL_CLOSING_TYPES,
  CAROUSEL_SLIDE_INTENTS,
  CREATIVE_BRIEF_NOT_FACTUAL_SOURCE_RULE,
  bindBriefOutlineToSlides,
  formatApprovedCreativeBriefForCopy,
  formatCarouselListItemNumber,
  isLegacyCreativeBrief,
  stripSlideIntentMetadata,
  validateCopyBriefAdherence,
  type CarouselCreativeBrief,
} from "@shared/carouselStudio";
import {
  bindPlanningIRToSlides,
  compileCreativeBriefToPlanningIR,
  planningCopySequenceFromIR,
  planningIRCopyGenerationGate,
  planningIRListItemIndexes,
  planningIRUsesListSequence,
  type CarouselPlanningIR,
} from "@shared/carouselPlanningIR";
import {
  applyPlanningSequenceToCopy,
  buildBreakdownListicleSlides,
  canUseBreakdownListicleFamily,
} from "@shared/carouselBreakdownFamily";
import {
  buildComparisonFamilySlides,
  canUseComparisonFamily,
  isComparisonFamilySlide,
  textContextForComparisonImageSlot,
} from "@shared/carouselComparisonFamily";
import {
  buildStoryNarrativeSlides,
  canUseStoryNarrativeFamily,
} from "@shared/carouselStoryFamily";
import {
  buildFrameworkFamilySlides,
  canUseFrameworkFamily,
} from "@shared/carouselFrameworkFamily";
import {
  buildRoadmapFamilySlides,
  canUseRoadmapFamily,
} from "@shared/carouselRoadmapFamily";
import { generateCarouselVisualDirection } from "./generateCarouselVisualDirection";
import { resolveSlideImage } from "./resolveSlideImage";
import {
  assignPoolPhotosToSlots,
  type PhotoSlotNeed,
} from "./assignPoolPhotos";
import type { CarouselImageUrlMap } from "@shared/carouselTemplates";
import { analyzeSourceCarousel } from "./analyzeSourceCarousel";
import {
  buildSlidesFromAnalysis,
  sourceContentFromAnalysis,
} from "./buildSlidesFromAnalysis";
import { ensureReelThumbnailOnR2 } from "../reelThumbnailR2";
import {
  categorizeGenerationError,
  createGenerationTelemetryContext,
  finalizeGenerationMetrics,
  getActiveGenerationTelemetry,
  persistTerminalRemake,
  runWithGenerationTelemetry,
  withGenerationStage,
  type GenerationTelemetryContext,
} from "./generationTelemetry";

/**
 * Map remake slide index -> source still for vision grounding.
 * 1:1 when counts match; clamp to last still when remake has more slides;
 * if only one still, share it for every slide (Path B reel thumb).
 */
function sourceImageForSlideIndex(
  stills: string[],
  slideIndex: number
): string | null {
  if (stills.length === 0) return null;
  if (stills.length === 1) return stills[0] ?? null;
  const clamped = Math.min(Math.max(slideIndex, 0), stills.length - 1);
  return stills[clamped] ?? null;
}

export type CarouselSlideValuesMap = Record<string, Record<string, string>>;

/** Per-slide locked average facts selected from the vetted pool for one remake job. */
export type LockedSlideFacts = Map<string, VettedFact>;

const MIN_SLIDE_COUNT = 3;
const MAX_SLIDE_COUNT = 20;

const AVERAGE_NOT_LINE_RULE_8 = `8. For any slide with an "average" slot and a "not_line" slot (stat_split_stack): not_line
must name and negate the specific silent belief a human forms from that slide's average line
— not generically reframe it. Determine which type of claim average makes, and apply the
matching logic:

   a) TIMEFRAME/AGE/SCALE claims (a duration, a number, an age — e.g. "The average
      millionaire is 57", "The average restaurant takes 3 years to profit"): humans facing
      this crave a FASTER or YOUNGER outcome than reality states. not_line must name that
      specific impatient craving as a shorter/younger contrasting figure.
      Correct: "The average millionaire is 57" → "Not 27"
      Correct: "The average restaurant takes 3 years to profit" → "Not 3 months"
      Wrong: "Not yours" (no craving named, no echo of the number)

   b) FAILURE/HARDSHIP claims (a real setback, loss, or struggle — e.g. "McDonald's failed
      in its first year open"): humans facing this form a FEAR that one failure defines them
      permanently. not_line must name and kill that specific fear, not confirm the fact or
      offer an unrelated reframe.
      Correct: "McDonald's failed in its first year open" → "Not forever"
      Wrong: "Not a myth" (confirms the fact instead of addressing the fear it creates)
      Wrong: "Not true" (confirms/denies the fact itself, ignores the human fear entirely)

Before finalizing not_line, identify: (1) is this a timeframe/age/scale claim or a
failure/hardship claim, (2) what specific craving or fear would a human form from it, (3)
does not_line directly name and negate that specific craving/fear. If not_line could apply
unchanged to a different average line on a different slide, it has failed this rule —
it must be specific to what THAT slide's average line makes someone feel.`;

/**
 * Pick vetted facts for average+not_line slides. One fact id per job (no reuse).
 * Slides without a niche+template match are omitted (unnamed-brand fallback).
 */
export function selectVettedFactsForSlides(
  templateId: string,
  niche: string,
  slides: CarouselSlideSpec[]
): LockedSlideFacts {
  const locked: LockedSlideFacts = new Map();
  const usedFactIds = new Set<string>();
  const candidates = carouselFactPool.filter(
    (fact) => factFitsTemplate(fact, templateId) && nicheMatchesFact(niche, fact)
  );

  for (const slide of slides) {
    if (!slideHasAverageNotLinePair(slide)) continue;
    const pick = candidates.find((fact) => !usedFactIds.has(fact.id));
    if (!pick) continue;
    usedFactIds.add(pick.id);
    locked.set(slide.id, pick);
  }

  return locked;
}

/** Force locked average slots to vetted factText so the LLM cannot mutate them. */
export function applyLockedAverageFacts(
  values: CarouselSlideValuesMap,
  lockedFacts: LockedSlideFacts
): CarouselSlideValuesMap {
  if (lockedFacts.size === 0) return values;
  const next: CarouselSlideValuesMap = { ...values };
  for (const [slideId, fact] of lockedFacts) {
    next[slideId] = {
      ...(next[slideId] ?? {}),
      average: fact.factText,
    };
  }
  return next;
}

/**
 * Map an image slot to its most specific text line for photo search.
 * Cover grid: photo_tl -> excuse_tl (etc).
 * Average vs Not: photo_top -> average, photo_bottom -> not_line.
 * Excuse split: photo_before / default -> excuse.
 * Generic photo slots: prefer headline/title/message over kicker (do not rely on Object.values order).
 */
function textContextForImageSlot(
  slideVals: Record<string, string>,
  imageSlotId: string
): string {
  if (imageSlotId === "photo_top" || imageSlotId === "top") {
    if (typeof slideVals.average === "string" && slideVals.average.trim()) {
      return slideVals.average.trim();
    }
  }
  if (imageSlotId === "photo_bottom" || imageSlotId === "bottom") {
    if (typeof slideVals.not_line === "string" && slideVals.not_line.trim()) {
      return slideVals.not_line.trim();
    }
  }

  const suffix = imageSlotId.startsWith("photo_")
    ? imageSlotId.slice("photo_".length)
    : "";

  if (suffix && suffix !== "before" && suffix !== "after" && suffix !== "top" && suffix !== "bottom") {
    const paired =
      slideVals[`excuse_${suffix}`] ??
      slideVals[`headline_${suffix}`] ??
      slideVals[suffix];
    if (typeof paired === "string" && paired.trim()) return paired.trim();
  }

  if (typeof slideVals.excuse === "string" && slideVals.excuse.trim()) {
    return slideVals.excuse.trim();
  }

  // Prefer slide message text over kicker / labels (property order is not reliable).
  const preferredKeys = [
    "headline",
    "title",
    "message",
    "body",
    "subhead",
    "caption",
    "quote",
  ];
  for (const key of preferredKeys) {
    const v = slideVals[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  const skipKeys = new Set(["kicker", "cta_label", "number"]);
  for (const [key, v] of Object.entries(slideVals)) {
    if (skipKeys.has(key)) continue;
    if (typeof v === "string" && v.trim()) return v.trim();
  }

  const first = Object.values(slideVals).find(
    (v) => typeof v === "string" && v.trim().length > 0
  );
  return first?.trim() ?? "";
}

function imageTextContextForSlide(
  slide: CarouselSlideSpec,
  slideVals: Record<string, string>,
  imageSlotId: string
): string {
  if (
    isComparisonFamilySlide(slide) &&
    (slide.imageSlots?.length ?? 0) > 1
  ) {
    const sideCopy = textContextForComparisonImageSlot(slideVals, imageSlotId);
    if (sideCopy) return sideCopy;
  }
  return textContextForImageSlot(slideVals, imageSlotId);
}

function slotSchemaDescription(slot: CarouselSlideSpec["slots"][number]): string {
  const budget = `${slot.budget.min}-${slot.budget.max} characters.`;
  if (slot.label === "Checklist lines") {
    return `Checklist lines (${slot.role}). Write 2-4 short actionable lines, each separated by a newline. Use only facts from the source or approved brief. ${budget}`;
  }
  if (slot.label === "Data point") {
    return `Data point (${slot.role}). Write one concise metric, threshold, or key data phrase grounded in the source or approved brief. Do not invent an unsupported statistic. ${budget}`;
  }
  return `${slot.label} (${slot.role}). ${budget}`;
}

function buildSlotSchemaForSlide(slide: CarouselSlideSpec): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const slot of slide.slots) {
    properties[slot.id] = {
      type: "string",
      description: slotSchemaDescription(slot),
    };
    required.push(slot.id);
  }
  properties.slideIntent = {
    type: "string",
    enum: [...CAROUSEL_SLIDE_INTENTS],
    description:
      "content, transition, or closing. Only the final slide may be closing. The final slide must be closing. Metadata only, not visible slide text.",
  };
  required.push("slideIntent");
  properties.closingType = {
    type: "string",
    enum: [...CAROUSEL_CLOSING_TYPES],
    description:
      "Required when slideIntent is closing. Ignored for content and transition. Metadata only, not visible slide text.",
  };
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}

/** Programmatically derive a forced-tool JSON schema from an arbitrary slide list. */
export function buildCarouselRemakeJsonSchema(slides: CarouselSlideSpec[]): {
  name: string;
  strict: false;
  schema: Record<string, unknown>;
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const slide of slides) {
    properties[slide.id] = buildSlotSchemaForSlide(slide);
    required.push(slide.id);
  }
  return {
    name: "carousel_remake_slots",
    strict: false,
    schema: {
      type: "object",
      properties,
      required,
      additionalProperties: false,
    },
  };
}

function slideHasAverageNotLinePair(slide: CarouselSlideSpec): boolean {
  if (slide.layoutId !== "stat_split_stack") return false;
  const ids = new Set(slide.slots.map((s) => s.id));
  return ids.has("average") && ids.has("not_line");
}

function reframeAngleInstruction(angle: VettedFact["reframeAngle"]): string {
  return angle === "fear_negation"
    ? 'Apply Rule 8 branch (b) FAILURE/HARDSHIP (fear negation) for not_line on this slide.'
    : 'Apply Rule 8 branch (a) TIMEFRAME/AGE/SCALE (craving negation) for not_line on this slide.';
}

function planningIRForModernBrief(
  creativeBrief: CarouselCreativeBrief | undefined,
  sourceContent?: string
): CarouselPlanningIR | null {
  if (!creativeBrief || isLegacyCreativeBrief(creativeBrief)) return null;
  return compileCreativeBriefToPlanningIR({
    brief: creativeBrief,
    sourceContent: sourceContent ?? "",
  });
}

export function buildCarouselRemakePrompt(
  templateName: string,
  templateDescription: string,
  slides: CarouselSlideSpec[],
  niche: string,
  lockedFacts: LockedSlideFacts = new Map(),
  sourceContent?: string,
  creativeBrief?: CarouselCreativeBrief,
  planningIR?: CarouselPlanningIR | null
): string {
  const hasAverageNotPair = slides.some(slideHasAverageNotLinePair);
  const unlockedAverageSlides = slides.filter(
    (slide) => slideHasAverageNotLinePair(slide) && !lockedFacts.has(slide.id)
  );

  const resolvedPlanningIR =
    planningIR ?? planningIRForModernBrief(creativeBrief, sourceContent);
  const slideIds = slides.map((slide) => slide.id);
  const outlineBindings = resolvedPlanningIR
    ? bindPlanningIRToSlides(resolvedPlanningIR, slideIds)
    : creativeBrief
      ? bindBriefOutlineToSlides(creativeBrief.slideOutline, slideIds)
      : [];
  const plannedBySlideId = new Map(
    outlineBindings
      .filter((binding) => binding.slideId)
      .map((binding) => [binding.slideId as string, binding])
  );

  const slideBlocks = slides
    .map((slide, index) => {
      const locked = lockedFacts.get(slide.id);
      const planned = plannedBySlideId.get(slide.id);
      const slotLines = slide.slots
        .map((slot) => {
          if (locked && slot.id === "average") {
            return `- slot "average" (${slot.role}, label "${slot.label}"): LOCKED. Copy this exact text verbatim (do not rewrite, shorten, or invent a different fact): "${locked.factText}"`;
          }
          if (locked && slot.id === "not_line") {
            return `- slot "not_line" (${slot.role}, label "${slot.label}"): ${slot.budget.min}-${slot.budget.max} characters. ${reframeAngleInstruction(locked.reframeAngle)} Generate not_line for the LOCKED average above. Tone/length reference: "${slot.defaultText}"`;
          }
          return `- slot "${slot.id}" (${slot.role}, label "${slot.label}"): ${slot.budget.min}-${slot.budget.max} characters. Tone/length reference: "${slot.defaultText}"`;
        })
        .join("\n");
      const lockNote = locked
        ? `\nVetted fact lock: average is fixed. ${reframeAngleInstruction(locked.reframeAngle)}`
        : "";
      const plannedNote = planned
        ? `\nPlanned role: ${planned.role}\nPlanned objective (this slide must deliver this, not another slide's point): ${planned.objective}${
            planned.listItemIndex != null
              ? `\nList item number: ${formatCarouselListItemNumber(planned.listItemIndex)}. Use this for Number kickers, not the physical slide position.`
              : outlineBindings.some((binding) => binding.listItemIndex != null)
                ? "\nNot a numbered list item. Do not assign a promised item number to this slide."
                : ""
          }`
        : "";
      return `Slide ${slide.id} (position ${index + 1}, layout role: ${slide.role}):
Viral why (preserve this beat): ${slide.viralWhy}${plannedNote}${lockNote}
Slots:
${slotLines}`;
    })
    .join("\n\n");

  const averageNotRule = hasAverageNotPair ? `\n${AVERAGE_NOT_LINE_RULE_8}\n` : "";

  const noNamedBrandRule =
    unlockedAverageSlides.length > 0
      ? `
9. For slides with an "average" slot that are NOT marked LOCKED: you may invent niche-fit average claims, but you MUST NOT name real brands, companies, restaurants, products, or public figures. Use unnamed framing only (e.g. "a fast-food giant", "the average restaurant", "most independent cafes"). Never write McDonald's, Chipotle, Nobu, or any other real named entity in average or not_line.
`
      : "";

  const trimmedSource = sourceContent?.trim() ?? "";
  if (trimmedSource.length > 0 && creativeBrief) {
    const briefBlock = formatApprovedCreativeBriefForCopy(creativeBrief);
    const usesListItemIndex = resolvedPlanningIR
      ? planningIRUsesListSequence(resolvedPlanningIR)
      : creativeBrief.slideOutline.some((slide) => slide.listItemIndex != null);
    const numberKickerRule = usesListItemIndex
      ? 'use listItemIndex as "01", "02", etc. If the planned slide has no listItemIndex, do not use a promised item number. Never number from physical slide position.'
      : 'use "01", "02", etc.';
    const checklistLinesHint = slides.some((slide) =>
      slide.slots.some((slot) => slot.label === "Checklist lines")
    )
      ? `\n9b. For slots labeled "Checklist lines": write 2-4 short actionable lines, each separated by a newline. Use only facts from the source or approved brief.`
      : "";
    const dataPointHint = slides.some((slide) =>
      slide.slots.some((slot) => slot.label === "Data point")
    )
      ? `\n9c. For slots labeled "Data point": write one concise metric, threshold, or key data phrase grounded in the source or approved brief. Do not invent an unsupported statistic.`
      : "";
    return `You turn existing creator content into Instagram carousel slide text. The template layout, fonts, colors, and slide order are LOCKED. You only write slot text.

Creator niche / audience context (optional):
${niche || "General creators"}

A. ORIGINAL SOURCE MATERIAL
The user request, article text, transcript or resolved source. This remains the authority for topic and factual material.
"""
${trimmedSource.slice(0, 8000)}
"""

B. APPROVED CREATIVE BRIEF
${CREATIVE_BRIEF_NOT_FACTUAL_SOURCE_RULE}

${briefBlock}

Template: ${templateName}
${templateDescription}

Rules:
1. Use the source content as the only source of facts. Keep the creator's points; tighten for mobile slides.
2. Follow the approved brief's sequence, order and emphasis. Outline position N maps to the Nth slide exactly. Do not skip, swap, or compress planned slides.
3. Preserve the source topic. Do not replace it with a different niche.
4. Avoid every prohibitedClaims entry.
5. Use the CTA direction instead of defaulting to "Follow for more". Set slideIntent on every slide: content or transition for earlier slides, and closing only on the final slide. The final slide must be closing. A closing may use any creative wording. Set closingType when slideIntent is closing. slideIntent and closingType are metadata, not visible slide text.
6. Prefer short postable lines. Aim for under ~40 words of readable text per slide across its slots combined when budgets allow.
7. Character budgets are HARD limits. Every string MUST be between min and max inclusive (count characters, including spaces).
8. Preserve each slide's viral beat described in "Viral why".
${
  creativeBrief.researchMode === "claim_verification"
    ? `8b. Qualify unsupported claims. Do not write unsupported absolutes such as "Most owners have at least two of these", "All five plugged means predictable cash", or "A reserve is not a luxury". Prefer qualified wording such as "Many owners may have more than one" and "Fixing these leaks can make cash flow more predictable".`
    : ""
}
9. For slots with role "kicker":
   - If the slot label is "Kicker": use a short uppercased audience or theme word from the source when possible.
   - If the slot label is "Number" or "Step number": ${numberKickerRule}
   - If the slot label is "Stat": use a short striking number from the source when available.${checklistLinesHint}${dataPointHint}
10. Return ONLY the tool payload with every slide id, every slot id, slideIntent, and closingType filled.${averageNotRule}${noNamedBrandRule}
${slideBlocks}`;
  }

  if (trimmedSource.length > 0) {
    return `You turn existing creator content into Instagram carousel slide text. The template layout, fonts, colors, and slide order are LOCKED. You only write slot text.

Creator niche / audience context (optional):
${niche || "General creators"}

Source content to convert (this is the material; extract and reshape, do not invent a new topic):
"""
${trimmedSource.slice(0, 8000)}
"""

Template: ${templateName}
${templateDescription}

Rules:
1. Use the source content as the only source of ideas. Keep the creator's points; tighten for mobile slides.
2. Hook slide first (role hook), CTA slide last (role cta). Middle slides deliver one clear point each.
3. Prefer short postable lines. Aim for under ~40 words of readable text per slide across its slots combined when budgets allow.
4. Character budgets are HARD limits. Every string MUST be between min and max inclusive (count characters, including spaces).
5. Preserve each slide's viral beat described in "Viral why".
6. For slots with role "kicker":
   - If the slot label is "Kicker": use a short uppercased audience or theme word from the source when possible.
   - If the slot label is "Number" or "Step number": use "01", "02", etc.
   - If the slot label is "Stat": use a short striking number from the source when available.
7. Return ONLY the tool payload with every slide id, every slot id, slideIntent, and closingType filled. Only the final slide may use slideIntent closing. The final slide must use closing. slideIntent and closingType are metadata, not visible slide text.${averageNotRule}${noNamedBrandRule}
${slideBlocks}`;
  }

  return `You rewrite Instagram carousel slide text for a creator's niche. The template layout, fonts, colors, and slide order are LOCKED. You only rewrite slot text.

Niche / topic for this remake:
${niche}

Template: ${templateName}
${templateDescription}

Rules:
1. Rewrite every slot for the niche above. Be specific and postable. Zero generic filler. Exception: any slot marked LOCKED must be copied exactly.
2. Preserve each slide's viral beat exactly as described in "Viral why".
3. Character budgets are HARD limits. Every string MUST be between min and max inclusive (count characters, including spaces). Exception: LOCKED average text is copied verbatim even if outside budget.
4. Keep the same structure: hooks stay hooks, list items stay list items, CTAs stay CTAs.
5. Use defaultText only as a tone and length reference, not as copy to keep (unless the slot is LOCKED).
6. For slots with role "kicker":
   - If the slot label is "Kicker" (hook-style): use the plural noun for the target audience described in the niche above (e.g. "RESTAURANT OWNERS", "FITNESS COACHES", "REAL ESTATE AGENTS"). Do not invent a stylistic or generic word. If the niche names a specific audience noun, use that noun directly, uppercased.
   - If the slot label is "Number" or "Step number": use a short sequence number like "01", "02" (match the tone/length of defaultText).
   - If the slot label is "Stat": the kicker IS the statistic itself (e.g. "82%", "4X", "10K", "90"). Do not use audience nouns or sequence numbers. Prefer a short striking number within the character budget.
   Always stay within the character budget for that slot.
7. Return ONLY the tool payload with every slide id, every slot id, slideIntent, and closingType filled. Only the final slide may use slideIntent closing. The final slide must use closing. slideIntent and closingType are metadata, not visible slide text.${averageNotRule}${noNamedBrandRule}
${slideBlocks}`;
}

function validateBudgets(
  slides: CarouselSlideSpec[],
  values: CarouselSlideValuesMap,
  lockedFacts: LockedSlideFacts = new Map()
): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  for (const slide of slides) {
    const slideVals = values[slide.id];
    if (!slideVals || typeof slideVals !== "object") {
      issues.push(`Missing slide ${slide.id}`);
      continue;
    }
    for (const slot of slide.slots) {
      // Vetted pool facts are authoritative; skip length checks on locked averages.
      if (slot.id === "average" && lockedFacts.has(slide.id)) continue;
      const text = slideVals[slot.id];
      if (typeof text !== "string") {
        issues.push(`Missing ${slide.id}.${slot.id}`);
        continue;
      }
      const len = text.length;
      if (len < slot.budget.min || len > slot.budget.max) {
        issues.push(
          `${slide.id}.${slot.id} length ${len} outside ${slot.budget.min}-${slot.budget.max} ("${text.slice(0, 40)}")`
        );
      }
    }
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function validateGeneratedCarouselCopy(
  slides: CarouselSlideSpec[],
  values: CarouselSlideValuesMap,
  lockedFacts: LockedSlideFacts = new Map(),
  creativeBrief?: CarouselCreativeBrief,
  planningIR?: CarouselPlanningIR | null
): { ok: true } | { ok: false; issues: string[] } {
  const budget = validateBudgets(slides, values, lockedFacts);
  const issues = budget.ok ? [] : [...budget.issues];
  if (creativeBrief) {
    issues.push(
      ...validateCopyBriefAdherence({
        brief: creativeBrief,
        slideIds: slides.map((slide) => slide.id),
        slideRoles: slides.map((slide) => slide.role),
        values,
        planningSequence: planningIR
          ? planningCopySequenceFromIR(planningIR)
          : undefined,
      })
    );
  }
  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

const CONFIRMATORY_NOT_LINE =
  /^(not\s+(a\s+)?(myth|true|false|fake|lie|rumor|joke)\b)/i;

const TIME_UNIT_WORDS = new Set([
  "year",
  "years",
  "month",
  "months",
  "week",
  "weeks",
  "day",
  "days",
  "hour",
  "hours",
  "minute",
  "minutes",
]);

/** Soft heuristic: warn when not_line looks disconnected from average (no auto-retry). */
function warnAverageNotLineConsistency(
  slides: CarouselSlideSpec[],
  values: CarouselSlideValuesMap
): void {
  for (const slide of slides) {
    if (!slideHasAverageNotLinePair(slide)) continue;
    const average = values[slide.id]?.average?.trim() ?? "";
    const notLine = values[slide.id]?.not_line?.trim() ?? "";
    if (!average || !notLine) continue;

    if (CONFIRMATORY_NOT_LINE.test(notLine)) {
      console.warn(
        `[carouselRemake] not_line confirmatory on ${slide.id}: average="${average}" not_line="${notLine}"`
      );
      continue;
    }

    const avgNums: string[] = average.match(/\d+/g) ?? [];
    const notNums: string[] = notLine.match(/\d+/g) ?? [];
    const stop = new Set(["the", "and", "for", "with", "was", "are", "its"]);
    const avgTokens = average
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !stop.has(t));
    const notTokens = new Set(
      notLine
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean)
    );

    const sharesNumber = avgNums.some((n) => notNums.includes(n));
    const sharesUnit = avgTokens.some((t) => TIME_UNIT_WORDS.has(t) && notTokens.has(t));
    const sharesWord = avgTokens.some(
      (t) => !TIME_UNIT_WORDS.has(t) && !/^\d+$/.test(t) && notTokens.has(t)
    );
    const hasNotMarker = /^not\b/i.test(notLine);

    if (hasNotMarker && (sharesNumber || sharesUnit || sharesWord)) continue;

    console.warn(
      `[carouselRemake] not_line weak echo on ${slide.id}: average="${average}" not_line="${notLine}"`
    );
  }
}

async function invokeCarouselRemakeOnce(
  templateName: string,
  templateDescription: string,
  slides: CarouselSlideSpec[],
  niche: string,
  lockedFacts: LockedSlideFacts = new Map(),
  repairNote?: string,
  sourceContent?: string,
  creativeBrief?: CarouselCreativeBrief,
  planningIR?: CarouselPlanningIR | null
): Promise<CarouselSlideValuesMap> {
  const schema = buildCarouselRemakeJsonSchema(slides);
  const basePrompt = buildCarouselRemakePrompt(
    templateName,
    templateDescription,
    slides,
    niche,
    lockedFacts,
    sourceContent,
    creativeBrief,
    planningIR
  );
  const userPrompt = repairNote
    ? `${basePrompt}\n\nPREVIOUS OUTPUT FAILED VALIDATION. Fix ONLY these issues and return a full corrected payload:\n${repairNote}`
    : basePrompt;

  const systemLine = sourceContent?.trim()
    ? "You convert source content into carousel slide text for SpyReels. Respect character budgets strictly. Return structured tool output only."
    : "You rewrite carousel slide text for SpyReels. Respect character budgets strictly. Return structured tool output only.";

  const response = await invokeLLM({
    operation: "copy_generation",
    repairIteration: repairNote ? 1 : 0,
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(systemLine),
      },
      { role: "user", content: userPrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
  });

  const raw = String(response.choices[0]?.message?.content ?? "");
  const parsed = parseLlmJson<CarouselSlideValuesMap>(raw, {});
  return applyLockedAverageFacts(parsed, lockedFacts);
}

/**
 * Ask Haiku to judge how many middle list-item slides best fit this niche +
 * template content type. Only called when the user picked "auto" for slide
 * count. Falls back to the template's own default count on any failure.
 */
async function decideSlideCount(
  template: CarouselTemplate,
  niche: string
): Promise<number> {
  const defaultCount = countMiddleSlides(template);
  try {
    const response = await invokeLLM({
      operation: "slide_count_decision",
      model: "claude-haiku-4-5-20251001",
      messages: [
        {
          role: "system",
          content: withAiFormattingRules(
            "You decide how many list-item slides a carousel should have. Return structured tool output only."
          ),
        },
        {
          role: "user",
          content: `Template: ${template.name}
${template.description}

Niche/topic for this remake: ${niche}

This template's middle section currently has ${defaultCount} list-item slides. Decide the ideal number of list-item slides for this specific niche and content - not necessarily ${defaultCount}. Consider: is this a quick, punchy topic (fewer items, 3-5) or a comprehensive reference-style topic (more items, 8-15+)? Pick a number between ${MIN_SLIDE_COUNT} and ${MAX_SLIDE_COUNT}.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "carousel_slide_count_decision",
          strict: true,
          schema: {
            type: "object",
            properties: {
              slideCount: {
                type: "integer",
                description: `Ideal number of list-item slides between ${MIN_SLIDE_COUNT} and ${MAX_SLIDE_COUNT} inclusive.`,
              },
            },
            required: ["slideCount"],
            additionalProperties: false,
          },
        },
      },
    });

    const raw = String(response.choices[0]?.message?.content ?? "{}");
    const parsed = parseLlmJson<{ slideCount?: number }>(raw, {});
    const count = parsed.slideCount;
    if (
      typeof count === "number" &&
      Number.isInteger(count) &&
      count >= MIN_SLIDE_COUNT &&
      count <= MAX_SLIDE_COUNT
    ) {
      return count;
    }
  } catch (err) {
    console.warn("[carouselRemake] decideSlideCount failed, using template default", err);
  }
  return defaultCount;
}

/** Count of "middle" slides (not the first hook, not the last cta). */
function countMiddleSlides(template: CarouselTemplate): number {
  return Math.max(template.slides.length - 2, 1);
}

/**
 * Build an ephemeral slide list with a different middle-section count than
 * the template's own. Keeps the template's real hook (first slide) and cta
 * (last slide) unchanged; clones the template's first middle slide as the
 * repeating pattern for layout/slots/budgets, renumbering ids and "kicker"
 * number text.
 */
/** Rotate Style hints on cloned middle slides so prompts do not collide. */
function rotateClonedStyleHint(
  baseHint: string,
  slotId: string,
  cloneIndex: number
): string {
  const topAlts = [
    baseHint,
    "accomplished professional celebrating a milestone, warm natural light",
    "confident person in a polished setting, soft golden hour light",
  ];
  const bottomAlts = [
    baseHint,
    "person working late with focused intensity, dim room light",
    "younger professional grinding on laptop, candid night vibe",
  ];
  const isBottom =
    slotId === "photo_bottom" ||
    slotId.endsWith("_bottom") ||
    slotId.includes("before");
  const isTop =
    slotId === "photo_top" ||
    slotId.endsWith("_top") ||
    slotId.includes("after");
  const alts = isBottom ? bottomAlts : isTop ? topAlts : [baseHint];
  return alts[cloneIndex % alts.length] ?? baseHint;
}

function buildDynamicSlideList(
  template: CarouselTemplate,
  desiredMiddleCount: number,
  outlineListItemIndexes?: Array<number | null>
): CarouselSlideSpec[] {
  const hook = template.slides[0];
  const cta = template.slides[template.slides.length - 1];
  const middlePattern = template.slides[1] ?? template.slides[0];

  const middleSlides: CarouselSlideSpec[] = [];
  for (let i = 0; i < desiredMiddleCount; i++) {
    const listItemIndex = outlineListItemIndexes?.[i + 1];
    const num =
      typeof listItemIndex === "number"
        ? formatCarouselListItemNumber(listItemIndex)
        : outlineListItemIndexes
          ? "·"
          : String(i + 1).padStart(2, "0");
    const clonedSlots = middlePattern.slots.map((slot) => {
      if (slot.role === "kicker") {
        return { ...slot, defaultText: num };
      }
      return { ...slot };
    });
    const clonedImageSlots = middlePattern.imageSlots?.map((imgSlot) => ({
      ...imgSlot,
      searchQueryHint: rotateClonedStyleHint(
        imgSlot.searchQueryHint,
        imgSlot.id,
        i
      ),
    }));
    middleSlides.push({
      ...middlePattern,
      id: `slide_${String(i + 2).padStart(2, "0")}`,
      slots: clonedSlots,
      ...(clonedImageSlots ? { imageSlots: clonedImageSlots } : {}),
    });
  }

  const ctaRenumbered: CarouselSlideSpec = {
    ...cta,
    id: `slide_${String(desiredMiddleCount + 2).padStart(2, "0")}`,
  };

  return [{ ...hook, id: "slide_01" }, ...middleSlides, ctaRenumbered];
}

export function effectiveSlidesForCreativeBrief(
  template: CarouselTemplate,
  brief: CarouselCreativeBrief,
  sourceContent?: string,
  planningIR?: CarouselPlanningIR | null
): CarouselSlideSpec[] {
  const resolvedIR =
    planningIR ?? planningIRForModernBrief(brief, sourceContent);
  const plannedCount =
    resolvedIR && resolvedIR.beats.length > 0
      ? resolvedIR.beats.length
      : brief.slideOutline.length > 0
        ? brief.slideOutline.length
        : brief.estimatedSlideCount;
  const targetMiddleCount = Math.min(Math.max(plannedCount - 2, 3), 18);
  const irListIndexes = resolvedIR
    ? planningIRListItemIndexes(resolvedIR)
    : [];
  const outlineListItemIndexes =
    resolvedIR && planningIRUsesListSequence(resolvedIR)
      ? irListIndexes
      : brief.slideOutline.some((slide) => slide.listItemIndex != null)
        ? brief.slideOutline.map((slide) =>
            typeof slide.listItemIndex === "number" ? slide.listItemIndex : null
          )
        : undefined;
  return buildDynamicSlideList(
    template,
    targetMiddleCount,
    outlineListItemIndexes
  );
}

/**
 * Background job: rewrite all carousel slot text for a niche, optionally at
 * a different slide count than the template's default.
 * Mirrors runScriptGeneration: never throws to the fire-and-forget caller.
 */
export async function generateCarouselRemake(
  remakeId: number,
  templateId: string,
  niche: string,
  options?: {
    slideCountOption?: number | "auto";
    uploadedImageUrls?: Record<string, string>;
    uploadedImagePool?: string[];
    /** When set, convert this source text into slides instead of niche-only rewrite. */
    sourceContent?: string;
    /**
     * Carousel Studio: selected angle title + description.
     * Legacy only. Prepended onto sourceContent when no creativeBrief is provided.
     */
    angleDirection?: string;
    /** Carousel Studio: complete selected brief, kept separate from sourceContent. */
    creativeBrief?: CarouselCreativeBrief;
    /** Source carousel slide images; worker analyzes then remakes from that structure. */
    analysisImageUrls?: string[];
    /**
     * Path B: single source reel/video thumbnail for vision grounding on all slides.
     * Prefer a stable R2 URL when sourceReelId is also provided.
     */
    sourceImage?: string | null;
    /** Platform external id for ensureReelThumbnailOnR2 (Bug #62 CDN expiry). */
    sourceReelId?: string | null;
    telemetry?: GenerationTelemetryContext;
  }
): Promise<void> {
  const telemetry =
    options?.telemetry ??
    createGenerationTelemetryContext({
      entryPoint: "generateCarouselRemake",
      remakeId,
    });
  if (telemetry) telemetry.remakeId = remakeId;
  if (telemetry && getActiveGenerationTelemetry()?.runId !== telemetry.runId) {
    return runWithGenerationTelemetry(telemetry, () =>
      generateCarouselRemake(remakeId, templateId, niche, {
        ...options,
        telemetry,
      })
    );
  }

  const slideCountOption = options?.slideCountOption;
  const uploadedImageUrls = options?.uploadedImageUrls;
  const uploadedImagePool = options?.uploadedImagePool;
  let sourceContent = options?.sourceContent?.trim() || undefined;
  const creativeBrief = options?.creativeBrief;
  const planningIR = planningIRForModernBrief(creativeBrief, sourceContent);
  const angleDirection = options?.angleDirection?.trim();
  if (!creativeBrief && angleDirection) {
    sourceContent = sourceContent
      ? `Chosen carousel angle (follow this direction):\n${angleDirection}\n\nSource material:\n${sourceContent}`
      : `Chosen carousel angle (follow this direction):\n${angleDirection}`;
  }
  const analysisImageUrls = options?.analysisImageUrls?.filter(Boolean) ?? [];
  const fromAnalysis = analysisImageUrls.length >= 2;
  /** Vision-grounding stills in slide order (Path A) or a single shared thumb (Path B). */
  let visionSourceStills: string[] = [];
  const db = await getDb();
  if (!db) {
    console.error(`[carouselRemake] ${remakeId}: database unavailable`);
    return;
  }

  try {
    const template = CAROUSEL_TEMPLATES_BY_ID.get(templateId);
    if (!template) {
      const errorMessage = `Unknown carousel template: ${templateId}`;
      await persistTerminalRemake(
        remakeId,
        {
          status: "failed",
          progressStage: null,
          errorMessage,
        },
        finalizeGenerationMetrics(telemetry, "failed", remakeId, {
          failureStage: "unknown_template",
          errorCategory: "unknown_template",
        })
      );
      return;
    }

    const irGate = planningIRCopyGenerationGate(planningIR);
    if (irGate.blocked) {
      const errorMessage = `Planning IR invalid: ${irGate.issues.slice(0, 5).join("; ")}`;
      await persistTerminalRemake(
        remakeId,
        {
          status: "failed",
          progressStage: null,
          errorMessage,
        },
        finalizeGenerationMetrics(telemetry, "failed", remakeId, {
          failureStage: "planning_ir_validation",
          errorCategory: irGate.errorCategory,
        })
      );
      return;
    }

    // Path B: stabilize IG CDN thumbs on R2 when we have a reel id.
    let pathBSourceImage = options?.sourceImage?.trim() || null;
    const pathBReelId = options?.sourceReelId?.trim() || null;
    if (pathBSourceImage && pathBReelId) {
      try {
        pathBSourceImage = await ensureReelThumbnailOnR2(
          pathBReelId,
          pathBSourceImage
        );
      } catch (err) {
        console.warn(
          `[carouselRemake] ${remakeId}: ensureReelThumbnailOnR2 failed, using raw URL`,
          err instanceof Error ? err.message : err
        );
      }
    } else if (pathBSourceImage && !pathBReelId) {
      // URL-only thumb may expire if it is an IG CDN signed URL; no reelId to mirror.
      console.warn(
        `[carouselRemake] ${remakeId}: sourceImage without sourceReelId; CDN URLs may expire`
      );
    }
    if (pathBSourceImage) {
      visionSourceStills = [pathBSourceImage];
    }

    // Resolve the actual slide list to generate against.
    let effectiveSlides: CarouselSlideSpec[] = template.slides;
    let fromAnalysisSlides = false;
    if (fromAnalysis) {
      const analysis = await withGenerationStage(
        telemetry,
        "source_vision_analysis",
        () => analyzeSourceCarousel(analysisImageUrls)
      );
      if (analysis.slides.length === 0) {
        throw new Error(
          "Could not analyze this carousel's slides. Please try a different Instagram post."
        );
      }
      effectiveSlides = buildSlidesFromAnalysis(analysis);
      sourceContent = sourceContentFromAnalysis(analysis);
      fromAnalysisSlides = true;
      // Reuse base64/data URLs from analysis download (no second CDN fetch).
      visionSourceStills =
        analysis.resolvedImageUrls.filter(Boolean).length > 0
          ? analysis.resolvedImageUrls.filter(Boolean)
          : analysisImageUrls;
    } else if (creativeBrief && creativeBrief.slideOutline.length > 0) {
      if (planningIR && canUseComparisonFamily(planningIR)) {
        const visualDirection = await withGenerationStage(
          telemetry,
          "visual_direction",
          () => generateCarouselVisualDirection(planningIR)
        );
        console.log(
          `[carouselRemake] ${remakeId}: Visual Director source=${visualDirection.source} attempts=${visualDirection.attempts}`
        );
        if (visualDirection.source === "baseline_fallback") {
          console.warn(
            `[carouselRemake] ${remakeId}: Visual Director fell back to baseline composition`,
            visualDirection.issues.slice(0, 5).join("; ")
          );
        }
        effectiveSlides = buildComparisonFamilySlides({
          template,
          planningIR,
          compositionIR: visualDirection.compositionIR,
        });
      } else if (planningIR && canUseStoryNarrativeFamily(planningIR)) {
        const visualDirection = await withGenerationStage(
          telemetry,
          "visual_direction",
          () => generateCarouselVisualDirection(planningIR)
        );
        console.log(
          `[carouselRemake] ${remakeId}: Visual Director source=${visualDirection.source} attempts=${visualDirection.attempts}`
        );
        if (visualDirection.source === "baseline_fallback") {
          console.warn(
            `[carouselRemake] ${remakeId}: Visual Director fell back to baseline composition`,
            visualDirection.issues.slice(0, 5).join("; ")
          );
        }
        effectiveSlides = buildStoryNarrativeSlides({
          template,
          planningIR,
          compositionIR: visualDirection.compositionIR,
        });
      } else if (planningIR && canUseFrameworkFamily(planningIR)) {
        const visualDirection = await withGenerationStage(
          telemetry,
          "visual_direction",
          () => generateCarouselVisualDirection(planningIR)
        );
        console.log(
          `[carouselRemake] ${remakeId}: Visual Director source=${visualDirection.source} attempts=${visualDirection.attempts}`
        );
        if (visualDirection.source === "baseline_fallback") {
          console.warn(
            `[carouselRemake] ${remakeId}: Visual Director fell back to baseline composition`,
            visualDirection.issues.slice(0, 5).join("; ")
          );
        }
        effectiveSlides = buildFrameworkFamilySlides({
          template,
          planningIR,
          compositionIR: visualDirection.compositionIR,
        });
      } else if (planningIR && canUseRoadmapFamily(planningIR)) {
        const visualDirection = await withGenerationStage(
          telemetry,
          "visual_direction",
          () => generateCarouselVisualDirection(planningIR)
        );
        console.log(
          `[carouselRemake] ${remakeId}: Visual Director source=${visualDirection.source} attempts=${visualDirection.attempts}`
        );
        if (visualDirection.source === "baseline_fallback") {
          console.warn(
            `[carouselRemake] ${remakeId}: Visual Director fell back to baseline composition`,
            visualDirection.issues.slice(0, 5).join("; ")
          );
        }
        effectiveSlides = buildRoadmapFamilySlides({
          template,
          planningIR,
          compositionIR: visualDirection.compositionIR,
        });
      } else if (planningIR && canUseBreakdownListicleFamily(planningIR)) {
        const visualDirection = await withGenerationStage(
          telemetry,
          "visual_direction",
          () => generateCarouselVisualDirection(planningIR)
        );
        console.log(
          `[carouselRemake] ${remakeId}: Visual Director source=${visualDirection.source} attempts=${visualDirection.attempts}`
        );
        if (visualDirection.source === "baseline_fallback") {
          console.warn(
            `[carouselRemake] ${remakeId}: Visual Director fell back to baseline composition`,
            visualDirection.issues.slice(0, 5).join("; ")
          );
        }
        effectiveSlides = buildBreakdownListicleSlides({
          template,
          planningIR,
          compositionIR: visualDirection.compositionIR,
        });
      } else {
        effectiveSlides = effectiveSlidesForCreativeBrief(
          template,
          creativeBrief,
          sourceContent,
          planningIR
        );
      }
    } else if (slideCountOption !== undefined) {
      const defaultMiddleCount = countMiddleSlides(template);
      const targetMiddleCount =
        slideCountOption === "auto"
          ? await withGenerationStage(telemetry, "slide_count_decision", () =>
              decideSlideCount(template, niche)
            )
          : Math.min(Math.max(slideCountOption, MIN_SLIDE_COUNT), MAX_SLIDE_COUNT);

      if (targetMiddleCount !== defaultMiddleCount) {
        effectiveSlides = buildDynamicSlideList(template, targetMiddleCount);
      }
    }

    // Skip vetted facts for content-to-carousel; source text is authoritative.
    const lockedFacts = sourceContent
      ? (new Map() as LockedSlideFacts)
      : selectVettedFactsForSlides(template.id, niche, effectiveSlides);
    if (lockedFacts.size > 0) {
      console.log(
        `[carouselRemake] ${remakeId}: locked ${lockedFacts.size} vetted fact(s): ${[
          ...lockedFacts.entries(),
        ]
          .map(([slideId, fact]) => `${slideId}=${fact.id}`)
          .join(", ")}`
      );
    }

    const promptDescription = fromAnalysisSlides
      ? "A remake of a source Instagram carousel. Keep each slide's layout and slot roles. Rewrite the extracted source text for this creator's niche and voice."
      : template.description;

    await db
      .update(carouselRemakes)
      .set({ progressStage: "writing_copy" })
      .where(eq(carouselRemakes.id, remakeId));

    const { values: generatedValues, validation } = await withGenerationStage(
      telemetry,
      "copy_generation",
      async () => {
        let nextValues = await invokeCarouselRemakeOnce(
          template.name,
          promptDescription,
          effectiveSlides,
          niche,
          lockedFacts,
          undefined,
          sourceContent,
          creativeBrief,
          planningIR
        );
        let nextValidation = validateGeneratedCarouselCopy(
          effectiveSlides,
          nextValues,
          lockedFacts,
          creativeBrief,
          planningIR
        );

        if (!nextValidation.ok) {
          nextValues = await invokeCarouselRemakeOnce(
            template.name,
            promptDescription,
            effectiveSlides,
            niche,
            lockedFacts,
            nextValidation.issues.join("\n"),
            sourceContent,
            creativeBrief,
            planningIR
          );
          nextValidation = validateGeneratedCarouselCopy(
            effectiveSlides,
            nextValues,
            lockedFacts,
            creativeBrief,
            planningIR
          );
        }
        return { values: nextValues, validation: nextValidation };
      }
    );
    const values = applyPlanningSequenceToCopy(
      effectiveSlides,
      stripSlideIntentMetadata(generatedValues)
    );

    if (!validation.ok) {
      const hardIssues = validation.issues.filter(
        (issue) => !issue.includes(" length ")
      );
      if (hardIssues.length > 0) {
        const errorMessage = `Slot text missing after retry: ${hardIssues.slice(0, 5).join("; ")}`;
        await persistTerminalRemake(
          remakeId,
          {
            status: "failed",
            progressStage: null,
            errorMessage,
          },
          finalizeGenerationMetrics(telemetry, "failed", remakeId, {
            failureStage: "copy_generation",
            errorCategory: "validation",
          })
        );
        return;
      }
      console.warn(
        `[carouselRemake] ${remakeId}: keeping slot text outside character budgets after retry: ${validation.issues.slice(0, 8).join("; ")}`
      );
    }

    // Soft visibility only: do not fail or retry on weak not_line echo.
    warnAverageNotLineConsistency(effectiveSlides, values);

    await db
      .update(carouselRemakes)
      .set({ progressStage: "generating_images" })
      .where(eq(carouselRemakes.id, remakeId));

    const imageUrls: CarouselImageUrlMap = {};
    // Per-generation-job dedupe only (not persisted across remakes).
    const usedImageUrls = new Set<string>();

    const pool =
      uploadedImagePool && uploadedImagePool.length > 0
        ? uploadedImagePool
        : Object.values(uploadedImageUrls ?? {}).filter(Boolean);

    if (fromAnalysisSlides) {
      for (let slideIndex = 0; slideIndex < effectiveSlides.length; slideIndex++) {
        const slide = effectiveSlides[slideIndex]!;
        if (!slide.imageSlots?.length) continue;
        const slideVals = values[slide.id] ?? {};
        const sourceImage = sourceImageForSlideIndex(visionSourceStills, slideIndex);
        if (slide.imageSlots.length === 1) {
          const imageSlot = slide.imageSlots[0];
          const resolvedUrl = await resolveSlideImage(
            imageSlot.searchQueryHint,
            niche,
            undefined,
            imageTextContextForSlide(slide, slideVals, imageSlot.id),
            {
              usedUrls: usedImageUrls,
              sourceImage,
              slideId: slide.id,
              imageSlotId: imageSlot.id,
              telemetry,
            }
          );
          if (resolvedUrl) imageUrls[slide.id] = resolvedUrl;
          continue;
        }
        const bySlot: Record<string, string> = {};
        for (const imageSlot of slide.imageSlots) {
          const resolvedUrl = await resolveSlideImage(
            imageSlot.searchQueryHint,
            niche,
            undefined,
            imageTextContextForSlide(slide, slideVals, imageSlot.id),
            {
              usedUrls: usedImageUrls,
              sourceImage,
              slideId: slide.id,
              imageSlotId: imageSlot.id,
              telemetry,
            }
          );
          if (resolvedUrl) bySlot[imageSlot.id] = resolvedUrl;
        }
        if (Object.keys(bySlot).length > 0) {
          imageUrls[slide.id] = bySlot;
        }
      }
    } else if (template.imagePoolAssign) {
      const needs: PhotoSlotNeed[] = [];
      for (const slide of effectiveSlides) {
        if (!slide.imageSlots?.length) continue;
        for (const imageSlot of slide.imageSlots) {
          const slideVals = values[slide.id] ?? {};
          const labelLower = imageSlot.label.toLowerCase();
          const isAfter =
            imageSlot.id.includes("after") ||
            labelLower.includes("after") ||
            labelLower.includes("reframe") ||
            labelLower.includes("win") ||
            labelLower.includes("success") ||
            labelLower.includes("outcome") ||
            labelLower.includes("discipline");
          // Prefer the matching excuse line for this cell (cover grid:
          // photo_tl -> excuse_tl). Fall back to shared "excuse", then first text.
          const textContext =
            textContextForImageSlot(slideVals, imageSlot.id) ||
            imageSlot.searchQueryHint;
          needs.push({
            key: `${slide.id}::${imageSlot.id}`,
            slideId: slide.id,
            slotId: imageSlot.id,
            roleHint: isAfter
              ? "after/success / discipline energy (color)"
              : "before/excuse / comfort energy",
            textContext,
            searchQueryHint: imageSlot.searchQueryHint,
          });
        }
      }

      if (pool.length > 0) {
        const assigned = await assignPoolPhotosToSlots(pool, needs, niche);
        for (const need of needs) {
          const url = assigned[need.key];
          try {
            telemetry?.collector.recordImageSlot({
              slideId: need.slideId,
              imageSlotId: need.slotId,
              sourcePath: url ? "pool" : "fallback",
              model: null,
              requestedSize: null,
              requestedQuality: null,
              attemptNumber: 1,
              durationMs: 0,
              apiRequestSucceeded: false,
              imageReturned: Boolean(url),
              storageSucceeded: Boolean(url),
              slotResolved: Boolean(url),
              retryCount: 0,
              errorCategory: url ? null : "validation",
            });
          } catch (err) {
            console.error("[carouselTelemetry] pool image record failed", err);
          }
          if (!url) continue;
          usedImageUrls.add(url);
          const existing = imageUrls[need.slideId];
          if (typeof existing === "string" || !existing) {
            imageUrls[need.slideId] = { [need.slotId]: url };
          } else {
            existing[need.slotId] = url;
          }
        }
      } else {
        const slideIndexById = new Map(
          effectiveSlides.map((s, i) => [s.id, i] as const)
        );
        for (const need of needs) {
          const slideIndex = slideIndexById.get(need.slideId) ?? 0;
          const resolvedUrl = await resolveSlideImage(
            need.searchQueryHint,
            niche,
            undefined,
            need.textContext,
            {
              usedUrls: usedImageUrls,
              sourceImage: sourceImageForSlideIndex(visionSourceStills, slideIndex),
              slideId: need.slideId,
              imageSlotId: need.slotId,
              telemetry,
            }
          );
          if (!resolvedUrl) continue;
          const existing = imageUrls[need.slideId];
          if (typeof existing === "string" || !existing) {
            imageUrls[need.slideId] = { [need.slotId]: resolvedUrl };
          } else {
            existing[need.slotId] = resolvedUrl;
          }
        }
      }
    } else {
      for (let slideIndex = 0; slideIndex < effectiveSlides.length; slideIndex++) {
        const slide = effectiveSlides[slideIndex]!;
        if (!slide.imageSlots?.length) continue;
        const slideVals = values[slide.id] ?? {};
        const uploaded = uploadedImageUrls?.[slide.id];
        const sourceImage = sourceImageForSlideIndex(
          visionSourceStills,
          slideIndex
        );

        if (isComparisonFamilySlide(slide) && slide.imageSlots.length > 1) {
          const bySlot: Record<string, string> = {};
          for (const [slotIndex, imageSlot] of slide.imageSlots.entries()) {
            const resolvedUrl = await resolveSlideImage(
              imageSlot.searchQueryHint,
              niche,
              slotIndex === 0 ? uploaded : undefined,
              imageTextContextForSlide(slide, slideVals, imageSlot.id),
              {
                usedUrls: usedImageUrls,
                sourceImage,
                slideId: slide.id,
                imageSlotId: imageSlot.id,
                telemetry,
              }
            );
            if (resolvedUrl) bySlot[imageSlot.id] = resolvedUrl;
          }
          if (Object.keys(bySlot).length > 0) {
            imageUrls[slide.id] = bySlot;
          }
          continue;
        }

        // MVP: resolve only the first image slot per slide (legacy templates).
        const imageSlot = slide.imageSlots[0]!;
        const resolvedUrl = await resolveSlideImage(
          imageSlot.searchQueryHint,
          niche,
          uploaded,
          imageTextContextForSlide(slide, slideVals, imageSlot.id),
          {
            usedUrls: usedImageUrls,
            sourceImage,
            slideId: slide.id,
            imageSlotId: imageSlot.id,
            telemetry,
          }
        );
        if (resolvedUrl) {
          imageUrls[slide.id] = resolvedUrl;
        }
      }

      // Style A: one cover photo reused on every slide.
      if (template.shareCoverImage) {
        const coverEntry =
          imageUrls[
            effectiveSlides.find((s) => s.imageSlots && s.imageSlots.length > 0)
              ?.id ?? ""
          ] ?? Object.values(imageUrls)[0];
        const coverUrl =
          typeof coverEntry === "string"
            ? coverEntry
            : coverEntry
              ? Object.values(coverEntry)[0]
              : undefined;
        if (coverUrl) {
          for (const slide of effectiveSlides) {
            imageUrls[slide.id] = coverUrl;
          }
        }
      }
    }

    await db
      .update(carouselRemakes)
      .set({ progressStage: "saving" })
      .where(eq(carouselRemakes.id, remakeId));

    telemetry?.collector.setSlidesGenerated(effectiveSlides.length);
    telemetry?.collector.recordStage("final_save", 0, "ok");
    const completedFields = {
      status: "completed" as const,
      progressStage: null,
      slotValuesJson: values,
      slideStructureJson: effectiveSlides,
      imageUrlsJson: Object.keys(imageUrls).length > 0 ? imageUrls : null,
      errorMessage: null,
    };
    await persistTerminalRemake(
      remakeId,
      completedFields,
      finalizeGenerationMetrics(telemetry, "completed", remakeId)
    );
  } catch (error) {
    const message = formatIdeaScriptErrorForUser(error, "remake");
    try {
      await persistTerminalRemake(
        remakeId,
        {
          status: "failed",
          progressStage: null,
          errorMessage: message,
        },
        finalizeGenerationMetrics(telemetry, "failed", remakeId, {
          errorCategory: categorizeGenerationError(error),
        })
      );
    } catch (markErr) {
      console.error(
        `[carouselRemake] failed to mark remake ${remakeId} as failed:`,
        markErr
      );
    }
  }
}
