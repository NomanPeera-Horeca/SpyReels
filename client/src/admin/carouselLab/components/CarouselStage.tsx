import { ChevronLeft, ChevronRight } from "lucide-react";
import { forwardRef } from "react";
import type { BrandSettings, CarouselSlide, TemplateId } from "../types";
import { SlideCanvas } from "./SlideCanvas";

export const CarouselStage = forwardRef<
  HTMLDivElement,
  {
    slide: CarouselSlide | null;
    templateId: TemplateId;
    brand: BrandSettings;
    index: number;
    total: number;
    onPrev: () => void;
    onNext: () => void;
  }
>(function CarouselStage(
  { slide, templateId, brand, index, total, onPrev, onNext },
  ref
) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-full max-w-[360px]">
        <div className="rounded-[2rem] border border-zinc-200 bg-zinc-100 p-3 shadow-xl dark:border-zinc-800 dark:bg-zinc-900">
          <div
            ref={ref}
            className="aspect-[4/5] w-full overflow-hidden rounded-[1.35rem] bg-white shadow-inner"
          >
            {slide ? (
              <SlideCanvas
                slide={slide}
                templateId={templateId}
                brand={brand}
                index={index}
                total={total}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm text-zinc-400">
                Paste a source and hit Generate to see your carousel here.
              </div>
            )}
          </div>
        </div>

        {slide ? (
          <>
            <button
              type="button"
              onClick={onPrev}
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-200 bg-white p-2 shadow-md dark:border-zinc-700 dark:bg-zinc-900"
              aria-label="Previous slide"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onNext}
              className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 rounded-full border border-zinc-200 bg-white p-2 shadow-md dark:border-zinc-700 dark:bg-zinc-900"
              aria-label="Next slide"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
});
