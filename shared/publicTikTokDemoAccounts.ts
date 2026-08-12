/**
 * Curated TikTok handles the logged-out TikTok finder page may preview through
 * `tiktokScrape.publicDemo`. Hardcoded so adding scrape volume never silently
 * widens what unauthenticated visitors can read. First entry is the default.
 */
export const PUBLIC_TIKTOK_DEMO_HANDLES = [
  "charlidamelio",
  "khaby.lame",
  "zachking",
  "mrbeast",
] as const;

export const PUBLIC_TIKTOK_DEMO_VIDEO_LIMIT = 8;

export function isPublicTikTokDemoHandle(handle: string): boolean {
  return (PUBLIC_TIKTOK_DEMO_HANDLES as readonly string[]).includes(handle);
}
