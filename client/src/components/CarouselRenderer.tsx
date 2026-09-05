import type {
  CarouselSlotValues,
  CarouselSlideSpec,
  CarouselTemplate,
  CarouselDesignTokens,
  CarouselImageUrlMap,
} from "@shared/carouselTemplates";
import type { CarouselSlotStyleMap } from "@shared/carouselSlotStyle";
import { CarouselEditorChromeContext } from "@/components/carouselEditorChrome";
import { normalizeSlideImages } from "@shared/carouselTemplates";
import { resolveCarouselSlideComponent } from "@/components/carouselLayoutRegistry";
import { isFrameworkFamilySlide } from "@shared/carouselFrameworkFamily";
import type { FrameworkTreatment } from "@shared/carouselFrameworkFamily";
import {
  resolveFrameworkPremiumVariants,
  type FrameworkPremiumVariant,
} from "@shared/carouselFrameworkPremiumDesignSystem";
import { isRoadmapFamilySlide } from "@shared/carouselRoadmapFamily";
import type { RoadmapTreatment } from "@shared/carouselRoadmapFamily";
import {
  resolvePreviousRoadmapVariants,
  type RoadmapPremiumVariant,
} from "@shared/carouselRoadmapPremiumDesignSystem";

/** Per-slide slot overrides, keyed by CarouselSlideSpec.id */
export type CarouselSlideValuesById = Record<string, CarouselSlotValues>;

export type CarouselRendererProps = {
  template: CarouselTemplate;
  /** Optional per-slide overrides. Missing slots fall back to defaultText. */
  slideValues?: CarouselSlideValuesById;
  /** Optional slide list override (e.g. a remake generated at a different slide count than the template default). Falls back to template.slides. */
  slides?: CarouselSlideSpec[];
  /** Optional design token override (color/font choices made at remake time). Merged over template.design. */
  designOverride?: Partial<CarouselDesignTokens>;
  /** Optional handle text (e.g. "@yourbrand") rendered as a small overlay on every slide. Never sent to the AI; purely a static render-time value. */
  handle?: string;
  /** Resolved photo URLs keyed by slide id (string or per-slot map). */
  imageUrls?: CarouselImageUrlMap;
  className?: string;
  onDownloadSlide?: (slideId: string) => void;
  /** Enable click-to-edit on text slots (remake review). */
  editable?: boolean;
  /** Commit a text slot edit into remake values. */
  onSlotChange?: (slideId: string, slotId: string, value: string) => void;
  /** Per-slot typography overrides. Missing remakes stay on layout defaults. */
  slotStyles?: CarouselSlotStyleMap | null;
  /** Currently selected text slot. Editor-only. */
  selectedSlotId?: string | null;
  /** Click a text slot to select it. Editor-only. */
  onSlotSelect?: (slideId: string, slotId: string) => void;
};

/** Parse remake slotValuesJson (object or JSON string) into a slide-id map. */
export function normalizeCarouselSlideValues(
  raw: unknown
): CarouselSlideValuesById | null {
  let value: unknown = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as CarouselSlideValuesById;
}

/** Overlay local edits on server slot values. Overlay wins per slot. */
export function mergeCarouselSlideValues(
  base: CarouselSlideValuesById | null | undefined,
  overlay: CarouselSlideValuesById | null | undefined
): CarouselSlideValuesById | undefined {
  if (!base && !overlay) return undefined;
  const out: CarouselSlideValuesById = { ...(base ?? {}) };
  if (!overlay) return out;
  for (const [slideId, slots] of Object.entries(overlay)) {
    out[slideId] = { ...(out[slideId] ?? {}), ...slots };
  }
  return out;
}

function presentSlotOverride(
  overrides: CarouselSlotValues | undefined,
  slotId: string,
  slotRole: string
): string | undefined {
  if (!overrides) return undefined;
  const byId = overrides[slotId];
  if (typeof byId === "string" && byId !== "") return byId;
  if (slotRole !== slotId) {
    const byRole = overrides[slotRole];
    if (typeof byRole === "string" && byRole !== "") return byRole;
  }
  return undefined;
}

/**
 * Prefer stored remake slot values when present.
 * Fall back to slideStructure / template defaultText only if a slot has no value.
 */
export function resolveCarouselSlideValues(
  slide: CarouselSlideSpec,
  overrides?: CarouselSlotValues
): CarouselSlotValues {
  const values: CarouselSlotValues = {};
  for (const slot of slide.slots) {
    const override = presentSlotOverride(overrides, slot.id, slot.role);
    values[slot.id] = override ?? slot.defaultText;
  }
  return values;
}

/** previousVariant history uses the same imageUrl each slide actually renders. */
export function previousRoadmapVariantsForSlides(
  slides: CarouselSlideSpec[],
  imageUrls?: CarouselImageUrlMap,
  sharedCoverUrl?: string
): Array<RoadmapPremiumVariant | null> {
  const previous: Array<RoadmapPremiumVariant | null> = slides.map(() => null);
  const walkIndexes: number[] = [];
  const walkInputs = slides.flatMap((slide, index) => {
    if (!isRoadmapFamilySlide(slide) || !slide.composition) return [];
    walkIndexes.push(index);
    const { imageUrl } = sharedCoverUrl
      ? { imageUrl: sharedCoverUrl }
      : normalizeSlideImages(imageUrls?.[slide.id]);
    return [
      {
        treatment: slide.composition.treatment as RoadmapTreatment,
        position: slide.composition.position ?? index + 1,
        totalSlides: slide.composition.totalSlides ?? slides.length,
        archetype: slide.composition.archetype,
        roadmapStepCount: slide.composition.roadmapStepCount,
        roadmapStepIndex: slide.composition.roadmapStepIndex,
        imageUrl,
      },
    ];
  });
  const previousWalk = resolvePreviousRoadmapVariants(walkInputs);
  walkIndexes.forEach((slideIndex, walkIndex) => {
    previous[slideIndex] = previousWalk[walkIndex] ?? null;
  });
  return previous;
}

