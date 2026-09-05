import type { AdaptedCandidate } from "./candidateAdapter";

const REMAKE_FRIENDLY_FORMATS = new Set([
  "list",
  "myth-vs-fact",
  "tutorial",
  "talking-head",
  "story",
]);

function clamp100(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizedText(candidate: Pick<AdaptedCandidate, "caption" | "hook" | "hashtags">): string {
  return [candidate.hook || "", candidate.caption || "", ...(candidate.hashtags || [])]
    .join(" ")
    .toLowerCase();
}

/**
 * Deterministic relevance signal for ranking shared-pool candidates.
 * Pool membership is useful but not enough: confidence, explicit pillar terms,
 * and usable text signals differentiate strong matches from weak assignments.
 */
export function relevanceScoreForCandidate(args: {
  candidate: Pick<AdaptedCandidate, "caption" | "hook" | "hashtags" | "contentPillar">;
  pillarConfidence?: number | null;
  activePillar?: string | null;
}): number {
  const { candidate } = args;
  const text = normalizedText(candidate);
  const pillar = (args.activePillar || candidate.contentPillar || "").toLowerCase().trim();
  const confidence = Math.max(0, Math.min(1, args.pillarConfidence ?? 0.5));

  let score = 48 + confidence * 30;
  if (pillar) {
    const words = pillar.split(/\s+/).filter((word) => word.length >= 4);
    const matches = words.filter((word) => text.includes(word)).length;
    score += Math.min(14, matches * 5);
  }
  if ((candidate.hook || "").trim().length >= 12) score += 4;
  if ((candidate.caption || "").trim().length >= 40) score += 4;

  return clamp100(score);
}

/**
 * Estimate whether the underlying creative pattern is practical for a creator
 * to remake without copying production-heavy specifics.
 */
export function remakeabilityScoreForCandidate(
  candidate: Pick<AdaptedCandidate, "format" | "hook" | "caption" | "transcript">
): number {
  let score = REMAKE_FRIENDLY_FORMATS.has(candidate.format || "") ? 76 : 58;

  const hook = (candidate.hook || "").trim();
  const caption = (candidate.caption || "").trim();
  const transcript = (candidate.transcript || "").trim();

  if (hook.length >= 12 && hook.length <= 140) score += 9;
  if (caption.length >= 40) score += 5;
  if (transcript.length >= 80) score += 5;

  const text = `${hook} ${caption}`.toLowerCase();
  if (/\b(\d+\s+(tips|ways|mistakes|reasons|steps)|how to|stop doing|instead|before|after|myth|versus|vs\.?|i learned|i realized)\b/.test(text)) {
    score += 8;
  }

  return clamp100(score);
}
