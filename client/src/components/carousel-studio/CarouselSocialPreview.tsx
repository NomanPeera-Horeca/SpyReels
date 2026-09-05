import { CarouselRenderer } from "@/components/CarouselRenderer";
import type {
  CarouselDesignTokens,
  CarouselImageUrlMap,
  CarouselSlideSpec,
  CarouselTemplate,
} from "@shared/carouselTemplates";
import type { CarouselSlideValuesById } from "@/components/CarouselRenderer";
import type { Platform } from "./mockData";
import {
  previewCaptionFromSlots,
  previewDisplayName,
  previewHandleLabel,
  previewInitial,
  socialPreviewTitle,
} from "./socialPreviewCopy";

type CarouselSocialPreviewProps = {
  platform: Platform;
  template: CarouselTemplate;
  slides: CarouselSlideSpec[];
  slideValues?: CarouselSlideValuesById | null;
  designOverride?: Partial<CarouselDesignTokens>;
  imageUrls?: CarouselImageUrlMap;
  handle?: string;
  displayName?: string | null;
  currentSlide: number;
  onSlideChange: (index: number) => void;
  onClose: () => void;
};

export function CarouselSocialPreview({
  platform,
  template,
  slides,
  slideValues,
  designOverride,
  imageUrls,
  handle,
  displayName,
  currentSlide,
  onSlideChange,
  onClose,
}: CarouselSocialPreviewProps) {
  const safeIndex = Math.min(Math.max(currentSlide, 0), Math.max(slides.length - 1, 0));
  const slide = slides[safeIndex];
  const caption = previewCaptionFromSlots(slideValues?.[slides[0]?.id ?? ""]);
  const name = previewDisplayName(displayName, handle);
  const handleLabel = previewHandleLabel(handle, displayName);
  const initial = previewInitial(name);
  const canPrev = safeIndex > 0;
  const canNext = safeIndex < slides.length - 1;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={socialPreviewTitle(platform)}>
      <div className={`modal social-preview-modal ${platform}`}>
        <div className="modal-head">
          <h2>{socialPreviewTitle(platform)}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close preview">
            ×
          </button>
        </div>
        <div className="modal-body social-preview-body">
          {platform === "linkedin" ? (
            <div className="li-post">
              <div className="li-post-head">
                <div className="li-avatar" aria-hidden>
                  {initial}
                </div>
                <div>
                  <strong>{name}</strong>
                  <span>Carousel document</span>
                </div>
              </div>
              {caption ? <p className="li-caption">{caption}</p> : null}
              <div className="li-slide-frame">
                {slide ? (
                  <CarouselRenderer
                    template={template}
                    slides={[slide]}
                    slideValues={slideValues ?? undefined}
                    designOverride={designOverride}
                    handle={handle}
                    imageUrls={imageUrls}
                  />
                ) : null}
              </div>
              <div className="social-preview-nav">
                <button
                  type="button"
                  className="btn small ghost"
                  disabled={!canPrev}
                  onClick={() => onSlideChange(safeIndex - 1)}
                >
                  Previous
                </button>
                <span>
                  {slides.length === 0 ? "0 / 0" : `${safeIndex + 1} / ${slides.length}`}
                </span>
                <button
                  type="button"
                  className="btn small ghost"
                  disabled={!canNext}
                  onClick={() => onSlideChange(safeIndex + 1)}
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div className="ig-post">
              <div className="ig-post-head">
                <div className="ig-avatar" aria-hidden>
                  {initial}
                </div>
                <strong>{handleLabel}</strong>
              </div>
              <div className="ig-slide-frame">
                {slide ? (
                  <CarouselRenderer
                    template={template}
                    slides={[slide]}
                    slideValues={slideValues ?? undefined}
                    designOverride={designOverride}
                    handle={handle}
                    imageUrls={imageUrls}
                  />
                ) : null}
                {canPrev ? (
                  <button
                    type="button"
                    className="ig-arrow prev"
                    aria-label="Previous slide"
                    onClick={() => onSlideChange(safeIndex - 1)}
                  >
                    ‹
                  </button>
                ) : null}
                {canNext ? (
                  <button
                    type="button"
                    className="ig-arrow next"
                    aria-label="Next slide"
                    onClick={() => onSlideChange(safeIndex + 1)}
                  >
                    ›
                  </button>
                ) : null}
              </div>
              <div className="ig-dots" aria-label="Carousel position">
                {slides.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={index === safeIndex ? "active" : ""}
                    aria-label={`Slide ${index + 1}`}
                    onClick={() => onSlideChange(index)}
                  />
                ))}
              </div>
              <div className="ig-actions" aria-hidden>
                <span>Like</span>
                <span>Comment</span>
                <span>Share</span>
                <span className="ig-save">Save</span>
              </div>
              {caption ? (
                <p className="ig-caption">
                  <strong>{handleLabel}</strong> {caption}
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
