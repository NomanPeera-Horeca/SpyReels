import { eq } from "drizzle-orm";
import {
  CAROUSEL_TEMPLATES_BY_ID,
  type CarouselSlideSpec,
  type CarouselTemplate,
} from "@shared/carouselTemplates";
import { carouselRemakes } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { getDb } from "../db";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";
import { formatIdeaScriptErrorForUser } from "@shared/ideaScriptErrors";

export type CarouselSlideValuesMap = Record<string, Record<string, string>>;

const MIN_SLIDE_COUNT = 3;
const MAX_SLIDE_COUNT = 20;

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

function buildCarouselRemakePrompt(
  templateName: string,
  templateDescription: string,
  slides: CarouselSlideSpec[],
  niche: string
): string {
  const slideBlocks = slides
    .map((slide) => {
      const slotLines = slide.slots
        .map(
          (slot) =>
            `- slot "${slot.id}" (${slot.role}, label "${slot.label}"): ${slot.budget.min}-${slot.budget.max} characters. Tone/length reference: "${slot.defaultText}"`
        )
        .join("\n");
      return `Slide ${slide.id} (role: ${slide.role}):
Viral why (preserve this beat): ${slide.viralWhy}
Slots:
${slotLines}`;
    })
    .join("\n\n");

  return `You rewrite Instagram carousel slide text for a creator's niche. The template layout, fonts, colors, and slide order are LOCKED. You only rewrite slot text.

Niche / topic for this remake:
${niche}

Template: ${templateName}
${templateDescription}

Rules:
1. Rewrite every slot for the niche above. Be specific and postable. Zero generic filler.
2. Preserve each slide's viral beat exactly as described in "Viral why".
3. Character budgets are HARD limits. Every string MUST be between min and max inclusive (count characters, including spaces).
4. Keep the same structure: hooks stay hooks, list items stay list items, CTAs stay CTAs.
5. Use defaultText only as a tone and length reference, not as copy to keep.
6. For slots with role "kicker":
   - If the slot label is "Kicker" (hook-style): use the plural noun for the target audience described in the niche above (e.g. "RESTAURANT OWNERS", "FITNESS COACHES", "REAL ESTATE AGENTS"). Do not invent a stylistic or generic word. If the niche names a specific audience noun, use that noun directly, uppercased.
   - If the slot label is "Number" or "Step number": use a short sequence number like "01", "02" (match the tone/length of defaultText).
   - If the slot label is "Stat": the kicker IS the statistic itself (e.g. "82%", "4X", "10K", "90"). Do not use audience nouns or sequence numbers. Prefer a short striking number within the character budget.
   Always stay within the character budget for that slot.
7. Return ONLY the tool payload with every slide id and every slot id filled.

${slideBlocks}`;
}

function validateBudgets(
  slides: CarouselSlideSpec[],
  values: CarouselSlideValuesMap
): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  for (const slide of slides) {
    const slideVals = values[slide.id];
    if (!slideVals || typeof slideVals !== "object") {
      issues.push(`Missing slide ${slide.id}`);
      continue;
    }
    for (const slot of slide.slots) {
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

async function invokeCarouselRemakeOnce(
  templateName: string,
  templateDescription: string,
  slides: CarouselSlideSpec[],
  niche: string,
  repairNote?: string
): Promise<CarouselSlideValuesMap> {
  const schema = buildCarouselRemakeJsonSchema(slides);
  const userPrompt = repairNote
    ? `${buildCarouselRemakePrompt(templateName, templateDescription, slides, niche)}\n\nPREVIOUS OUTPUT FAILED VALIDATION. Fix ONLY these issues and return a full corrected payload:\n${repairNote}`
    : buildCarouselRemakePrompt(templateName, templateDescription, slides, niche);

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
  return parsed;
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
    middleSlides.push({
      ...middlePattern,
      id: `slide_${String(i + 2).padStart(2, "0")}`,
      slots: clonedSlots,
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
  slideCountOption?: number | "auto"
): Promise<void> {
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

    let values = await invokeCarouselRemakeOnce(
      template.name,
      template.description,
      effectiveSlides,
      niche
    );
    let validation = validateBudgets(effectiveSlides, values);

    if (!validation.ok) {
      values = await invokeCarouselRemakeOnce(
        template.name,
        template.description,
        effectiveSlides,
        niche,
        validation.issues.join("\n")
      );
      validation = validateBudgets(effectiveSlides, values);
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

    await db
      .update(carouselRemakes)
      .set({
        status: "completed",
        slotValuesJson: values,
        slideStructureJson: effectiveSlides,
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
