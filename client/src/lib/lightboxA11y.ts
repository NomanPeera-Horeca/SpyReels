/** Tab cycle inside a modal. Null means the browser should move focus normally. */
export function cycleModalTab<T>(
  items: readonly T[],
  active: T | null,
  shiftKey: boolean
): T | null {
  if (items.length === 0) return null;
  const index = active == null ? -1 : items.indexOf(active);
  if (index === -1) return shiftKey ? items[items.length - 1]! : items[0]!;
  if (shiftKey && index === 0) return items[items.length - 1]!;
  if (!shiftKey && index === items.length - 1) return items[0]!;
  return null;
}

export const LIGHTBOX_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "iframe",
  "video",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Hide body scroll while a lightbox is open, and restore the previous value once. */
export function lockBodyScroll(body: { style: { overflow: string } }): () => void {
  const previous = body.style.overflow;
  body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    body.style.overflow = previous;
  };
}

/**
 * Lightbox body: failure wins over a still-pending refresh so the customer
 * never sees an endless spinner after the attempt has failed.
 */
export function lightboxMediaPhase(input: {
  videoFailed: boolean;
  isPreparing: boolean;
  playbackSettled: boolean;
  hasPlayableSrc: boolean;
}): "failed" | "loading" | "video" {
  if (input.videoFailed) return "failed";
  if (input.isPreparing || !input.playbackSettled) return "loading";
  if (!input.hasPlayableSrc) return "failed";
  return "video";
}
