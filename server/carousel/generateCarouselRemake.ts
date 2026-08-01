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
import { resolveSlideImage } from "./resolveSlideImage";
import {
  assignPoolPhotosToSlots,
  type PhotoSlotNeed,
} from "./assignPoolPhotos";
import type { CarouselImageUrlMap } from "@shared/carouselTemplates";

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

  const first = Object.values(slideVals).find(
    (v) => typeof v === "string" && v.trim().length > 0
  );
  return first?.trim() ?? "";
}

function buildSlotSchemaForSlide(slide: CarouselSlideSpec): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const slot of slide.slots) {
    properties[slot.id] = {
      type: "string",
      description: `${slot.label} (${slot.role}). ${slot.budget.min}-${slot.budget.max} characters.`,
    };
    required.push(slot.id);
  }
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
  strict: true;
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
    strict: true,
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

function buildCarouselRemakePrompt(
  templateName: string,
  templateDescription: string,
  slides: CarouselSlideSpec[],
  niche: string,
  lockedFacts: LockedSlideFacts = new Map()
): string {
  const hasAverageNotPair = slides.some(slideHasAverageNotLinePair);
  const unlockedAverageSlides = slides.filter(
    (slide) => slideHasAverageNotLinePair(slide) && !lockedFacts.has(slide.id)
  );

  const slideBlocks = slides
    .map((slide) => {
      const locked = lockedFacts.get(slide.id);
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
      return `Slide ${slide.id} (role: ${slide.role}):
Viral why (preserve this beat): ${slide.viralWhy}${lockNote}
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
7. Return ONLY the tool payload with every slide id and every slot id filled.${averageNotRule}${noNamedBrandRule}
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
  repairNote?: string
): Promise<CarouselSlideValuesMap> {
  const schema = buildCarouselRemakeJsonSchema(slides);
  const basePrompt = buildCarouselRemakePrompt(
    templateName,
    templateDescription,
    slides,
    niche,
    lockedFacts
  );
  const userPrompt = repairNote
    ? `${basePrompt}\n\nPREVIOUS OUTPUT FAILED VALIDATION. Fix ONLY these issues and return a full corrected payload:\n${repairNote}`
    : basePrompt;

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You rewrite carousel slide text for SpyReels. Respect character budgets strictly. Return structured tool output only."
        ),
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
/** Rotate Style hints on cloned middle slides so Pexels queries do not collide. */
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
  desiredMiddleCount: number
): CarouselSlideSpec[] {
  const hook = template.slides[0];
  const cta = template.slides[template.slides.length - 1];
  const middlePattern = template.slides[1] ?? template.slides[0];

  const middleSlides: CarouselSlideSpec[] = [];
  for (let i = 0; i < desiredMiddleCount; i++) {
    const num = String(i + 1).padStart(2, "0");
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
  }
): Promise<void> {
  const slideCountOption = options?.slideCountOption;
  const uploadedImageUrls = options?.uploadedImageUrls;
  const uploadedImagePool = options?.uploadedImagePool;
  const db = await getDb();
  if (!db) {
    console.error(`[carouselRemake] ${remakeId}: database unavailable`);
    return;
  }

  try {
    const template = CAROUSEL_TEMPLATES_BY_ID.get(templateId);
    if (!template) {
      await db
        .update(carouselRemakes)
        .set({
          status: "failed",
          errorMessage: `Unknown carousel template: ${templateId}`,
        })
        .where(eq(carouselRemakes.id, remakeId));
      return;
    }

    // Resolve the actual slide list to generate against.
    let effectiveSlides: CarouselSlideSpec[] = template.slides;
    if (slideCountOption !== undefined) {
      const defaultMiddleCount = countMiddleSlides(template);
      const targetMiddleCount =
        slideCountOption === "auto"
          ? await decideSlideCount(template, niche)
          : Math.min(Math.max(slideCountOption, MIN_SLIDE_COUNT), MAX_SLIDE_COUNT);

      if (targetMiddleCount !== defaultMiddleCount) {
        effectiveSlides = buildDynamicSlideList(template, targetMiddleCount);
      }
    }

    // Per-job vetted fact selection (ids not reused across slides in this remake).
    const lockedFacts = selectVettedFactsForSlides(
      template.id,
      niche,
      effectiveSlides
    );
    if (lockedFacts.size > 0) {
      console.log(
        `[carouselRemake] ${remakeId}: locked ${lockedFacts.size} vetted fact(s): ${[
          ...lockedFacts.entries(),
        ]
          .map(([slideId, fact]) => `${slideId}=${fact.id}`)
          .join(", ")}`
      );
    }

    let values = await invokeCarouselRemakeOnce(
      template.name,
      template.description,
      effectiveSlides,
      niche,
      lockedFacts
    );
    let validation = validateBudgets(effectiveSlides, values, lockedFacts);

    if (!validation.ok) {
      values = await invokeCarouselRemakeOnce(
        template.name,
        template.description,
        effectiveSlides,
        niche,
        lockedFacts,
        validation.issues.join("\n")
      );
      validation = validateBudgets(effectiveSlides, values, lockedFacts);
      if (!validation.ok) {
        await db
          .update(carouselRemakes)
          .set({
            status: "failed",
            errorMessage: `Slot text outside character budgets after retry: ${validation.issues.slice(0, 5).join("; ")}`,
          })
          .where(eq(carouselRemakes.id, remakeId));
        return;
      }
    }

    // Soft visibility only: do not fail or retry on weak not_line echo.
    warnAverageNotLineConsistency(effectiveSlides, values);

    const imageUrls: CarouselImageUrlMap = {};
    // Per-generation-job dedupe only (not persisted across remakes).
    const usedImageUrls = new Set<string>();

    const pool =
      uploadedImagePool && uploadedImagePool.length > 0
        ? uploadedImagePool
        : Object.values(uploadedImageUrls ?? {}).filter(Boolean);

    if (template.imagePoolAssign) {
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
        for (const need of needs) {
          const resolvedUrl = await resolveSlideImage(
            need.searchQueryHint,
            niche,
            undefined,
            need.textContext,
            {
              usedUrls: usedImageUrls,
              dedupeDifferentiator: `${need.slideId}-${need.slotId}`,
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
      for (const slide of effectiveSlides) {
        if (slide.imageSlots && slide.imageSlots.length > 0) {
          // MVP: resolve only the first image slot per slide (legacy templates).
          const imageSlot = slide.imageSlots[0];
          const uploaded = uploadedImageUrls?.[slide.id];
          const resolvedUrl = await resolveSlideImage(
            imageSlot.searchQueryHint,
            niche,
            uploaded,
            undefined,
            {
              usedUrls: usedImageUrls,
              dedupeDifferentiator: slide.id,
            }
          );
          if (resolvedUrl) {
            imageUrls[slide.id] = resolvedUrl;
          }
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
      .set({
        status: "completed",
        slotValuesJson: values,
        slideStructureJson: effectiveSlides,
        imageUrlsJson: Object.keys(imageUrls).length > 0 ? imageUrls : null,
        errorMessage: null,
      })
      .where(eq(carouselRemakes.id, remakeId));
  } catch (error) {
    const message = formatIdeaScriptErrorForUser(error, "remake");
    try {
      await db
        .update(carouselRemakes)
        .set({
          status: "failed",
          errorMessage: message,
        })
        .where(eq(carouselRemakes.id, remakeId));
    } catch (markErr) {
      console.error(
        `[carouselRemake] failed to mark remake ${remakeId} as failed:`,
        markErr
      );
    }
  }
}
