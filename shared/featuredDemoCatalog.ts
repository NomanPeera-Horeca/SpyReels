/**
 * Platform-agnostic featured demo catalog config.
 *
 * TikTok + YouTube are refreshed into `featured_demo_*` tables by the daily
 * job. Instagram stays on `featured_accounts` / `featured_reels` until T11.
 * Hardcoded allow-lists so scrape volume never silently widens what
 * unauthenticated visitors can read.
 */

export const FEATURED_DEMO_PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
] as const;

export type FeaturedDemoPlatform = (typeof FEATURED_DEMO_PLATFORMS)[number];

/** Platforms refreshed by the featured-demo catalog job (IG migrates in T11). */
export const FEATURED_DEMO_REFRESH_PLATFORMS = ["tiktok", "youtube"] as const;

export type FeaturedDemoRefreshPlatform =
  (typeof FEATURED_DEMO_REFRESH_PLATFORMS)[number];

/** Max cards stored / returned per demo handle. */
export const FEATURED_DEMO_ITEM_LIMIT = 8;

/**
 * Allow-listed demo handles per platform.
 * First entry is the default when no (or an unrecognized) handle is requested.
 */
export const FEATURED_DEMO_HANDLES = {
  tiktok: ["charlidamelio", "khaby.lame", "zachking", "mrbeast"],
  youtube: ["mrbeast", "mkbhd", "aliabdaal", "souravjoshivlogs"],
} as const satisfies Record<FeaturedDemoRefreshPlatform, readonly string[]>;

/** Alert when an active allow-listed handle has no successful refresh this long. */
export const FEATURED_DEMO_STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export function normalizeFeaturedDemoHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

export function isFeaturedDemoHandle(
  platform: FeaturedDemoRefreshPlatform,
  handle: string
): boolean {
  const normalized = normalizeFeaturedDemoHandle(handle);
  return (FEATURED_DEMO_HANDLES[platform] as readonly string[]).includes(
    normalized
  );
}

export function featuredDemoHandlesFor(
  platform: FeaturedDemoRefreshPlatform
): readonly string[] {
  return FEATURED_DEMO_HANDLES[platform];
}
