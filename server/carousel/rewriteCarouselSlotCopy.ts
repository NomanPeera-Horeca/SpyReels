import {
  extractCarouselSubjectAnchors,
  type CarouselSlotRewriteAction,
  type CarouselSlotRewriteContext,
  validateCarouselSlotRewriteAlternatives,
  validateCarouselSlotRewriteText,
} from "@shared/carouselSlotRewrite";
import { invokeLLM } from "../_core/llm";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";

export const CAROUSEL_SLOT_REWRITE_MODEL = "claude-haiku-4-5-20251001";
export const CAROUSEL_SLOT_REWRITE_STRONG_MODEL = "claude-sonnet-4-6";

export class CarouselSlotRewriteError extends Error {
  constructor(
    message: string,
    readonly code:
      | "EMPTY"
      | "TOO_LONG"
      | "MISSING_FACT"
      | "INVALID_ALTERNATIVES"
      | "UNCHANGED"
      | "NOT_PUNCHIER"
      | "TOPIC_DRIFT"
      | "LLM_FAILED" = "LLM_FAILED"
  ) {
    super(message);
    this.name = "CarouselSlotRewriteError";
  }
}

const ACTION_CONTRACTS: Record<CarouselSlotRewriteAction, string> = {
  make_punchier: `MAKE PUNCHIER contract:
- Increase tension, contrast, curiosity, specificity, or emotional force.
- Remove weak or filler wording such as nearly, quite, really, actually, very, somewhat, almost.
- Do not make the line longer unless a tiny extra word creates real contrast.
- For headline/hook slots, prefer compact high-contrast wording, not explanatory sentences.
- If the current line is already two short clauses, tighten the contrast. Do not explain it in a longer sentence.
- Preserve the central meaning and original topic.
- Never return identical or near-identical copy.`,
  make_shorter: `MAKE SHORTER contract:
- The result MUST have fewer characters than the current text.
- Preserve the core meaning and every required fact.
- Cut filler, not the claim.
- If you cannot make it shorter, do not paraphrase at the same length.`,
  make_clearer: `MAKE CLEARER contract:
- Simplify wording and reduce ambiguity.
- Prefer plainer verbs and fewer clauses.
- Preserve facts and meaning.
- Do not merely paraphrase with more words.`,
  rewrite: `REWRITE contract:
- Change the wording in a material way.
- Preserve purpose, topic, and intent.
- Do not return identical or near-identical copy.
- Do not invent a new idea.`,
  alternatives: `3 ALTERNATIVES contract:
- Return exactly 3 options.
- All 3 must differ from the current text.
- All 3 must differ from one another.
- Same topic and intention.
- Stay inside the character budget.
- Do not invent facts.`,
};

function roleContract(role: string): string {
  const key = role.toLowerCase();
  if (key === "headline" || key === "hook" || key === "title") {
    return `Slot role: HEADLINE / HOOK.
Write concise, scroll-stopping copy. Prefer contrast and tension. Avoid explanatory sentences.`;
  }
  if (key === "body" || key === "quote" || key === "support") {
    return `Slot role: BODY.
Prioritize clarity and natural flow over hookiness. Keep it readable.`;
  }
  if (key === "kicker") {
    return `Slot role: KICKER.
Keep it very short. This is a contextual label or setup, not a sentence.`;
  }
  if (key === "cta" || key === "cta_label" || key === "button") {
    return `Slot role: CTA.
Keep it action-oriented. No unrelated hype.`;
  }
  return `Slot role: ${role}.
Keep the same job as the current line.`;
}

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
    subjectAnchorsYouMustKeep: extractCarouselSubjectAnchors(
      context.slot.currentText
    ).map((anchor) => anchor.label),
  };
}

function systemPrompt(action: CarouselSlotRewriteAction, role: string): string {
  return withAiFormattingRules(`You rewrite ONE selected carousel text slot.

Rules:
- The original user idea / topic is ground truth.
- Rewrite only the selected slot. Do not change strategy, layout, other slots, images, or design.
- Stay on the existing topic. Do not invent a new restaurant, niche, or article.
- Keep every subject in subjectAnchorsYouMustKeep. Synonyms are allowed only when they clearly mean the same subject.
- Do not swap a strong subject for a catchier nearby idea. A pricing line must stay about pricing or charging, not about removing items. A labor-cost line must stay about labor, payroll, or staff cost. An equipment line must stay about equipment, appliances, or machines.
- Do not invent statistics, percentages, revenue numbers, names, or new claims.
- If the selected text already contains a number or percent, keep that exact fact.
- Do not use em dashes.
- Return JSON only.
- Single-result actions return {"text":"..."}.
- alternatives returns {"alternatives":["...","...","..."]} with exactly 3 strings.
- Respect maxCharacters. Prefer tighter copy over overflowing the slot.

${roleContract(role)}

${ACTION_CONTRACTS[action]}`);
}

