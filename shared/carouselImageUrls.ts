import type { CarouselImageUrlMap } from "./carouselTemplates";

export function upsertCarouselImageUrlMap(
  current: CarouselImageUrlMap,
  slideId: string,
  url: string,
  slotId?: string
): CarouselImageUrlMap {
  const next: CarouselImageUrlMap = { ...current };
  if (slotId) {
    const existing = next[slideId];
    if (typeof existing === "string" || !existing) {
      next[slideId] = { [slotId]: url };
    } else {
      next[slideId] = { ...existing, [slotId]: url };
    }
    return next;
  }
  next[slideId] = url;
  return next;
}

export function fanOutCarouselCoverUrl(
  current: CarouselImageUrlMap,
  url: string,
  slideIds: string[]
): CarouselImageUrlMap {
  const next: CarouselImageUrlMap = { ...current };
  for (const slideId of slideIds) {
    next[slideId] = url;
  }
  return next;
}
