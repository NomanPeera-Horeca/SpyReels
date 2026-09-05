import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  Send,
} from "lucide-react";
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
  const positionLabel =
    slides.length === 0 ? "0 / 0" : `${safeIndex + 1} / ${slides.length}`;

  const frameAspect = platform === "linkedin" ? "1 / 1" : "4 / 5";

  function renderSlide() {
    if (!slide) return null;
    return (
      <div className="social-slide-fill" style={{ aspectRatio: frameAspect }}>
        <CarouselRenderer
          template={template}
          slides={[slide]}
          slideValues={slideValues ?? undefined}
          designOverride={designOverride}
          handle={handle}
          imageUrls={imageUrls}
        />
      </div>
    );
  }

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
                <div className="li-identity">
                  <strong>{name}</strong>
                  <span>Document carousel</span>
                </div>
              </div>
              {caption ? <p className="li-caption">{caption}</p> : null}
              <div className="li-slide-frame">{renderSlide()}</div>
              <div className="li-nav">
                <button
                  type="button"
                  className="li-nav-btn"
                  disabled={!canPrev}
                  aria-label="Previous slide"
                  onClick={() => onSlideChange(safeIndex - 1)}
                >
                  <ChevronLeft size={18} strokeWidth={2.2} />
                </button>
                <span className="li-nav-pos">{positionLabel}</span>
                <button
                  type="button"
                  className="li-nav-btn"
                  disabled={!canNext}
                  aria-label="Next slide"
                  onClick={() => onSlideChange(safeIndex + 1)}
                >
                  <ChevronRight size={18} strokeWidth={2.2} />
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
                {renderSlide()}
                {canPrev ? (
                  <button
                    type="button"
                    className="ig-arrow prev"
                    aria-label="Previous slide"
                    onClick={() => onSlideChange(safeIndex - 1)}
                  >
                    <ChevronLeft size={18} strokeWidth={2.4} />
                  </button>
                ) : null}
                {canNext ? (
                  <button
                    type="button"
                    className="ig-arrow next"
                    aria-label="Next slide"
                    onClick={() => onSlideChange(safeIndex + 1)}
                  >
                    <ChevronRight size={18} strokeWidth={2.4} />
                  </button>
                ) : null}
              </div>
              <div className="ig-meta">
                <div className="ig-actions" aria-hidden>
                  <Heart size={22} strokeWidth={2} />
                  <MessageCircle size={22} strokeWidth={2} />
                  <Send size={22} strokeWidth={2} />
                  <Bookmark size={22} strokeWidth={2} className="ig-save" />
                </div>
                <div className="ig-dots" aria-label="Carousel position">
                  {slides.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className={index === safeIndex ? "active" : ""}
                      aria-label={`Slide ${index + 1} of ${slides.length}`}
                      onClick={() => onSlideChange(index)}
                    />
                  ))}
                </div>
              </div>
              {caption ? (
                <p className="ig-caption">
                  <strong>{handleLabel}</strong>
                  <span>{caption}</span>
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
