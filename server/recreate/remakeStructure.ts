import { createHash } from "node:crypto";
import { invokeLLM } from "../_core/llm";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { sanitizeAiOutputDeep } from "../utils/sanitizeAiOutput";

const STRUCTURE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const STRUCTURE_CACHE_MAX = 500;

type CacheEntry = {
  expiresAt: number;
  value: Record<string, unknown>;
};

const structureCache = new Map<string, CacheEntry>();

function prune(now: number): void {
  for (const [key, entry] of structureCache) {
    if (entry.expiresAt <= now) structureCache.delete(key);
  }
  while (structureCache.size > STRUCTURE_CACHE_MAX) {
    const first = structureCache.keys().next().value as string | undefined;
    if (!first) break;
    structureCache.delete(first);
  }
}

function cacheKey(input: {
  sourceKey?: string;
  transcript: string;
  caption: string;
  platformLabel: string;
}): string {
  const digest = createHash("sha256")
    .update(input.transcript)
    .update("\n---caption---\n")
    .update(input.caption)
    .digest("hex")
    .slice(0, 20);
  return `${input.platformLabel}|${input.sourceKey ?? "unknown"}|${digest}`;
}

export async function analyzeRemakeStructure(input: {
  originalTranscript: string;
  caption: string;
  sourceKey?: string;
  platformLabel?: "Instagram Reel" | "TikTok video" | "YouTube Short";
  llmInvoker?: typeof invokeLLM;
}): Promise<{ structure: Record<string, unknown>; cacheHit: boolean }> {
  const platformLabel = input.platformLabel ?? "Instagram Reel";
  const key = cacheKey({
    sourceKey: input.sourceKey,
    transcript: input.originalTranscript,
    caption: input.caption,
    platformLabel,
  });
  const now = Date.now();
  prune(now);

  const hit = structureCache.get(key);
  if (hit && hit.expiresAt > now) {
    return { structure: hit.value, cacheHit: true };
  }

  const structurePrompt = `You are an expert viral content analyst specializing in ${platformLabel} scripts.

Analyze the following viral ${platformLabel} transcript and identify its exact structure. Return a JSON object with these fields:

{
  "hook": {
    "type": "string",
    "text": "string",
    "technique": "string"
  },
  "body": {
    "pacing": "string",
    "structure": "string",
    "keyPoints": ["array of the main points made"]
  },
  "transition": {
    "type": "string",
    "text": "string"
  },
  "cta": {
    "type": "string",
    "text": "string"
  },
  "overallTone": "string",
  "estimatedPace": "string"
}

**Caption:** ${input.caption}

**Full Transcript:**
${input.originalTranscript}

Return ONLY valid JSON, no markdown formatting.`;

  const response = await (input.llmInvoker ?? invokeLLM)({
    messages: [
      {
        role: "system",
        content: withAiFormattingRules(
          "You are a viral content structure analyst. Always respond with valid JSON only."
        ),
      },
      { role: "user", content: structurePrompt },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "viral_structure",
        strict: true,
        schema: {
          type: "object",
          properties: {
            hook: {
              type: "object",
              properties: {
                type: { type: "string" },
                text: { type: "string" },
                technique: { type: "string" },
              },
              required: ["type", "text", "technique"],
              additionalProperties: false,
            },
            body: {
              type: "object",
              properties: {
                pacing: { type: "string" },
                structure: { type: "string" },
                keyPoints: { type: "array", items: { type: "string" } },
              },
              required: ["pacing", "structure", "keyPoints"],
              additionalProperties: false,
            },
            transition: {
              type: "object",
              properties: {
                type: { type: "string" },
                text: { type: "string" },
              },
              required: ["type", "text"],
              additionalProperties: false,
            },
            cta: {
              type: "object",
              properties: {
                type: { type: "string" },
                text: { type: "string" },
              },
              required: ["type", "text"],
              additionalProperties: false,
            },
            overallTone: { type: "string" },
            estimatedPace: { type: "string" },
          },
          required: [
            "hook",
            "body",
            "transition",
            "cta",
            "overallTone",
            "estimatedPace",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  let structure: Record<string, unknown>;
  try {
    structure = sanitizeAiOutputDeep(
      JSON.parse(
        (String(response.choices[0]?.message?.content) || "{}")
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .trim()
      )
    );
  } catch {
    structure = { error: "Failed to parse structure" };
  }

  structureCache.set(key, {
    expiresAt: now + STRUCTURE_CACHE_TTL_MS,
    value: structure,
  });
  prune(now);

  return { structure, cacheHit: false };
}

export function resetRemakeStructureCacheForTest(): void {
  structureCache.clear();
}
