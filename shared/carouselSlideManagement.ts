/**
 * Slide reorder / duplicate / delete for an existing remake.
 *
 * Canonical order is slideStructureJson. Maps stay keyed by stable slide.id.
 * Do not rename IDs to change order. Do not fork templates.
 *
 * Derived chrome (recomputed from current order/count):
 * - composition.position / totalSlides
 * - frameworkPartIndex / frameworkPartCount among slides that already have a part index
 * - roadmapStepIndex / roadmapStepCount among slides that already have a step index
 * - listItemIndex among slides that already have a list index
 * - sequence.index when sequence.kind is "list"
 *
 * Stored copy (never rewritten by these helpers):
 * - slotValuesJson text, including kickers like "03"
 */
import type { CarouselImageFrameMap } from "./carouselImageFrame";
import type { CarouselSlotStyleMap } from "./carouselSlotStyle";
import type { CarouselImageUrlMap, CarouselSlideSpec } from "./carouselTemplates";

export const CAROUSEL_EDITOR_MIN_SLIDES = 2;
export const CAROUSEL_EDITOR_MAX_SLIDES = 20;

export type CarouselEditorSlideState = {
  slideStructure: CarouselSlideSpec[];
  slotValues: Record<string, Record<string, string>>;
  slotStyles: CarouselSlotStyleMap;
  imageUrls: CarouselImageUrlMap;
  imageFrames: CarouselImageFrameMap;
};

export class CarouselSlideManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarouselSlideManagementError";
  }
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function nextUniqueSlideId(existingIds: Iterable<string>): string {
  const used = new Set(existingIds);
  for (let n = 1; n < 1000; n += 1) {
    const id = `slide_${String(n).padStart(2, "0")}`;
    if (!used.has(id)) return id;
  }
  throw new CarouselSlideManagementError("Could not allocate a unique slide ID");
}

export function pruneEditorMapsToSlides(
  state: CarouselEditorSlideState
): CarouselEditorSlideState {
  const keep = new Set(state.slideStructure.map((slide) => slide.id));
  return {
    slideStructure: state.slideStructure,
    slotValues: pickKeys(state.slotValues, keep),
    slotStyles: pickKeys(state.slotStyles, keep),
    imageUrls: pickKeys(state.imageUrls, keep),
    imageFrames: pickKeys(state.imageFrames, keep),
  };
}

export function recomputeDerivedSlideChrome(
  slides: CarouselSlideSpec[]
): CarouselSlideSpec[] {
  const total = slides.length;
  const frameworkCount = slides.filter(
    (slide) => slide.composition?.frameworkPartIndex != null
  ).length;
  const roadmapCount = slides.filter(
    (slide) => slide.composition?.roadmapStepIndex != null
  ).length;

  let framework = 0;
  let roadmap = 0;
  let list = 0;

  return slides.map((slide, index) => {
    if (!slide.composition) return slide;
    const composition = {
      ...slide.composition,
      position: index + 1,
      totalSlides: total,
    };

    if (slide.composition.frameworkPartIndex != null) {
      framework += 1;
      composition.frameworkPartIndex = framework;
      composition.frameworkPartCount = frameworkCount;
    }
    if (slide.composition.roadmapStepIndex != null) {
      roadmap += 1;
      composition.roadmapStepIndex = roadmap;
      composition.roadmapStepCount = roadmapCount;
    }
    if (slide.composition.listItemIndex != null) {
      list += 1;
      composition.listItemIndex = list;
      if (composition.sequence?.kind === "list") {
        composition.sequence = { ...composition.sequence, index: list };
      }
    }

    return { ...slide, composition };
  });
}

export function finalizeEditorSlideState(
  state: CarouselEditorSlideState
): CarouselEditorSlideState {
  const ids = state.slideStructure.map((slide) => slide.id);
  if (ids.some((id) => !id)) {
    throw new CarouselSlideManagementError("Every slide must have an ID");
  }
  if (new Set(ids).size !== ids.length) {
    throw new CarouselSlideManagementError("Slide IDs must be unique");
  }
  if (ids.length < CAROUSEL_EDITOR_MIN_SLIDES) {
    throw new CarouselSlideManagementError(
      `Carousels need at least ${CAROUSEL_EDITOR_MIN_SLIDES} slides`
    );
  }
  if (ids.length > CAROUSEL_EDITOR_MAX_SLIDES) {
    throw new CarouselSlideManagementError(
      `Carousels can have at most ${CAROUSEL_EDITOR_MAX_SLIDES} slides`
    );
  }

  return pruneEditorMapsToSlides({
    ...state,
    slideStructure: recomputeDerivedSlideChrome(state.slideStructure),
  });
}