function firstUrlFromMap(map: CarouselImageUrlMap | undefined): string | undefined {
  if (!map) return undefined;
  const first = Object.values(map)[0];
  if (!first) return undefined;
  return typeof first === "string" ? first : Object.values(first)[0];
}

/**
 * Preview surface: renders every slide in template order via the layout registry.
 * Horizontal scroll so the full carousel reads left-to-right like Instagram.
 */
export function CarouselRenderer({
  template,
  slideValues,
  slides,
  designOverride,
  handle,
  imageUrls,
  className,
  onDownloadSlide,
  editable,
  onSlotChange,
  slotStyles,
  selectedSlotId,
  onSlotSelect,
}: CarouselRendererProps) {
  const effectiveSlides = slides ?? template.slides;
  const effectiveTokens: CarouselDesignTokens = designOverride
    ? { ...template.design, ...designOverride }
    : template.design;

  const sharedCoverUrl = template.shareCoverImage
    ? (() => {
        const coverSlide = effectiveSlides.find(
          (s) => s.imageSlots && s.imageSlots.length > 0
        );
        const entry = coverSlide ? imageUrls?.[coverSlide.id] : undefined;
        const normalized = normalizeSlideImages(
          typeof entry === "string" || (entry && typeof entry === "object")
            ? entry
            : undefined
        );
        return normalized.imageUrl ?? firstUrlFromMap(imageUrls);
      })()
    : undefined;

  const previousFrameworkVariants: Array<FrameworkPremiumVariant | null> =
    (() => {
      const previous: Array<FrameworkPremiumVariant | null> = effectiveSlides.map(
        () => null
      );
      const walkIndexes: number[] = [];
      const walkInputs = effectiveSlides.flatMap((slide, index) => {
        if (!isFrameworkFamilySlide(slide) || !slide.composition) return [];
        walkIndexes.push(index);
        return [
          {
            treatment: slide.composition.treatment as FrameworkTreatment,
            position: slide.composition.position ?? index + 1,
            totalSlides:
              slide.composition.totalSlides ?? effectiveSlides.length,
            archetype: slide.composition.archetype,
            frameworkPartCount: slide.composition.frameworkPartCount,
            frameworkPartIndex: slide.composition.frameworkPartIndex,
          },
        ];
      });
      const variants = resolveFrameworkPremiumVariants(walkInputs);
      walkIndexes.forEach((slideIndex, walkIndex) => {
        previous[slideIndex] = walkIndex === 0 ? null : variants[walkIndex - 1] ?? null;
      });
      return previous;
    })();

  const previousRoadmapVariants = previousRoadmapVariantsForSlides(
    effectiveSlides,
    imageUrls,
    template.shareCoverImage ? sharedCoverUrl : undefined
  );

  return (
    <div
      className={className}
      style={{
        display: "flex",
        flexDirection: "row",
        gap: "1rem",
        overflowX: "auto",
        paddingBottom: "0.5rem",
        WebkitOverflowScrolling: "touch",
      }}
    >
      {effectiveSlides.map((slide, index) => {
        const Layout = resolveCarouselSlideComponent(slide);
        const values = resolveCarouselSlideValues(slide, slideValues?.[slide.id]);
        const { imageUrl, imageUrlsBySlot } = template.shareCoverImage
          ? { imageUrl: sharedCoverUrl, imageUrlsBySlot: undefined }
          : normalizeSlideImages(imageUrls?.[slide.id]);
        return (
          <div
            key={slide.id}
            data-carousel-slide-id={slide.id}
            style={{ flex: "0 0 auto", position: "relative" }}
          >
            <CarouselEditorChromeContext.Provider
              value={{
                slideId: slide.id,
                selectedSlotId: selectedSlotId ?? null,
                selectionEnabled: Boolean(editable && onSlotSelect),
                styles: slotStyles?.[slide.id],
                onSelectSlot: onSlotSelect
                  ? (slotId) => onSlotSelect(slide.id, slotId)
                  : undefined,
              }}
            >
            <Layout
              tokens={effectiveTokens}
              values={values}
              handle={handle}
              imageUrl={imageUrl}
              imageUrlsBySlot={imageUrlsBySlot}
              editable={editable}
              composition={slide.composition}
              previousVariant={previousFrameworkVariants[index]}
              previousRoadmapVariant={previousRoadmapVariants[index]}
              onSlotChange={
                onSlotChange
                  ? (slotId, value) => onSlotChange(slide.id, slotId, value)
                  : undefined
              }
            />
            </CarouselEditorChromeContext.Provider>
            {onDownloadSlide ? (
              <button
                type="button"
                onClick={() => onDownloadSlide(slide.id)}
                aria-label="Download this slide as PNG"
                style={{
                  position: "absolute",
                  top: "0.5rem",
                  right: "0.5rem",
                  zIndex: 10,
                  fontSize: "0.7rem",
                  padding: "0.25rem 0.5rem",
                  borderRadius: "0.25rem",
                  border: "1px solid rgba(255,255,255,0.3)",
                  background: "rgba(15,20,25,0.7)",
                  color: "#F4F1EA",
                  cursor: "pointer",
                }}
              >
                ↓ PNG
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
