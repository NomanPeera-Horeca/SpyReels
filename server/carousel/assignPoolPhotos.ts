import { invokeLLM } from "../_core/llm";
import { parseLlmJson } from "../utils/parseLlmJson";

export type PhotoSlotNeed = {
  key: string;
  slideId: string;
  slotId: string;
  /** Human label for the LLM, e.g. "before/excuse (grayscale)" */
  roleHint: string;
  /** Slot text that should drive which photo fits */
  textContext: string;
  searchQueryHint: string;
};

/**
 * Ask a vision-capable LLM to map uploaded photos onto image slots using
 * excuse/reframe text. Falls back to round-robin on parse failure.
 */
export async function assignPoolPhotosToSlots(
  poolUrls: string[],
  slots: PhotoSlotNeed[],
  niche: string
): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  if (poolUrls.length === 0 || slots.length === 0) return result;

  if (poolUrls.length === 1) {
    for (const slot of slots) {
      result[slot.key] = poolUrls[0];
    }
    return result;
  }

  try {
    const content: Array<
      | { type: "text"; text: string }
      | { type: "image_url"; image_url: { url: string; detail: "low" } }
    > = [
      {
        type: "text",
        text: `You assign uploaded photos to Instagram carousel image slots for niche: ${niche}.

Photos are numbered 0..${poolUrls.length - 1} in the order attached below.

Slots to fill (use each photo index 0..${poolUrls.length - 1}; reuse is allowed when needed):
${slots
  .map(
    (s, i) =>
      `${i}. key="${s.key}" role="${s.roleHint}" text="${s.textContext}" hint="${s.searchQueryHint}"`
  )
  .join("\n")}

Rules:
1. Match photo vibe to the slot text (tense/excuse slots prefer quieter or stressed energy; win/reframe slots prefer confident/success energy).
2. Prefer variety across the carousel; reuse only when the pool is smaller than the slot count.
3. Return ONLY JSON: { "assignments": [ { "key": "<slot key>", "photoIndex": <number> }, ... ] } with every slot key present.`,
      },
    ];

    for (let i = 0; i < poolUrls.length; i++) {
      content.push({ type: "text", text: `Photo index ${i}:` });
      content.push({
        type: "image_url",
        image_url: { url: poolUrls[i], detail: "low" },
      });
    }

    const response = await invokeLLM({
      operation: "pool_photo_assignment",
      messages: [{ role: "user", content }],
      responseFormat: { type: "json_object" },
      maxTokens: 1024,
    });

    const raw =
      typeof response.choices[0]?.message?.content === "string"
        ? response.choices[0].message.content
        : "";
    const parsed = parseLlmJson<{
      assignments?: Array<{ key?: string; photoIndex?: number }>;
    }>(raw, {});

    const byKey = new Map<string, number>();
    for (const row of parsed.assignments ?? []) {
      if (typeof row.key === "string" && typeof row.photoIndex === "number") {
        byKey.set(row.key, row.photoIndex);
      }
    }

    for (const slot of slots) {
      const idx = byKey.get(slot.key);
      if (idx !== undefined && idx >= 0 && idx < poolUrls.length) {
        result[slot.key] = poolUrls[idx];
      }
    }
  } catch (err) {
    console.warn("[assignPoolPhotosToSlots] vision assign failed, using round-robin", err);
  }

  // Fill any missing slots round-robin.
  let i = 0;
  for (const slot of slots) {
    if (!result[slot.key]) {
      result[slot.key] = poolUrls[i % poolUrls.length];
      i += 1;
    }
  }
  return result;
}
