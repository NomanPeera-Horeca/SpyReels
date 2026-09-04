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

export const SELECTED_STRATEGY_MARKER = "--- Selected creative strategy";

function stripGroundTruthPrefix(text: string): string {
  return text
    .replace(/^Creator's chosen angle(?:\s*\([^)]*\))?:\s*/i, "")
    .replace(/^Creator goal(?:\s*\([^)]*\))?:\s*/i, "")
    .trim();
}

export function splitCreatorDescription(description: string): {
  rawCreatorIdea: string;
  strategyBlock: string;
} {
  const trimmed = description.trim();
  if (!trimmed) return { rawCreatorIdea: "", strategyBlock: "" };
  const strategyIdx = trimmed.indexOf(SELECTED_STRATEGY_MARKER);
  const before = (strategyIdx >= 0 ? trimmed.slice(0, strategyIdx) : trimmed).trim();
  return {
    rawCreatorIdea: stripGroundTruthPrefix(before),
    strategyBlock: strategyIdx >= 0 ? trimmed.slice(strategyIdx).trim() : "",
  };
}

/**
 * Keyword routers (script mode, hook type, content format) must read the
 * creator's own words, not the internal selected-strategy block appended later.
 */
export function creatorIdeaForKeywordRouting(description: string): string {
  return splitCreatorDescription(description).rawCreatorIdea;
}

/** Judge, rewrite, and persisted sourceDescription must use the creator's own words. */
export function resolveCoachSourceIdea(args: {
  rawCreatorIdea?: string | null;
  description: string;
}): string {
  const explicit = args.rawCreatorIdea?.trim();
  if (explicit) return stripGroundTruthPrefix(explicit);
  return splitCreatorDescription(args.description).rawCreatorIdea;
}
