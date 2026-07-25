/**
 * THROWAWAY / DEV ONLY
 * Temporary preview to visually confirm carousel slide layouts.
 * Remove once the real carousel library UI ships. Do not link from nav or marketing.
 */
import { CAROUSEL_TEMPLATE_FIVE_MISTAKES } from "@shared/carouselTemplates";
import { CarouselRenderer } from "@/components/CarouselRenderer";

export default function DevCarouselPreview() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl space-y-4">
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          THROWAWAY DEV PREVIEW. Not a product surface. Remove before shipping
          carousel library UI.
        </p>
        <h1 className="text-xl font-semibold tracking-tight">
          {CAROUSEL_TEMPLATE_FIVE_MISTAKES.name}
        </h1>
        <p className="max-w-2xl text-sm text-neutral-400">
          {CAROUSEL_TEMPLATE_FIVE_MISTAKES.description}
        </p>
        <p className="text-xs text-neutral-500">
          {CAROUSEL_TEMPLATE_FIVE_MISTAKES.sourceAttribution}
        </p>
        <CarouselRenderer template={CAROUSEL_TEMPLATE_FIVE_MISTAKES} />
      </div>
    </div>
  );
}
