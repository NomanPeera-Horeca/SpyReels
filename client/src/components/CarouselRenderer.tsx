import type {
  CarouselSlotValues,
  CarouselSlideSpec,
  CarouselTemplate,
} from "@shared/carouselTemplates";
import { CAROUSEL_LAYOUT_REGISTRY } from "@/components/carouselLayoutRegistry";

/** Per-slide slot overrides, keyed by CarouselSlideSpec.id */
export type CarouselSlideValuesById = Record<string, CarouselSlotValues>;

export type CarouselRendererProps = {
  template: CarouselTemplate;
  /** Optional per-slide overrides. Missing slots fall back to defaultText. */
  slideValues?: CarouselSlideValuesById;
  className?: string;
  /** Optional per-slide download handler. When provided, a small download button renders on each slide. */
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

/**
 * Preview surface: renders every slide in template order via the layout registry.
 * Horizontal scroll so the full carousel reads left-to-right like Instagram.
 */
export function CarouselRenderer({
  template,
  slideValues,
  className,
  onDownloadSlide,
}: CarouselRendererProps) {
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
      {template.slides.map((slide) => {
        const Layout = CAROUSEL_LAYOUT_REGISTRY[slide.layoutId];
        const values = resolveCarouselSlideValues(slide, slideValues?.[slide.id]);
        return (
          <div
            key={slide.id}
            data-carousel-slide-id={slide.id}
            style={{ flex: "0 0 auto", position: "relative" }}
          >
            <Layout tokens={template.design} values={values} />
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
