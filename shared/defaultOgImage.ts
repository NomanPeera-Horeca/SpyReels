import { SPYREELS_SITE_URL } from "./publicPageMeta";

/** Default Open Graph / Twitter card image (first-party). */
export const DEFAULT_OG_IMAGE = `${SPYREELS_SITE_URL}/brand/og-default.jpg`;

/** Organization logo for JSON-LD / OG when a small mark is needed. */
export const SPYREELS_LOGO_OG_URL = `${SPYREELS_SITE_URL}/brand/spyreels-logo.png`;

/** Top blog slugs that should use cover art for OG when available (server falls back per post). */
export const PRIORITY_BLOG_OG_SLUGS = [
  "guide-spy-on-competitor-instagram-reels",
  "guide-how-to-go-viral-on-instagram-reels-2026",
  "guide-instagram-reels-hook-ideas-2026",
  "best-instagram-reels-tools-2026",
  "guide-instagram-reels-spy-tool",
] as const;
