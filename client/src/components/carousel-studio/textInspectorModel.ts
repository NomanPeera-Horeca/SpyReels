import { inferCarouselSlotRole } from "@shared/carouselSlotStyle";
import type { CarouselTextSelection } from "@/components/carouselEditorChrome";

export type { CarouselTextSelection };

export function buildTextSelection(
  slideId: string,
  slotId: string
): CarouselTextSelection {
  return {
    slideId,
    slotId,
    role: inferCarouselSlotRole(slotId),
  };
}

export function selectionMatches(
  selection: CarouselTextSelection | null,
  slideId: string,
  slotId: string
): boolean {
  return Boolean(
    selection && selection.slideId === slideId && selection.slotId === slotId
  );
}

export function slotLabelForRole(role: string): string {
  if (role === "headline") return "Headline";
  if (role === "kicker") return "Kicker";
  if (role === "body") return "Body";
  if (role === "subtitle") return "Subtitle";
  if (role === "cta") return "CTA";
  if (role === "quote") return "Quote";
  return "Text";
}
