import {
  type CarouselSlotRewriteAction,
  type CarouselSlotRewriteContext,
  validateCarouselSlotRewriteAlternatives,
  validateCarouselSlotRewriteText,
} from "@shared/carouselSlotRewrite";
import { invokeLLM } from "../_core/llm";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";

export const CAROUSEL_SLOT_REWRITE_MODEL = "claude-haiku-4-5-20251001";

export class CarouselSlotRewriteError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPTY"
      | "TOO_LONG"
      | "MISSING_FACT"
      | "INVALID_ALTERNATIVES"
      | "LLM_FAILED" = "LLM_FAILED"
  ) {
    super(message);
    this.name = "CarouselSlotRewriteError";
  }
}

const ACTION_INSTRUCTIONS: Record<CarouselSlotRewriteAction, string> = {
  make_punchier:
    "Make the selected copy punchier and more specific. Keep the same meaning. Do not invent a new topic or exaggerate unsupported claims.",
  make_shorter:
    "Make the selected copy shorter. Keep the core meaning. Stay under the character budget.",
  make_clearer:
    "Make the selected copy clearer and more direct. Keep the same topic and claim.",
  rewrite:
    "Rewrite the selected copy with fresh wording. Keep the same purpose, topic, and intent.",
  alternatives:
    "Return exactly 3 strong alternatives for the selected copy. Each option must keep the same topic and purpose.",
};

function compactContext(context: CarouselSlotRewriteContext) {
  return {
    originalIntent: {
      niche: context.niche,
      sourceUrl: context.sourceUrl,
      topic: context.brief?.topic ?? context.niche,
      title: context.brief?.title ?? null,
      hook: context.brief?.hook ?? null,
      corePromise: context.brief?.corePromise ?? null,
      centralInsight: context.brief?.centralInsight ?? null,
      ctaDirection: context.brief?.ctaDirection ?? null,
      prohibitedClaims: context.brief?.prohibitedClaims ?? [],
    },
    selectedSlide: {
      id: context.slide.id,
      purpose: context.slide.semanticRole ?? context.slide.role,
      viralWhy: context.slide.viralWhy,
      family: context.slide.family,
      position: `${context.slide.index + 1}/${context.slide.total}`,
    },
    selectedSlot: {
      id: context.slot.id,
      role: context.slot.role,
      label: context.slot.label,
      currentText: context.slot.currentText,
      maxCharacters: context.slot.budget.max,
      minCharacters: context.slot.budget.min,
    },
    nearby: context.nearby,
    factsYouMustKeep: context.factsToPreserve,
  };
}

function systemPrompt(action: CarouselSlotRewriteAction): string {
  return withAiFormattingRules(`You rewrite ONE selected carousel text slot.

Rules:
- The original user idea / topic is ground truth.
- Rewrite only the selected slot. Do not change strategy, layout, other slots, images, or design.
- Stay on the existing topic. Do not invent a new restaurant, niche, or article.
- Do not invent statistics, percentages, revenue numbers, names, or new claims.
- If the selected text already contains a number or percent, keep that exact fact.
- Do not use em dashes.
- Return JSON only.
- Single-result actions return {"text":"..."}.
- alternatives returns {"alternatives":["...","...","..."]} with exactly 3 strings.
- Respect maxCharacters. Prefer tighter copy over overflowing the slot.

${ACTION_INSTRUCTIONS[action]}`);
}

type SinglePayload = { text?: unknown };
type AlternativesPayload = { alternatives?: unknown };

