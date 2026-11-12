/**
 * Platform of a saved video from its link. Saved Reels rows only carry the
 * link, and Viral/Collected saves can be TikTok or YouTube, not just Instagram.
 */
export function platformFromReelUrl(url: string | null | undefined): "instagram" | "tiktok" | "youtube" {
  const u = (url ?? "").toLowerCase();
  if (/(^|\/\/|\.)(youtube\.com|youtu\.be)\//.test(u)) return "youtube";
  if (/(^|\/\/|\.)tiktok\.com\//.test(u)) return "tiktok";
  return "instagram";
}
