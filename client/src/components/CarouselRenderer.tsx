import type {
  CarouselSlotValues,
  CarouselSlideSpec,
  CarouselTemplate,
  CarouselDesignTokens,
  CarouselImageUrlMap,
} from "@shared/carouselTemplates";
import { normalizeSlideImages } from "@shared/carouselTemplates";
import { CAROUSEL_LAYOUT_REGISTRY } from "@/components/carouselLayoutRegistry";

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
};

export function resolveCarouselSlideValues(
  slide: CarouselSlideSpec,
  overrides?: CarouselSlotValues
): CarouselSlotValues {
  const values: CarouselSlotValues = {};
  for (const slot of slide.slots) {
    const override = overrides?.[slot.id];
    values[slot.id] =
      override !== undefined && override !== "" ? override : slot.defaultText;
  }
  return values;
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
      {effectiveSlides.map((slide) => {
        const Layout = CAROUSEL_LAYOUT_REGISTRY[slide.layoutId];
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
            <Layout
              tokens={effectiveTokens}
              values={values}
              handle={handle}
              imageUrl={imageUrl}
              imageUrlsBySlot={imageUrlsBySlot}
            />
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
