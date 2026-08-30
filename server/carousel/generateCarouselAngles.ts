/**
 * Carousel Studio: propose 3 distinct strategic angles from source content.
 * Does not generate full slide copy. Selected angle is passed into generateCarouselRemake.
 */

import {
  CAROUSEL_STUDIO_ANGLE_COUNT,
  CAROUSEL_STUDIO_MAX_SLIDES,
  CAROUSEL_STUDIO_MIN_SLIDES,
  type CarouselAngleOption,
} from "@shared/carouselStudio";
import { invokeLLM } from "../_core/llm";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";

type AnglesLlmPayload = {
  angles?: CarouselAngleOption[];
};

export function buildCarouselAnglesJsonSchema(): {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} {
  return {
    name: "carousel_studio_angles",
    strict: true,
    schema: {
      type: "object",
      properties: {
        angles: {
          type: "array",
          description: `Exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} distinct strategic directions for a carousel.`,
          items: {
            type: "object",
            properties: {
              kicker: {
                type: "string",
                description:
                  "Short category label for the strategy (e.g. Contrarian, Framework, Story, Teach-back).",
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
            },
            required: ["kicker", "title", "description", "estimatedSlideCount"],
            additionalProperties: false,
          },
        },
      },
      required: ["angles"],
      additionalProperties: false,
    },
  };
}

function buildAnglesUserPrompt(args: {
  sourceContent: string;
  niche: string;
  brandVoice?: string | null;
}): string {
  const brand = args.brandVoice?.trim();
  const lines = [
    `Niche / audience: ${args.niche.trim()}`,
    "",
    "Source content (use as material; do not copy wording verbatim into titles):",
    args.sourceContent.trim(),
    "",
    `Propose exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} genuinely different strategic directions for an Instagram carousel.`,
    "Each angle must be a distinct content approach (e.g. Contrarian vs Framework vs Story), not the same idea rewritten three times.",
    "Do NOT write full slide content. Only kicker, title, one-sentence description, and estimatedSlideCount.",
    `estimatedSlideCount must be an integer from ${CAROUSEL_STUDIO_MIN_SLIDES} to ${CAROUSEL_STUDIO_MAX_SLIDES}.`,
    "Titles should feel scroll-stopping and niche-specific.",
  ];
  if (brand) {
    lines.push("", `Brand voice guidance (tone only, not a topic override): ${brand}`);
  }
  return lines.join("\n");
}

function clampSlideCount(n: unknown): number {
  const raw = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(raw)) return 8;
  return Math.min(
    CAROUSEL_STUDIO_MAX_SLIDES,
    Math.max(CAROUSEL_STUDIO_MIN_SLIDES, Math.round(raw))
  );
}

function normalizeAngles(payload: AnglesLlmPayload): CarouselAngleOption[] {
  const list = Array.isArray(payload.angles) ? payload.angles : [];
  const out: CarouselAngleOption[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const kicker = typeof item.kicker === "string" ? item.kicker.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const description =
      typeof item.description === "string" ? item.description.trim() : "";
    if (!kicker || !title || !description) continue;
    out.push({
      kicker,
      title,
      description,
      estimatedSlideCount: clampSlideCount(item.estimatedSlideCount),
    });
    if (out.length >= CAROUSEL_STUDIO_ANGLE_COUNT) break;
  }
  return out;
}

async function invokeCarouselAnglesOnce(args: {
  sourceContent: string;
  niche: string;
  brandVoice?: string | null;
  repairNote?: string;
}): Promise<CarouselAngleOption[]> {
  const schema = buildCarouselAnglesJsonSchema();
  const basePrompt = buildAnglesUserPrompt({
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
        content: withAiFormattingRules(
          "You are a SpyReels carousel strategist. Propose distinct save-worthy angles only. Return structured tool output only."
        ),
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
  const parsed = parseLlmJson<AnglesLlmPayload>(raw, { angles: [] });
  return normalizeAngles(parsed);
}

/**
 * One Sonnet call: return exactly 3 distinct carousel angles (no slide bodies).
 * Retries once with a repair note if the first payload is not exactly 3 valid angles.
 */
export async function generateCarouselAngles(args: {
  sourceContent: string;
  niche: string;
  brandVoice?: string | null;
}): Promise<CarouselAngleOption[]> {
  const sourceContent = args.sourceContent.trim();
  const niche = args.niche.trim();
  if (!sourceContent) {
    throw new Error("sourceContent is required to generate carousel angles.");
  }
  if (!niche) {
    throw new Error("niche is required to generate carousel angles.");
  }

  let angles = await invokeCarouselAnglesOnce({
    sourceContent,
    niche,
    brandVoice: args.brandVoice,
  });

  if (angles.length !== CAROUSEL_STUDIO_ANGLE_COUNT) {
    angles = await invokeCarouselAnglesOnce({
      sourceContent,
      niche,
      brandVoice: args.brandVoice,
      repairNote: `Expected exactly ${CAROUSEL_STUDIO_ANGLE_COUNT} valid angles, each with kicker, title, description, and estimatedSlideCount. Got ${angles.length}.`,
    });
  }

  if (angles.length !== CAROUSEL_STUDIO_ANGLE_COUNT) {
    throw new Error(
      `Expected ${CAROUSEL_STUDIO_ANGLE_COUNT} carousel angles, got ${angles.length}.`
    );
  }

  return angles;
}
