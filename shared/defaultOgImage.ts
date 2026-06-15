/** Default Open Graph / Twitter card image (1200px wide marketing asset on CDN). */
export const DEFAULT_OG_IMAGE =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/hero-workflow-3tnbssSHX3vSoQBktt96Lq.webp";

/** Legacy logo URL (small transparent PNG). Prefer DEFAULT_OG_IMAGE for social previews. */
export const SPYREELS_LOGO_OG_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663403284701/dX6p9AmjDXRxHekGRTFonS/spyreels-logo-2-transparent_d64117e8.png";

/** Top blog slugs that should use cover art for OG when available (server falls back per post). */
export const PRIORITY_BLOG_OG_SLUGS = [
  "guide-spy-on-competitor-instagram-reels",
  "guide-how-to-go-viral-on-instagram-reels-2026",
  "guide-instagram-reels-hook-ideas-2026",
  "best-instagram-reels-tools-2026",
  "guide-instagram-reels-spy-tool",
] as const;
