/** Provocation headlines for AuthDialog, keyed by the CTA that opened it. */

export function authHeadlineSeeViralReels(displayName: string): string {
  return `Finish signing up to see ${displayName}'s viral reels`;
}

export function authHeadlineSpyHandle(handle: string): string {
  const clean = handle.replace(/^@/, "").trim();
  return `Finish signing up to spy @${clean}'s viral reels`;
}

export function authHeadlineRemake(): string {
  return "Finish signing up to remake this Reel in your voice";
}

export function authHeadlineUnlockHooks(): string {
  return "Finish signing up to unlock all 10 hooks";
}

export function authHeadlineHookToScript(hookNumber: number): string {
  return `Finish signing up to turn hook #${hookNumber} into a full Reel script`;
}

export function authHeadlineBrollGenerate(): string {
  return "Finish signing up to generate B-roll for your Reel script";
}

/** Prefer first name from profile; fall back to @handle. */
export function authCreatorDisplayName(
  fullName: string | null | undefined,
  username: string
): string {
  const first = fullName?.trim().split(/\s+/).filter(Boolean)[0];
  if (first) return first;
  const clean = username.replace(/^@/, "").trim();
  return clean ? `@${clean}` : "their";
}
