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

/** Programmatically derive a forced-tool JSON schema from the template slides/slots. */
export function buildCarouselRemakeJsonSchema(template: CarouselTemplate): {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const slide of template.slides) {
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
  template: CarouselTemplate,
  niche: string
): string {
  const slideBlocks = template.slides
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

Template: ${template.name}
${template.description}

Rules:
1. Rewrite every slot for the niche above. Be specific and postable. Zero generic filler.
2. Preserve each slide's viral beat exactly as described in "Viral why".
3. Character budgets are HARD limits. Every string MUST be between min and max inclusive (count characters, including spaces).
4. Keep the same structure: hooks stay hooks, list items stay list items, CTAs stay CTAs.
5. Use defaultText only as a tone and length reference, not as copy to keep.
6. Return ONLY the tool payload with every slide id and every slot id filled.

${slideBlocks}`;
}

function validateBudgets(
  template: CarouselTemplate,
  values: CarouselSlideValuesMap
): { ok: true } | { ok: false; issues: string[] } {
  const issues: string[] = [];
  for (const slide of template.slides) {
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
  template: CarouselTemplate,
  niche: string,
  repairNote?: string
): Promise<CarouselSlideValuesMap> {
  const schema = buildCarouselRemakeJsonSchema(template);
  const userPrompt = repairNote
    ? `${buildCarouselRemakePrompt(template, niche)}\n\nPREVIOUS OUTPUT FAILED VALIDATION. Fix ONLY these issues and return a full corrected payload:\n${repairNote}`
    : buildCarouselRemakePrompt(template, niche);

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
 * Background job: rewrite all carousel slot text for a niche.
 * Mirrors runScriptGeneration: never throws to the fire-and-forget caller.
 */
export async function generateCarouselRemake(
  remakeId: number,
  templateId: string,
  niche: string
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

    let values = await invokeCarouselRemakeOnce(template, niche);
    let validation = validateBudgets(template, values);

    if (!validation.ok) {
      // Prefer one structured re-ask over silent truncation.
      values = await invokeCarouselRemakeOnce(
        template,
        niche,
        validation.issues.join("\n")
      );
      validation = validateBudgets(template, values);
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
