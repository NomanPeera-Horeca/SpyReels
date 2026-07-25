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
          <div key={slide.id} style={{ flex: "0 0 auto" }}>
            <Layout tokens={template.design} values={values} />
          </div>
        );
      })}
    </div>
  );
}
