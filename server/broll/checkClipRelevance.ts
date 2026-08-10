/**
 * Cheap Haiku accept/reject for stock B-roll thumbnails vs beat intent.
 */

import { invokeLLM } from "../_core/llm";
import { parseLlmJson } from "../utils/parseLlmJson";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

type RelevancePayload = {
  accept?: boolean;
};

/**
 * Vision check: does this thumbnail match the beat / search intent?
 * Fail-open on LLM/network errors so a Haiku outage does not blank every beat.
 */
export async function checkClipRelevance(
  beatText: string,
  candidateThumbnailUrl: string
): Promise<boolean> {
  const text = beatText.trim().slice(0, 400);
  const thumb = candidateThumbnailUrl.trim();
  if (!text || !thumb) return false;

  try {
    const response = await invokeLLM({
      model: HAIKU_MODEL,
      maxTokens: 40,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You judge if a stock video thumbnail matches a B-roll beat. Return ONLY JSON: {"accept":true} or {"accept":false}. Accept only when the visible scene clearly matches the beat intent (setting, subject, context). Reject residential/home scenes when the beat asks for commercial or professional settings, and vice versa. Reject unrelated or only loosely related thumbnails.',
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Beat / search intent:\n${text}`,
            },
            {
              type: "image_url",
              image_url: { url: thumb, detail: "low" },
            },
          ],
        },
      ],
    });

    const raw = String(response.choices[0]?.message?.content ?? "");
    const parsed = parseLlmJson<RelevancePayload>(raw, {});
    return parsed.accept === true;
  } catch (err) {
    console.warn("[checkClipRelevance] Haiku check failed; accepting candidate", err);
    return true;
  }
}

/**
 * Prefer short clips, then longer ones, preserving original order within groups.
 */
export function orderCandidatesForRelevance<
  T extends { durationSeconds: number },
>(candidates: T[]): T[] {
  const short: T[] = [];
  const rest: T[] = [];
  for (const c of candidates) {
    if (c.durationSeconds > 0 && c.durationSeconds <= 20) short.push(c);
    else rest.push(c);
  }
  return short.concat(rest);
}

/**
 * Walk ordered candidates until one passes relevance. Returns null if none pass
 * (signal for provider fallback). Does not silently return an irrelevant first hit.
 */
export async function pickRelevantCandidate<
  T extends { durationSeconds: number; thumbnailUrl: string },
>(candidates: T[], relevanceText: string): Promise<T | null> {
  const ordered = orderCandidatesForRelevance(candidates);
  const text = relevanceText.trim();
  if (!ordered.length) return null;
  if (!text) return ordered[0] ?? null;

  for (const candidate of ordered) {
    const ok = await checkClipRelevance(text, candidate.thumbnailUrl);
    if (ok) return candidate;
  }
  return null;
}
