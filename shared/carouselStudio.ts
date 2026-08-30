/**
 * Shared Carousel Studio types (backend + frontend).
 * Phase 2: angles persist on carousel_remakes, then the existing remake worker writes slides.
 */

/** One strategic direction proposed before full slide generation. */
export type CarouselAngleOption = {
  /** Category label, e.g. Contrarian, Framework, Story. */
  kicker: string;
  /** Short hook-style title for the direction. */
  title: string;
  /** One-sentence description of the strategic approach. */
  description: string;
  /** Suggested slide count for this direction (not full slide content). */
  estimatedSlideCount: number;
};

/** Payload shape stored in carousel_remakes.angleOptionsJson. */
export type CarouselAngleOptionsPayload = CarouselAngleOption[];

export const CAROUSEL_STUDIO_ANGLE_COUNT = 3;

export const CAROUSEL_STUDIO_MIN_SLIDES = 5;
export const CAROUSEL_STUDIO_MAX_SLIDES = 12;

/** Total slides the remake worker will generate from an angle estimate (hook + middles + CTA). */
export function studioPlannedSlideCount(estimatedSlideCount: number): number {
  const middle = Math.min(Math.max(estimatedSlideCount - 2, 3), 18);
  return middle + 2;
}

/** Same photo-led template as content-to-carousel "photo" style. */
export const CAROUSEL_STUDIO_TEMPLATE_ID = "photo_story_test";

export type CarouselStudioSourceType = "prompt" | "web" | "youtube";

export const CAROUSEL_REMAKE_PROGRESS_STAGES = [
  "writing_copy",
  "generating_images",
  "saving",
] as const;

export type CarouselRemakeProgressStage =
  (typeof CAROUSEL_REMAKE_PROGRESS_STAGES)[number];

/** True when the trimmed input should be resolved as a URL, not a freeform idea. */
export function looksLikeCarouselSourceUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^www\./i.test(trimmed)) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeCarouselSourceUrl(raw: string): string {
  const trimmed = raw.trim();
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/** Studio editor slide (headline/body + optional photo from the remake image chain). */
export type CarouselStudioSlide = {
  title: string;
  body: string;
  imageUrl?: string | null;
};

function firstUrlFromSlideEntry(
  value: string | Record<string, string> | undefined | null
): string | null {
  if (!value) return null;
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof value === "object") {
    for (const slotUrl of Object.values(value)) {
      if (typeof slotUrl === "string" && slotUrl.length > 0) return slotUrl;
    }
  }
  return null;
}

function pickSlideTitle(slots: Record<string, string>): string {
  const headline = slots.headline?.trim() || "";
  if (headline) return headline;
  const title = slots.title?.trim() || "";
  if (title) return title;
  return slots.kicker?.trim() || "";
}

function pickSlideBody(slots: Record<string, string>, title: string): string {
  const parts = [slots.body, slots.subhead, slots.cta_label]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0 && value !== title);
  return parts.join("\n\n");
}

/** Map remake slotValues + slideStructure + imageUrls into studio title/body slides. */
export function mapRemakeToStudioSlides(args: {
  slotValues: Record<string, Record<string, string>> | null | undefined;
  slideStructure: unknown;
  imageUrls: unknown;
}): CarouselStudioSlide[] {
  const slotValues = args.slotValues ?? {};
  const imageMap =
    args.imageUrls && typeof args.imageUrls === "object"
      ? (args.imageUrls as Record<string, string | Record<string, string>>)
      : {};

  const ids: string[] = [];
  if (Array.isArray(args.slideStructure)) {
    for (const slide of args.slideStructure) {
      if (!slide || typeof slide !== "object") continue;
      const id = (slide as { id?: unknown }).id;
      if (typeof id === "string" && id) ids.push(id);
    }
  }
  if (ids.length === 0) {
    ids.push(...Object.keys(slotValues));
  }

  const slides: CarouselStudioSlide[] = [];
  for (const id of ids) {
    const slots = slotValues[id] ?? {};
    const title = pickSlideTitle(slots);
    const body = pickSlideBody(slots, title);
    if (!title && !body) continue;
    slides.push({
      title: title || "Untitled slide",
      body,
      imageUrl: firstUrlFromSlideEntry(imageMap[id]),
    });
  }
  return slides;
}
