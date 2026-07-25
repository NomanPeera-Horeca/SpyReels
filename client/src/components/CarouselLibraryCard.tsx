import type { CarouselTemplate } from "@shared/carouselTemplates";
import { CAROUSEL_LAYOUT_REGISTRY } from "@/components/carouselLayoutRegistry";
import { resolveCarouselSlideValues } from "@/components/CarouselRenderer";
import { cn } from "@/lib/utils";

const ASPECT_RATIO_CSS: Record<CarouselTemplate["design"]["aspectRatio"], string> = {
  "4:5": "4 / 5",
  "1:1": "1 / 1",
  "9:16": "9 / 16",
};

export type CarouselLibraryCardProps = {
  template: CarouselTemplate;
  onClick: () => void;
  isActive?: boolean;
};

/**
 * Library grid card shell: same workspace-reel-card chrome as reel tiles.
 * Media area shows the first slide at the template aspect ratio (slide tokens only).
 */
export function CarouselLibraryCard({
  template,
  onClick,
  isActive,
}: CarouselLibraryCardProps) {
  const firstSlide = template.slides[0];
  const Layout = firstSlide
    ? CAROUSEL_LAYOUT_REGISTRY[firstSlide.layoutId]
    : null;
  const firstValues = firstSlide
    ? resolveCarouselSlideValues(firstSlide)
    : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "workspace-reel-card group relative flex h-full w-full flex-col overflow-hidden text-left",
        isActive && "ring-2 ring-primary/35"
      )}
    >
      <div
        className="relative w-full overflow-hidden bg-muted"
        style={{
          aspectRatio: ASPECT_RATIO_CSS[template.design.aspectRatio],
        }}
      >
        {Layout && firstValues ? (
          <div className="pointer-events-none absolute inset-0 flex items-stretch justify-center overflow-hidden">
            <Layout
              tokens={template.design}
              values={firstValues}
              className="h-full w-full"
            />
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No slides
          </div>
        )}
        <div className="absolute right-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white">
          {template.slides.length} slides
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-2">
        <p className="text-sm font-semibold leading-snug text-foreground line-clamp-2">
          {template.name}
        </p>
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {template.sourceAttribution}
        </p>
      </div>
    </button>
  );
}