type SinglePayload = { text?: unknown };
type AlternativesPayload = { alternatives?: unknown };

export async function invokeCarouselSlotRewriteModel(
  action: CarouselSlotRewriteAction,
  context: CarouselSlotRewriteContext,
  extraInstruction?: string,
  model = CAROUSEL_SLOT_REWRITE_MODEL
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

  const temperature =
    action === "make_shorter" || action === "make_clearer" ? 0.3 : 0.55;

  const response = await invokeLLM({
    operation: "slot_text_rewrite",
    model,
    temperature,
    maxTokens: 400,
    messages: [
      { role: "system", content: systemPrompt(action, context.slot.role) },
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

function qualityOptions(
  action: CarouselSlotRewriteAction,
  context: CarouselSlotRewriteContext
) {
  return {
    requireShorterThan:
      action === "make_shorter" ? context.slot.currentText : undefined,
    requireDifferentFrom: context.slot.currentText,
    action,
    topic: context.brief?.topic ?? context.niche,
  };
}

function throwForReason(reason: string): never {
  if (reason === "empty") {
    throw new CarouselSlotRewriteError("AI returned empty copy.", "EMPTY");
  }
  if (reason === "missing_fact") {
    throw new CarouselSlotRewriteError(
      "AI dropped a number or fact from the original copy.",
      "MISSING_FACT"
    );
  }
  if (reason === "identical" || reason === "too_similar") {
    throw new CarouselSlotRewriteError(
      "AI returned copy that was too close to the original.",
      "UNCHANGED"
    );
  }
  if (reason === "not_punchier") {
    throw new CarouselSlotRewriteError(
      "AI did not make that line punchier.",
      "NOT_PUNCHIER"
    );
  }
  if (reason === "topic_drift") {
    throw new CarouselSlotRewriteError(
      "AI drifted off the original topic.",
      "TOPIC_DRIFT"
    );
  }
  throw new CarouselSlotRewriteError(
    "AI copy was too long for this slot.",
    "TOO_LONG"
  );
}

export async function rewriteCarouselSlotCopy(
  action: CarouselSlotRewriteAction,
  context: CarouselSlotRewriteContext,
  model = CAROUSEL_SLOT_REWRITE_MODEL
): Promise<{ text: string } | { alternatives: [string, string, string] }> {
  const options = qualityOptions(action, context);

  try {
    const first = await invokeCarouselSlotRewriteModel(
      action,
      context,
      undefined,
      model
    );
    if (action === "alternatives") {
      const validated = validateCarouselSlotRewriteAlternatives(
        (first as AlternativesPayload).alternatives,
        context,
        { topic: options.topic }
      );
      if (validated.ok) return { alternatives: validated.alternatives };
      const retry = await invokeCarouselSlotRewriteModel(
        action,
        context,
        `Your previous alternatives were invalid. Return exactly 3 options. None may repeat the current text. None may be near-duplicates of each other. Stay in budget and keep every required fact. Keep these subjects: ${
          extractCarouselSubjectAnchors(context.slot.currentText)
            .map((anchor) => anchor.label)
            .join(", ") || "the original subject"
        }.`,
        model
      );
      const retried = validateCarouselSlotRewriteAlternatives(
        (retry as AlternativesPayload).alternatives,
        context,
        { topic: options.topic }
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
      options
    );
    if (firstText.ok) return { text: firstText.text };

    const retryHint =
      firstText.reason === "too_long"
        ? `The previous result was too long. Stay under ${context.slot.budget.max} characters${
            options.requireShorterThan
              ? ` and shorter than "${options.requireShorterThan}"`
              : ""
          }.`
        : firstText.reason === "missing_fact"
          ? `Keep these exact facts: ${context.factsToPreserve.join(", ")}.`
          : firstText.reason === "not_punchier"
            ? "The previous line was weaker or longer, not punchier. Increase contrast. Cut filler. Do not add nearly/quite/really."
            : firstText.reason === "topic_drift"
              ? `Stay on the original subject. Keep these ideas: ${
                  extractCarouselSubjectAnchors(context.slot.currentText)
                    .map((anchor) => anchor.label)
                    .join(", ") || "the current topic"
                }. Do not swap the subject for a catchier nearby idea.`
              : firstText.reason === "identical" || firstText.reason === "too_similar"
                ? "Give different wording. Do not repeat the selected text."
                : "Return one non-empty rewritten string only.";
    const retry = await invokeCarouselSlotRewriteModel(
      action,
      context,
      retryHint,
      model
    );
    const retried = validateCarouselSlotRewriteText(
      (retry as SinglePayload).text,
      context,
      options
    );
    if (retried.ok) return { text: retried.text };
    throwForReason(retried.reason);
  } catch (error) {
    if (error instanceof CarouselSlotRewriteError) throw error;
    throw new CarouselSlotRewriteError(
      "Could not rewrite that text. Try again.",
      "LLM_FAILED"
    );
  }
}
