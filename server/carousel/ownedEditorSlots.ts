import { TRPCError } from "@trpc/server";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import type { CarouselSlideSpec } from "@shared/carouselTemplates";

/**
 * Authoritative slides for a remake: stored slideStructureJson when present,
 * otherwise the template catalog slides.
 */
export function slidesForRemake(
  templateSlides: CarouselSlideSpec[] | undefined,
  stored: unknown
): CarouselSlideSpec[] {
  if (Array.isArray(stored) && stored.length > 0) {
    return stored as CarouselSlideSpec[];
  }
  return templateSlides ?? [];
}

export function resolveOwnedEditorSlides(
  templateId: string,
  storedStructure: unknown
): CarouselSlideSpec[] {
  const template = CAROUSEL_TEMPLATES_BY_ID.get(templateId);
  return slidesForRemake(template?.slides, storedStructure);
}

function findOwnedSlide(
  slides: CarouselSlideSpec[],
  slideId: string
): CarouselSlideSpec {
  const slide = slides.find((item) => item.id === slideId);
  if (!slide) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Slide not found" });
  }
  return slide;
}

/** Text edits must target a real text slot on a real slide. */
export function assertOwnedEditorTextSlot(
  slides: CarouselSlideSpec[],
  slideId: string,
  slotId: string
): void {
  const slide = findOwnedSlide(slides, slideId);
  const slot = slide.slots.find((item) => item.id === slotId);
  if (!slot) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Slot not found" });
  }
}

/**
 * Image edits must target a real image slot.
 * When slotId is omitted (legacy slide-level URL), the slide must still
 * have at least one image slot.
 */
export function assertOwnedEditorImageSlot(
  slides: CarouselSlideSpec[],
  slideId: string,
  slotId?: string
): void {
  const slide = findOwnedSlide(slides, slideId);
  const imageSlots = slide.imageSlots ?? [];
  if (slotId) {
    const slot = imageSlots.find((item) => item.id === slotId);
    if (!slot) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "That slide has no matching image slot",
      });
    }
    return;
  }
  if (imageSlots.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "That slide has no matching image slot",
    });
  }
}
