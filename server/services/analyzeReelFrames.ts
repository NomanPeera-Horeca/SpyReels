import { invokeLLM } from "../_core/llm";
import type { ExtractedFrame } from "./extractFrames";
import { parseLlmJson } from "../utils/parseLlmJson";

export type ReelStructuralAnalysis = {
  hookType: string;
  hookTimingSec: number;
  cutsPerSecond: number;
  tone: string;
  textOverlayPresent: boolean;
  textOverlayTimingSec: number | null;
  ctaPresent: boolean;
  explanation: string;
};

const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    hookType: {
      type: "string",
      description:
        "Short label for the opening hook style, e.g. direct_to_camera_question, text_on_screen, pattern_interrupt, shock_visual",
    },
    hookTimingSec: {
      type: "number",
      description: "Approximate second at which the hook lands",
    },
    cutsPerSecond: {
      type: "number",
      description: "Approximate visual cuts per second across the sampled frames",
    },
    tone: {
      type: "string",
      description: "Overall tone, e.g. energetic, calm, informative, comedic",
    },
    textOverlayPresent: { type: "boolean" },
    textOverlayTimingSec: {
      type: ["number", "null"],
      description: "Second the first text overlay appears, or null if none",
    },
    ctaPresent: { type: "boolean" },
    explanation: {
      type: "string",
      description:
        "One to two sentence plain English explanation of what structurally makes this video work or not work",
    },
  },
  required: [
    "hookType",
    "hookTimingSec",
    "cutsPerSecond",
    "tone",
    "textOverlayPresent",
    "textOverlayTimingSec",
    "ctaPresent",
    "explanation",
  ],
  additionalProperties: false,
};

/**
 * Sends all sampled frames from a Reel to Claude in a single call and
 * returns a structured read of the video's structural pattern: hook
 * style and timing, cut frequency, tone, text overlays, CTA presence,
 * plus a short plain English explanation. Returns null on failure
 * rather than throwing, this is a background analysis step and should
 * not block the caller.
 */
export async function analyzeReelFrames(
  frames: ExtractedFrame[],
  shortcode: string
): Promise<ReelStructuralAnalysis | null> {
  if (frames.length === 0) return null;

  const imageBlocks = frames.map((f) => ({
    type: "image_url" as const,
    image_url: {
      url: `data:image/jpeg;base64,${f.buffer.toString("base64")}`,
      detail: "low" as const,
    },
  }));

  try {
    const response = await invokeLLM({
      messages: [
        {
          role: "system",
          content:
            "You are analyzing frames sampled in order from an Instagram Reel to identify its structural pattern: hook style and timing, cut frequency, tone, text overlays, and call to action presence. The frames are sampled roughly 1 per second for the first 3 seconds, then every 2 seconds after, in chronological order. Base your answer only on what is visible across these frames.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `These are ${frames.length} frames sampled in order from an Instagram Reel (shortcode ${shortcode}), spanning second ${frames[0]!.timestampSec} to second ${frames[frames.length - 1]!.timestampSec}. Analyze the structural pattern.`,
            },
            ...imageBlocks,
          ],
        },
      ],
      maxTokens: 1536,
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "reel_structural_analysis",
          strict: true,
          schema: ANALYSIS_SCHEMA,
        },
      },
    });

    const raw = String(response.choices[0]?.message?.content ?? "");
    return parseLlmJson<ReelStructuralAnalysis | null>(raw, null);
  } catch (err) {
    console.warn(
      `[analyzeReelFrames] failed for shortcode ${shortcode}:`,
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
