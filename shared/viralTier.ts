/**
 * Follower-multiple viral tiers (locked rule, Figma Home v2 CTO notes):
 * - a video counts as viral only if views >= 3x followers AND views >= 5,000;
 * - tiers: Healthy 5x to 25x, Strong 25x to 100x, Viral 100x to 500x,
 *   Explosive 500x+; 3x to 5x passes the rule but has no badge ("Skip").
 * Badge text everywhere: "Tier · Nx followers". Never estimated: missing or
 * zero followers means no badge.
 */
export type FollowerViralTier = "Healthy" | "Strong" | "Viral" | "Explosive";

export const VIRAL_MIN_VIEWS = 5_000;
export const VIRAL_MIN_MULTIPLE = 3;

export type FollowerViralBadge = {
  tier: FollowerViralTier;
  /** Whole number, rounded down so a badge never overstates. */
  multiple: number;
  label: string;
};

export function followerViralBadge(
  views: number | null | undefined,
  followers: number | null | undefined
): FollowerViralBadge | null {
  if (typeof views !== "number" || typeof followers !== "number") return null;
  if (!Number.isFinite(views) || !Number.isFinite(followers)) return null;
  if (followers <= 0 || views < VIRAL_MIN_VIEWS) return null;
  const multiple = views / followers;
  if (multiple < VIRAL_MIN_MULTIPLE) return null;
  let tier: FollowerViralTier | null = null;
  if (multiple >= 500) tier = "Explosive";
  else if (multiple >= 100) tier = "Viral";
  else if (multiple >= 25) tier = "Strong";
  else if (multiple >= 5) tier = "Healthy";
  if (!tier) return null; // 3x to 5x: "Skip" tier, no badge.
  const whole = Math.floor(multiple);
  return { tier, multiple: whole, label: `${tier} · ${whole}x followers` };
}
