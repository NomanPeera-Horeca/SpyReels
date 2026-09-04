const CREATOR_GROUND_TRUTH_MARKERS = [
  "Creator goal (ground truth",
  "Creator's chosen angle",
] as const;

/**
 * Mark a creator-entered AI Coach idea as authoritative topic/intent before it
 * enters the existing script-generation pipeline. The generator already has
 * explicit-angle handling for these markers; centralizing the boundary here
 * prevents normal typed ideas from silently falling back to niche/research-led
 * topic selection.
 */
export function markCreatorIdeaGroundTruth(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return trimmed;

  if (CREATOR_GROUND_TRUTH_MARKERS.some((marker) => trimmed.includes(marker))) {
    return trimmed;
  }

  return `Creator's chosen angle (ground truth — preserve this topic and intent; creatively develop only details the creator did not specify):\n${trimmed}`;
}

const SELECTED_STRATEGY_MARKER = "--- Selected creative strategy";

/**
 * Keyword routers (script mode, hook type, content format) must read the
 * creator's own words, not the internal selected-strategy block appended later.
 */
export function creatorIdeaForKeywordRouting(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) return trimmed;
  const strategyIdx = trimmed.indexOf(SELECTED_STRATEGY_MARKER);
  const withoutStrategy = (strategyIdx >= 0 ? trimmed.slice(0, strategyIdx) : trimmed).trim();
  return withoutStrategy
    .replace(/^Creator's chosen angle(?:\s*\([^)]*\))?:\s*/i, "")
    .replace(/^Creator goal(?:\s*\([^)]*\))?:\s*/i, "")
    .trim();
}
