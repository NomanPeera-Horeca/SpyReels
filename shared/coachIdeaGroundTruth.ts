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
