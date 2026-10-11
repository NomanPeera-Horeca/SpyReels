/**
 * Pages covered by the SEO contract guard.
 * - next: served by public-web (localhost:3100 in CI)
 * - migration-target: still Vite on production; baseline is the live contract
 *   the future Next page must match exactly.
 *
 * Migration note (Vite → Next): remove the hidden `#seo-crawler-snapshot`.
 * The visible SSR H1 is the only H1 Google should see.
 */

export type SeoPageDef = {
  /** Stable baseline filename (without .json) */
  id: string;
  path: string;
  kind: "next" | "migration-target";
  /**
   * Where to fetch HTML when updating baselines.
   * next → PLAYWRIGHT_BASE_URL (local)
   * migration-target → SEO_LIVE_ORIGIN (default https://spyreels.ai)
   */
};

export const SEO_NEXT_PAGES: readonly SeoPageDef[] = [
  { id: "homepage", path: "/", kind: "next" },
  { id: "viral-reel-finder", path: "/features/viral-reel-finder", kind: "next" },
  {
    id: "tiktok-viral-video-finder",
    path: "/free-tools/tiktok-viral-video-finder",
    kind: "next",
  },
  {
    id: "youtube-shorts-viral-finder",
    path: "/free-tools/youtube-shorts-viral-finder",
    kind: "next",
  },
  { id: "free-tools", path: "/free-tools", kind: "next" },
] as const;

/** Frozen live Vite captures kept for migration audits (not re-fetched in CI). */
export const SEO_MIGRATION_TARGET_PAGES: readonly SeoPageDef[] = [
  { id: "free-tools", path: "/free-tools", kind: "migration-target" },
] as const;

export const SEO_ALL_PAGES: readonly SeoPageDef[] = [
  ...SEO_NEXT_PAGES,
  ...SEO_MIGRATION_TARGET_PAGES,
];
