/** First name for CTAs, or @handle when no display name. */
export function creatorDisplayLabel(
  displayName: string | null | undefined,
  handle: string
): string {
  const cleanHandle = handle.replace(/^@/, "").trim();
  if (displayName?.trim()) {
    const first = displayName.trim().split(/\s+/)[0];
    if (first) return first;
  }
  return `@${cleanHandle}`;
}

/** Entity-first CTA: "See Gary's viral reels →" */
export function seeCreatorsViralReelsCta(
  displayName: string | null | undefined,
  handle: string,
  options?: { includeArrow?: boolean }
): string {
  const label = creatorDisplayLabel(displayName, handle);
  const arrow = options?.includeArrow !== false ? " →" : "";
  return `See ${label}'s viral reels${arrow}`;
}
