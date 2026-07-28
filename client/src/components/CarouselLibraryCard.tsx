import { useEffect, useRef, useState } from "react";
import type { CarouselTemplate } from "@shared/carouselTemplates";
import {
  resolveTemplatePreviewImageUrls,
  normalizeSlideImages,
} from "@shared/carouselTemplates";
import { CAROUSEL_LAYOUT_REGISTRY } from "@/components/carouselLayoutRegistry";
import { resolveCarouselSlideValues } from "@/components/CarouselRenderer";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ASPECT_RATIO_CSS: Record<CarouselTemplate["design"]["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

const HOVER_ADVANCE_MS = 900;

export type CarouselLibraryCardProps = {
  template: CarouselTemplate;
  onClick: () => void;
  isActive?: boolean;
};

/**
 * Library grid card: hover auto-advances slides; dots also switch slides.
 * No attribution blurb under the title.
 */
export function CarouselLibraryCard({
  template,
  onClick,
  isActive,
}: CarouselLibraryCardProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const slides = template.slides;
  const slideCount = slides.length;
  const activeIndex = Math.min(slideIndex, Math.max(slideCount - 1, 0));
  const activeSlide = slides[activeIndex];
  const Layout = activeSlide
    ? CAROUSEL_LAYOUT_REGISTRY[activeSlide.layoutId]
    : null;
  const activeValues = activeSlide
    ? resolveCarouselSlideValues(activeSlide)
    : null;
  const previewImages = resolveTemplatePreviewImageUrls(template);
  const { imageUrl, imageUrlsBySlot } = activeSlide
    ? normalizeSlideImages(previewImages[activeSlide.id])
    : {};
  const hoverTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isHovering || slideCount <= 1) {
      if (hoverTimerRef.current) {
        clearInterval(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      return;
    }

    hoverTimerRef.current = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % slideCount);
    }, HOVER_ADVANCE_MS);

    return () => {
      if (hoverTimerRef.current) {
        clearInterval(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, [isHovering, slideCount]);

  function handleMouseEnter() {
    setIsHovering(true);
  }

  function handleMouseLeave() {
    setIsHovering(false);
    setSlideIndex(0);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "workspace-reel-card group relative flex h-full w-full cursor-pointer flex-col overflow-hidden text-left",
        isActive && "ring-2 ring-primary/35"
      )}
    >
      <div
        className="relative w-full overflow-hidden bg-muted"
        style={{
          aspectRatio: ASPECT_RATIO_CSS[template.design.aspectRatio],
        }}
      >
        {Layout && activeValues ? (
          <div className="pointer-events-none absolute inset-0 flex items-stretch justify-center overflow-hidden">
            <Layout
              tokens={template.design}
              values={activeValues}
              imageUrl={imageUrl}
              imageUrlsBySlot={imageUrlsBySlot}
              className="h-full w-full"
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No slides
          </div>
        )}
      </div>

      {slideCount > 1 ? (
        <div
          className="flex items-center justify-center gap-1.5 px-2 py-2"
          role="tablist"
          aria-label="Preview slides"
          onClick={(e) => e.stopPropagation()}
        >
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              role="tab"
              aria-selected={index === activeIndex}
              aria-label={`Slide ${index + 1} of ${slideCount}`}
              onClick={(e) => {
                e.stopPropagation();
                setSlideIndex(index);
              }}
              onMouseEnter={(e) => {
                e.stopPropagation();
                setSlideIndex(index);
              }}
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                index === activeIndex
                  ? "bg-primary"
                  : "bg-muted-foreground/35 hover:bg-muted-foreground/55"
              )}
            />
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2 pt-1">
        <p className="text-sm font-semibold leading-snug text-foreground line-clamp-2">
          {template.name}
        </p>
      </div>

      <div className="mt-auto p-3 pt-0">
        <Button
          type="button"
          size="sm"
          className="w-full"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          Remake for my niche
        </Button>
      </div>
    </div>
  );
}