export function reorderCarouselSlides(
  state: CarouselEditorSlideState,
  orderedSlideIds: string[]
): CarouselEditorSlideState {
  const currentIds = state.slideStructure.map((slide) => slide.id);
  if (!isPermutation(currentIds, orderedSlideIds)) {
    throw new CarouselSlideManagementError(
      "Slide order must include every current slide exactly once"
    );
  }
  const byId = new Map(state.slideStructure.map((slide) => [slide.id, slide]));
  return finalizeEditorSlideState({
    ...state,
    slideStructure: orderedSlideIds.map((id) => {
      const slide = byId.get(id);
      if (!slide) {
        throw new CarouselSlideManagementError("Unknown slide");
      }
      return slide;
    }),
  });
}

export function duplicateCarouselSlide(
  state: CarouselEditorSlideState,
  sourceSlideId: string
): { state: CarouselEditorSlideState; newSlideId: string } {
  if (state.slideStructure.length >= CAROUSEL_EDITOR_MAX_SLIDES) {
    throw new CarouselSlideManagementError(
      `Carousels can have at most ${CAROUSEL_EDITOR_MAX_SLIDES} slides`
    );
  }
  const sourceIndex = state.slideStructure.findIndex(
    (slide) => slide.id === sourceSlideId
  );
  if (sourceIndex < 0) {
    throw new CarouselSlideManagementError("Unknown slide");
  }

  const source = state.slideStructure[sourceIndex];
  const newSlideId = nextUniqueSlideId(state.slideStructure.map((slide) => slide.id));
  const cloned: CarouselSlideSpec = { ...cloneJson(source), id: newSlideId };
  const slideStructure = state.slideStructure.slice();
  slideStructure.splice(sourceIndex + 1, 0, cloned);

  return {
    newSlideId,
    state: finalizeEditorSlideState({
      slideStructure,
      slotValues: cloneKeyed(state.slotValues, sourceSlideId, newSlideId),
      slotStyles: cloneKeyed(state.slotStyles, sourceSlideId, newSlideId),
      imageUrls: cloneKeyed(state.imageUrls, sourceSlideId, newSlideId),
      imageFrames: cloneKeyed(state.imageFrames, sourceSlideId, newSlideId),
    }),
  };
}

export function deleteCarouselSlide(
  state: CarouselEditorSlideState,
  slideId: string
): CarouselEditorSlideState {
  if (state.slideStructure.length <= CAROUSEL_EDITOR_MIN_SLIDES) {
    throw new CarouselSlideManagementError(
      `Carousels need at least ${CAROUSEL_EDITOR_MIN_SLIDES} slides`
    );
  }
  if (!state.slideStructure.some((slide) => slide.id === slideId)) {
    throw new CarouselSlideManagementError("Unknown slide");
  }
  return finalizeEditorSlideState({
    slideStructure: state.slideStructure.filter((slide) => slide.id !== slideId),
    slotValues: state.slotValues,
    slotStyles: state.slotStyles,
    imageUrls: state.imageUrls,
    imageFrames: state.imageFrames,
  });
}

export function moveSlideId(
  ids: string[],
  draggedId: string,
  beforeId: string | null
): string[] {
  if (!ids.includes(draggedId)) {
    throw new CarouselSlideManagementError("Unknown slide");
  }
  if (beforeId != null && !ids.includes(beforeId)) {
    throw new CarouselSlideManagementError("Unknown slide");
  }
  if (beforeId === draggedId) return ids.slice();
  const next = ids.filter((id) => id !== draggedId);
  if (beforeId == null) {
    next.push(draggedId);
    return next;
  }
  next.splice(next.indexOf(beforeId), 0, draggedId);
  return next;
}

function isPermutation(current: string[], next: string[]): boolean {
  if (current.length !== next.length) return false;
  if (new Set(next).size !== next.length) return false;
  const have = new Set(current);
  return next.every((id) => have.has(id));
}

function pickKeys<T>(
  map: Record<string, T>,
  keep: Set<string>
): Record<string, T> {
  const next: Record<string, T> = {};
  for (const [key, value] of Object.entries(map ?? {})) {
    if (keep.has(key)) next[key] = value;
  }
  return next;
}

function cloneKeyed<T>(
  map: Record<string, T>,
  fromId: string,
  toId: string
): Record<string, T> {
  const next: Record<string, T> = { ...(map ?? {}) };
  if (Object.prototype.hasOwnProperty.call(next, fromId)) {
    next[toId] = cloneJson(next[fromId]);
  }
  return next;
}
