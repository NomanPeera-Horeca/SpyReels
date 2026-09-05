/**
 * THROWAWAY / DEV ONLY
 * Temporary preview to visually confirm carousel slide layouts.
 * Remove once the real carousel library UI ships. Do not link from nav or marketing.
 */
import { useEffect, useMemo, useState } from "react";
import { CAROUSEL_TEMPLATE_FIVE_MISTAKES } from "@shared/carouselTemplates";
import type {
  CarouselImageUrlMap,
  CarouselSlideSpec,
  CarouselSlotValues,
} from "@shared/carouselTemplates";
import { CarouselRenderer } from "@/components/CarouselRenderer";

type QaDump = {
  slideStructureJson?: CarouselSlideSpec[];
  slotValuesJson?: Record<string, CarouselSlotValues>;
  imageUrlsJson?: CarouselImageUrlMap;
  selectedBrief?: { title?: string };
};

declare global {
  interface Window {
    __QA_CAROUSEL_DUMP__?: QaDump;
  }
}

export default function DevCarouselPreview() {
  const [dump, setDump] = useState<QaDump | null>(null);
  const search = typeof window === "undefined" ? "" : window.location.search;
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const roadmap = params.get("roadmap");

  useEffect(() => {
    const injected = window.__QA_CAROUSEL_DUMP__;
    if (injected?.slideStructureJson) {
      setDump(injected);
    }
  }, []);

  const slides = dump?.slideStructureJson;
  const title = dump?.selectedBrief?.title || CAROUSEL_TEMPLATE_FIVE_MISTAKES.name;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          THROWAWAY DEV PREVIEW. Not a product surface. Remove before shipping
          carousel library UI.
        </p>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {roadmap ? (
          <p className="text-xs text-neutral-500">Roadmap QA set: {roadmap}</p>
        ) : null}
        {slides && slides.length > 0 ? (
          <CarouselRenderer
            template={{
              ...CAROUSEL_TEMPLATE_FIVE_MISTAKES,
              slides,
            }}
            slides={slides}
            slideValues={dump?.slotValuesJson}
            imageUrls={dump?.imageUrlsJson}
          />
        ) : (
          <CarouselRenderer template={CAROUSEL_TEMPLATE_FIVE_MISTAKES} />
        )}
      </div>
    </div>
  );
}
