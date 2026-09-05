export type CarouselImageFrameOverride = {
  posX: number;
  posY: number;
  zoom: number;
};

export type CarouselImageFrameMap = Record<
  string,
  Record<string, CarouselImageFrameOverride>
>;

export type CarouselImageFramePatch = Partial<CarouselImageFrameOverride>;

export const CAROUSEL_IMAGE_ZOOM_MIN = 1;
export const CAROUSEL_IMAGE_ZOOM_MAX = 2;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function defaultCarouselImageFrame(): CarouselImageFrameOverride {
  return { posX: 50, posY: 50, zoom: 1 };
}

export function normalizeCarouselImageFrame(
  raw: unknown
): CarouselImageFrameOverride | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const posX = typeof rec.posX === "number" ? rec.posX : null;
  const posY = typeof rec.posY === "number" ? rec.posY : null;
  const zoom = typeof rec.zoom === "number" ? rec.zoom : null;
  if (posX == null && posY == null && zoom == null) return null;
  return {
    posX: clamp(posX ?? 50, 0, 100),
    posY: clamp(posY ?? 50, 0, 100),
    zoom: clamp(zoom ?? 1, CAROUSEL_IMAGE_ZOOM_MIN, CAROUSEL_IMAGE_ZOOM_MAX),
  };
}

export function normalizeCarouselImageFrameMap(
  raw: unknown
): CarouselImageFrameMap {
  if (!raw || typeof raw !== "object") return {};
  const next: CarouselImageFrameMap = {};
  for (const [slideId, slots] of Object.entries(raw as Record<string, unknown>)) {
    if (!slots || typeof slots !== "object") continue;
    const slide: Record<string, CarouselImageFrameOverride> = {};
    for (const [slotId, frame] of Object.entries(slots as Record<string, unknown>)) {
      const normalized = normalizeCarouselImageFrame(frame);
      if (normalized) slide[slotId] = normalized;
    }
    if (Object.keys(slide).length > 0) next[slideId] = slide;
  }
  return next;
}

export function upsertCarouselImageFrameMap(
  current: CarouselImageFrameMap,
  slideId: string,
  slotId: string,
  patch: CarouselImageFramePatch
): CarouselImageFrameMap {
  const prev = current[slideId]?.[slotId] ?? defaultCarouselImageFrame();
  const nextFrame = normalizeCarouselImageFrame({
    posX: patch.posX ?? prev.posX,
    posY: patch.posY ?? prev.posY,
    zoom: patch.zoom ?? prev.zoom,
  });
  const slide = { ...(current[slideId] ?? {}) };
  if (nextFrame) slide[slotId] = nextFrame;
  return { ...current, [slideId]: slide };
}

export function applyCarouselImageFrame(
  style: Record<string, unknown> | undefined,
  frame: CarouselImageFrameOverride | null | undefined
): Record<string, unknown> {
  const base = { ...(style ?? {}) };
  if (!frame) {
    return {
      ...base,
      backgroundPosition: base.backgroundPosition ?? "center",
      backgroundSize: base.backgroundSize ?? "cover",
      backgroundRepeat: "no-repeat",
    };
  }
  const zoom = frame.zoom <= 1 ? "cover" : `${Math.round(frame.zoom * 100)}%`;
  return {
    ...base,
    backgroundPosition: `${frame.posX}% ${frame.posY}%`,
    backgroundSize: zoom,
    backgroundRepeat: "no-repeat",
  };
}
