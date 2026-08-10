/**
 * Cheap Haiku relevance scoring for stock B-roll thumbnails vs beat intent.
 */

import { invokeLLM } from "../_core/llm";
import { parseLlmJson } from "../utils/parseLlmJson";

const HAIKU_MODEL = "claude-haiku-4-5-20251001";

/** Score at or above this counts as matchConfidence: "high". */
export const RELEVANCE_HIGH_THRESHOLD = 70;

type RelevancePayload = {
  score?: number;
  accept?: boolean;
};

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Vision score 0-100: how well this thumbnail matches the beat / search intent.
 * Fail-open on LLM/network errors with a high score so an outage does not blank beats.
 */
export async function scoreClipRelevance(
  beatText: string,
  candidateThumbnailUrl: string
): Promise<number> {
  const text = beatText.trim().slice(0, 400);
  const thumb = candidateThumbnailUrl.trim();
  if (!text || !thumb) return 0;

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
            'You score how well a stock video thumbnail matches a B-roll beat. Return ONLY JSON: {"score":0-100}. 90-100 = clear match (setting, subject, context). 70-89 = good usable match. 40-69 = loosely related. 0-39 = unrelated or wrong setting (e.g. residential when beat needs commercial). Prefer lower scores for only loosely related thumbnails.',
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
    if (typeof parsed.score === "number") {
      return clampScore(parsed.score);
    }
    // Legacy boolean payloads if a cached prompt path ever returns them.
    if (parsed.accept === true) return 80;
    if (parsed.accept === false) return 30;
    return 0;
  } catch (err) {
    console.warn(
      "[scoreClipRelevance] Haiku check failed; treating as high score",
      err
    );
    return 80;
  }
}

/**
 * @deprecated Prefer scoreClipRelevance. Boolean wrapper around the threshold.
 */
export async function checkClipRelevance(
  beatText: string,
  candidateThumbnailUrl: string
): Promise<boolean> {
  const score = await scoreClipRelevance(beatText, candidateThumbnailUrl);
  return score >= RELEVANCE_HIGH_THRESHOLD;
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

export type ScoredCandidate<T> = {
  candidate: T;
  score: number;
};

export type PickRelevantResult<T> = {
  candidate: T;
  confidence: "high" | "approximate";
  score: number;
};

/**
 * Score candidates in parallel. High = earliest-ranked with score >= threshold.
 * Approximate = highest score in the pool when none clear the threshold.
 * Returns null only when the candidate pool is empty.
 */
export async function pickRelevantCandidate<
  T extends { durationSeconds: number; thumbnailUrl: string },
>(
  candidates: T[],
  relevanceText: string,
  maxCandidates = 8
): Promise<PickRelevantResult<T> | null> {
  const scored = await scoreCandidatesForRelevance(
    candidates,
    relevanceText,
    maxCandidates
  );
  return pickFromScoredCandidates(scored);
}

export async function scoreCandidatesForRelevance<
  T extends { durationSeconds: number; thumbnailUrl: string },
>(
  candidates: T[],
  relevanceText: string,
  maxCandidates = 8
): Promise<ScoredCandidate<T>[]> {
  const ordered = orderCandidatesForRelevance(candidates).slice(
    0,
    Math.max(1, maxCandidates)
  );
  const text = relevanceText.trim();
  if (!ordered.length) return [];
  if (!text) {
    return ordered.map((candidate) => ({
      candidate,
      score: RELEVANCE_HIGH_THRESHOLD,
    }));
  }

  return Promise.all(
    ordered.map(async (candidate) => ({
      candidate,
      score: await scoreClipRelevance(text, candidate.thumbnailUrl),
    }))
  );
}

export function pickFromScoredCandidates<T>(
  scored: ScoredCandidate<T>[]
): PickRelevantResult<T> | null {
  if (!scored.length) return null;

  for (const row of scored) {
    if (row.score >= RELEVANCE_HIGH_THRESHOLD) {
      return {
        candidate: row.candidate,
        confidence: "high",
        score: row.score,
      };
    }
  }

  let best = scored[0]!;
  for (let i = 1; i < scored.length; i++) {
    const row = scored[i]!;
    if (row.score > best.score) best = row;
  }
  return {
    candidate: best.candidate,
    confidence: "approximate",
    score: best.score,
  };
}
