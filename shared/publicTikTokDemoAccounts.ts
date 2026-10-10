/**
 * Curated TikTok handles the logged-out TikTok finder page may preview.
 * Source of truth lives in `featuredDemoCatalog` (platform-agnostic catalog).
 */
import {
  FEATURED_DEMO_HANDLES,
  FEATURED_DEMO_ITEM_LIMIT,
  isFeaturedDemoHandle,
  normalizeFeaturedDemoHandle,
} from "./featuredDemoCatalog";

export const PUBLIC_TIKTOK_DEMO_HANDLES = FEATURED_DEMO_HANDLES.tiktok;

export const PUBLIC_TIKTOK_DEMO_VIDEO_LIMIT = FEATURED_DEMO_ITEM_LIMIT;

export function isPublicTikTokDemoHandle(handle: string): boolean {
  return isFeaturedDemoHandle("tiktok", normalizeFeaturedDemoHandle(handle));
}
