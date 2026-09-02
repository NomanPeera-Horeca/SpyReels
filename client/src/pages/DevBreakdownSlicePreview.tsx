/**
 * THROWAWAY / DEV ONLY
 * Visual proof for the Breakdown/Listicle vertical slice.
 * Fixture Planning IR + mocked Visual Director treatments.
 * Pixels come from the real family renderer.
 */
import { useSearch } from "wouter";
import { CarouselRenderer } from "@/components/CarouselRenderer";
import { buildCashDrainsBreakdownSlice } from "@shared/carouselBreakdownSliceFixture";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import { CAROUSEL_STUDIO_TEMPLATE_ID } from "@shared/carouselStudio";

const slice = buildCashDrainsBreakdownSlice();
const template = CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID)!;

export default function DevBreakdownSlicePreview() {
  const search = useSearch();
  const slideParam = Number(new URLSearchParams(search).get("slide") ?? "0");
  const visibleSlides =
    slideParam >= 1 && slideParam <= slice.slides.length
      ? [slice.slides[slideParam - 1]!]
      : slice.slides;
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-[92rem] space-y-6">
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          THROWAWAY DEV PREVIEW. Fixture-driven Breakdown/Listicle slice. Not a
          product surface.
        </p>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            The 6 Silent Cash Drains Killing Small Businesses
          </h1>
          <p className="max-w-2xl text-sm text-neutral-400 mt-2">
            Cover, comparison, number, diagram, timeline, text plus visual,
            number, closing. Sequence numbers come from Planning IR.
          </p>
        </div>
        <div
          className={
            slideParam >= 1 && slideParam <= slice.slides.length
              ? "flex justify-center"
              : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6"
          }
        >
          {visibleSlides.map((slide) => (
            <div key={slide.id} className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                Slide {slice.slides.indexOf(slide) + 1} / {slide.composition?.treatment} /{" "}
                {slide.composition?.listItemIndex != null
                  ? `item ${String(slide.composition.listItemIndex).padStart(2, "0")}`
                  : slide.composition?.semanticRole}
              </p>
              <CarouselRenderer
                template={template}
                slides={[slide]}
                slideValues={slice.values}
                imageUrls={slice.imageUrls}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
