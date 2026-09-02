/**
 * THROWAWAY / DEV ONLY
 * Renders remake 73 from the exported remake dump (stored slotValuesJson,
 * slideStructureJson, imageUrlsJson). Does not rebuild fixture compositions.
 */
import { useSearch } from "wouter";
import { CarouselRenderer } from "@/components/CarouselRenderer";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import type { CarouselSlideSpec } from "@shared/carouselTemplates";
import { CAROUSEL_STUDIO_TEMPLATE_ID } from "@shared/carouselStudio";
import { remakeDump } from "./devRealRuntimeRemakeDump";

const template = CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID)!;
const slides = remakeDump.slideStructureJson as CarouselSlideSpec[];
const values = remakeDump.slotValuesJson as Record<
  string,
  Record<string, string>
>;
const imageUrls = (remakeDump.imageUrlsJson ?? undefined) as
  | Record<string, string | Record<string, string>>
  | undefined;

export default function DevBreakdownRealRuntimePreview() {
  const search = useSearch();
  const slideParam = Number(new URLSearchParams(search).get("slide") ?? "0");
  const visibleSlides =
    slideParam >= 1 && slideParam <= slides.length
      ? [slides[slideParam - 1]!]
      : slides;
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-[92rem] space-y-6">
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          THROWAWAY DEV PREVIEW. Stored remake {remakeDump.remakeId}. Not a
          product surface.
        </p>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">
            Remake {remakeDump.remakeId} stored slides
          </h1>
          <p className="max-w-2xl text-sm text-neutral-400 mt-2">
            Loaded from the remake dump. Layouts come from slideStructureJson.
          </p>
        </div>
        <div
          className={
            slideParam >= 1 && slideParam <= slides.length
              ? "flex justify-center"
              : "grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6"
          }
        >
          {visibleSlides.map((slide) => (
            <div key={slide.id} className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-neutral-400">
                {slide.id} / {slide.layoutId}
                {slide.composition?.archetype
                  ? ` / ${slide.composition.archetype}`
                  : ""}
              </p>
              <div data-real-runtime-slide={slide.id}>
                <CarouselRenderer
                  template={template}
                  slides={[slide]}
                  slideValues={values}
                  imageUrls={imageUrls}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