async function invokeRewrite(
  action: CarouselSlotRewriteAction,
  context: CarouselSlotRewriteContext,
  extraInstruction?: string
): Promise<SinglePayload | AlternativesPayload> {
  const schema =
    action === "alternatives"
      ? {
          name: "carousel_slot_rewrite_alternatives",
          strict: true,
          schema: {
            type: "object",
            properties: {
              alternatives: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["alternatives"],
            additionalProperties: false,
          },
        }
      : {
          name: "carousel_slot_rewrite_text",
          strict: true,
          schema: {
            type: "object",
            properties: {
              text: { type: "string" },
            },
            required: ["text"],
            additionalProperties: false,
          },
        };

  const response = await invokeLLM({
    operation: "slot_text_rewrite",
    model: CAROUSEL_SLOT_REWRITE_MODEL,
    temperature: 0.4,
    maxTokens: 400,
    messages: [
      { role: "system", content: systemPrompt(action) },
      {
        role: "user",
        content: `${JSON.stringify(compactContext(context), null, 2)}${
          extraInstruction ? `\n\n${extraInstruction}` : ""
        }`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
  });

  const raw = String(response.choices[0]?.message?.content ?? "{}");
  return parseLlmJson<SinglePayload | AlternativesPayload>(raw, {});
}

export async function rewriteCarouselSlotCopy(
  action: CarouselSlotRewriteAction,
  context: CarouselSlotRewriteContext
): Promise<{ text: string } | { alternatives: [string, string, string] }> {
  const requireShorterThan =
    action === "make_shorter" ? context.slot.currentText : undefined;

  try {
    const first = await invokeRewrite(action, context);
    if (action === "alternatives") {
      const validated = validateCarouselSlotRewriteAlternatives(
        (first as AlternativesPayload).alternatives,
        context
      );
      if (validated.ok) return { alternatives: validated.alternatives };
      const retry = await invokeRewrite(
        action,
        context,
        "Your previous alternatives were invalid. Return exactly 3 options, each within the character budget, and keep every required fact."
      );
      const retried = validateCarouselSlotRewriteAlternatives(
        (retry as AlternativesPayload).alternatives,
        context
      );
      if (!retried.ok) {
        throw new CarouselSlotRewriteError(
          "Could not produce 3 valid alternatives.",
          "INVALID_ALTERNATIVES"
        );
      }
      return { alternatives: retried.alternatives };
    }

    const firstText = validateCarouselSlotRewriteText(
      (first as SinglePayload).text,
      context,
      { requireShorterThan }
    );
    if (
      firstText.ok &&
      firstText.text !== context.slot.currentText.trim()
    ) {
      return { text: firstText.text };
    }

    const retryHint =
      firstText.ok
        ? "Give different wording. Do not repeat the selected text verbatim."
        : firstText.reason === "too_long"
        ? `The previous result was too long. Stay under ${context.slot.budget.max} characters${
            requireShorterThan
              ? ` and shorter than "${requireShorterThan}"`
              : ""
          }.`
        : firstText.reason === "missing_fact"
          ? `Keep these exact facts: ${context.factsToPreserve.join(", ")}.`
          : "Return one non-empty rewritten string only.";
    const retry = await invokeRewrite(action, context, retryHint);
    const retried = validateCarouselSlotRewriteText(
      (retry as SinglePayload).text,
      context,
      { requireShorterThan }
    );
    if (retried.ok) return { text: retried.text };
    const fallback = validateCarouselSlotRewriteText(
      (retry as SinglePayload).text,
      context
    );
    if (fallback.ok) return { text: fallback.text };
    if (retried.reason === "empty") {
      throw new CarouselSlotRewriteError("AI returned empty copy.", "EMPTY");
    }
    if (retried.reason === "missing_fact") {
      throw new CarouselSlotRewriteError(
        "AI dropped a number or fact from the original copy.",
        "MISSING_FACT"
      );
    }
    throw new CarouselSlotRewriteError(
      "AI copy was too long for this slot.",
      "TOO_LONG"
    );
  } catch (error) {
    if (error instanceof CarouselSlotRewriteError) throw error;
    throw new CarouselSlotRewriteError(
      "Could not rewrite that text. Try again.",
      "LLM_FAILED"
    );
  }
}
