import { readFile } from "node:fs/promises";
import {
  isComparisonFamilySlide,
  textContextForComparisonImageSlot,
} from "@shared/carouselComparisonFamily";
import {
  findBriefByOriginalStoredIndex,
  normalizeStoredCarouselBriefEntries,
} from "@shared/carouselStudio";
import {
  normalizeSlideImages,
  type CarouselImageUrlMap,
  type CarouselSlideSpec,
} from "@shared/carouselTemplates";
import { localObjectStorageDir, resolveLocalObjectPath } from "../storage";
import { resolveSlideImage } from "./resolveSlideImage";

export class CarouselImageRegenerateError extends Error {
  constructor(
    message: string,
    readonly code:
      | "INVALID_SLIDE"
      | "INVALID_SLOT"
      | "NO_IMAGE"
      | "FAILED" = "FAILED"
  ) {
    super(message);
    this.name = "CarouselImageRegenerateError";
  }
}

export function ownedImageUrlForSlot(
  imageUrls: unknown,
  slideId: string,
  slotId: string
): string | null {
  if (!imageUrls || typeof imageUrls !== "object") return null;
  const normalized = normalizeSlideImages(
    (imageUrls as CarouselImageUrlMap)[slideId]
  );
  if (normalized.imageUrlsBySlot) {
    return normalized.imageUrlsBySlot[slotId]?.trim() || null;
  }
  return normalized.imageUrl?.trim() || null;
}

export function imageTextContextForOwnedSlot(
  slide: CarouselSlideSpec,
  slideVals: Record<string, string>,
  imageSlotId: string
): string {
  if (isComparisonFamilySlide(slide) && (slide.imageSlots?.length ?? 0) > 1) {
    const sideCopy = textContextForComparisonImageSlot(slideVals, imageSlotId);
    if (sideCopy) return sideCopy;
  }
  const preferred = [
    slideVals.headline,
    slideVals.title,
    slideVals.body,
    slideVals.support,
    slideVals.subhead,
  ];
  return preferred.filter((value) => value?.trim()).join(" / ");
}

export function topicFromStoredBrief(
  angleOptionsJson: unknown,
  selectedAngleIndex: number | null
): string | null {
  const entries = normalizeStoredCarouselBriefEntries(angleOptionsJson);
  const brief = findBriefByOriginalStoredIndex(
    entries,
    selectedAngleIndex ?? 0
  );
  const fromBrief = brief?.topic?.trim() || brief?.title?.trim() || "";
  if (fromBrief) return fromBrief;
  if (!Array.isArray(angleOptionsJson)) return null;
  const raw = angleOptionsJson[selectedAngleIndex ?? 0];
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const topic = typeof row.topic === "string" ? row.topic.trim() : "";
  const title = typeof row.title === "string" ? row.title.trim() : "";
  return topic || title || null;
}

export function nearbySlideHeadlines(
  slides: CarouselSlideSpec[],
  slotValues: unknown,
  slideId: string
): string[] {
  const values =
    slotValues && typeof slotValues === "object"
      ? (slotValues as Record<string, Record<string, string>>)
      : {};
  const index = slides.findIndex((slide) => slide.id === slideId);
  if (index < 0) return [];
  const nearby: string[] = [];
  for (const offset of [-1, 1]) {
    const slide = slides[index + offset];
    if (!slide) continue;
    const row = values[slide.id] ?? {};
    const line = [row.headline, row.title, row.body].find((item) => item?.trim());
    if (line) nearby.push(line.replace(/\s+/g, " ").trim().slice(0, 80));
  }
  return nearby;
}

/**
 * Local-uploads URLs are not fetchable by the vision model.
 * Read them from LOCAL_OBJECT_STORAGE_DIR and pass a data URL instead.
 * Remote http(s) URLs are passed through. Failures fall back to text-only.
 */
export async function resolveCurrentImageForVision(
  currentUrl: string | null
): Promise<string | null> {
  const url = currentUrl?.trim() || null;
  if (!url) return null;
  if (url.startsWith("data:")) return url;
  const localKey = url.match(/\/local-uploads\/(.+)$/)?.[1];
  if (localKey && localObjectStorageDir()) {
    try {
      const buffer = await readFile(resolveLocalObjectPath(decodeURIComponent(localKey)));
      const mime = localKey.toLowerCase().endsWith(".jpg") || localKey.toLowerCase().endsWith(".jpeg")
        ? "image/jpeg"
        : "image/png";
      return `data:${mime};base64,${buffer.toString("base64")}`;
    } catch {
      return null;
    }
  }
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

export type OwnedImageRegenerateInput = {
  niche: string;
  topic: string | null;
  slides: CarouselSlideSpec[];
  slideId: string;
  slotId: string;
  slotValues: unknown;
  imageUrls: unknown;
};

/**
 * Generate ONE candidate for the selected image slot.
 * Stores the candidate via resolveSlideImage / storagePut so the browser
 * can preview it. Does NOT attach it to imageUrlsJson.
 * Cancel leaves unused candidate objects in storage (v1 has no GC).
 */
export async function regenerateOwnedSlideImageCandidate(
  input: OwnedImageRegenerateInput
): Promise<{ url: string }> {
  const slide = input.slides.find((item) => item.id === input.slideId);
  if (!slide) {
    throw new CarouselImageRegenerateError("Slide not found", "INVALID_SLIDE");
  }
  const imageSlot = slide.imageSlots?.find((slot) => slot.id === input.slotId);
  if (!imageSlot) {
    throw new CarouselImageRegenerateError(
      "That slide has no matching image slot",
      "INVALID_SLOT"
    );
  }

  const slideValues =
    input.slotValues && typeof input.slotValues === "object"
      ? ((input.slotValues as Record<string, Record<string, string>>)[
          input.slideId
        ] ?? {})
      : {};
  const textContext = imageTextContextForOwnedSlot(
    slide,
    slideValues,
    input.slotId
  );
  const nearby = nearbySlideHeadlines(input.slides, input.slotValues, input.slideId);
  const combinedText = [textContext, nearby.length ? `Nearby: ${nearby.join(" | ")}` : ""]
    .filter(Boolean)
    .join(" / ");
  const currentUrl = ownedImageUrlForSlot(input.imageUrls, input.slideId, input.slotId);
  const sourceImage = await resolveCurrentImageForVision(currentUrl);

  const url = await resolveSlideImage(
    imageSlot.searchQueryHint ?? "",
    input.niche,
    undefined,
    combinedText,
    {
      slideId: input.slideId,
      imageSlotId: input.slotId,
      sourceImage,
      topic: input.topic,
      slidePurpose: slide.viralWhy || slide.role,
      slotPurpose: imageSlot.label || imageSlot.id,
      requireTopicFit: true,
    }
  );
  if (!url) {
    throw new CarouselImageRegenerateError(
      "Couldn't generate another image. Try again.",
      "NO_IMAGE"
    );
  }
  return { url };
}
