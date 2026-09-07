import { CarouselRenderer } from "@/components/CarouselRenderer";
import type { CarouselSlideValuesById } from "@/components/CarouselRenderer";
import type {
  CarouselImageUrlMap,
  CarouselSlideSpec,
  CarouselTemplate,
} from "@shared/carouselTemplates";

export type CarouselRecentThumbProps = {
  title: string;
  thumbnailUrl?: string | null;
  template?: CarouselTemplate | null;
  slides?: CarouselSlideSpec[] | null;
  slideValues?: CarouselSlideValuesById | null;
  imageUrls?: CarouselImageUrlMap | null;
  aspectRatio?: string | null;
};

/**
 * Compact Recent-row preview. Prefers a live first-slide render so text-led
 * carousels still show. Falls back to a photo URL, then an empty plate.
 */
export function CarouselRecentThumb({
  title,
  thumbnailUrl,
  template,
  slides,
  slideValues,
  imageUrls,
  aspectRatio,
}: CarouselRecentThumbProps) {
  const liveSlide =
    slides && slides.length > 0 ? slides[0] : template?.slides[0] ?? null;
  const canRenderLive = Boolean(template && liveSlide);

  if (canRenderLive && template && liveSlide) {
    return (
      <span
        className="carousel-mini-thumb carousel-mini-thumb-live"
        aria-hidden
        title={title}
      >
        <span className="carousel-mini-thumb-stage">
          <CarouselRenderer
            template={template}
            slides={[liveSlide]}
            slideValues={slideValues ?? undefined}
            designOverride={
              aspectRatio === "4:5" ||
              aspectRatio === "1:1" ||
              aspectRatio === "9:16"
                ? { aspectRatio }
                : undefined
            }
            imageUrls={imageUrls ?? undefined}
          />
        </span>
      </span>
    );
  }

  if (thumbnailUrl) {
    return (
      <img className="carousel-mini-thumb" src={thumbnailUrl} alt="" />
    );
  }

  return <span className="carousel-mini-thumb" aria-hidden />;
}
