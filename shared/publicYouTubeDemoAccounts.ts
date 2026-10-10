/**
 * Curated YouTube handles the logged-out Shorts finder may preview.
 * Source of truth lives in `featuredDemoCatalog` (platform-agnostic catalog).
 */
import {
  FEATURED_DEMO_HANDLES,
  FEATURED_DEMO_ITEM_LIMIT,
  isFeaturedDemoHandle,
  normalizeFeaturedDemoHandle,
} from "./featuredDemoCatalog";

export const PUBLIC_YOUTUBE_DEMO_HANDLES = FEATURED_DEMO_HANDLES.youtube;

export const PUBLIC_YOUTUBE_DEMO_VIDEO_LIMIT = FEATURED_DEMO_ITEM_LIMIT;

export function isPublicYouTubeDemoHandle(handle: string): boolean {
  return isFeaturedDemoHandle("youtube", normalizeFeaturedDemoHandle(handle));
}
