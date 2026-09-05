import { FormEvent, useState } from "react";
import { Images, LayoutGrid } from "lucide-react";
import { useLocation } from "wouter";
import {
  CAROUSEL_TEMPLATES_BY_ID,
  type CarouselSlideSpec,
} from "@shared/carouselTemplates";
import { RemakeHistoryCard } from "@/components/RemakeHistoryCard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CAROUSELS_LIBRARY_PATH,
  CAROUSELS_RECENT_LIMIT,
  buildCarouselEditHref,
  buildCarouselGenerateHref,
  pickRecentCarousels,
  recentCarouselsGridClass,
} from "@/components/carousel-studio/carouselsHub";
import { CAROUSELS_DOCUMENT_TITLE } from "@/components/carousel-studio/carouselPageMeta";
import { useCarouselDocumentTitle } from "@/components/carousel-studio/useCarouselDocumentTitle";
import { trpc } from "@/lib/trpc";

export default function Carousels() {
  const [, setLocation] = useLocation();
  const [idea, setIdea] = useState("");
  useCarouselDocumentTitle(CAROUSELS_DOCUMENT_TITLE);
  const remakesQuery = trpc.carouselRemake.list.useQuery({
    limit: 20,
    sort: "newest",
  });
  const recent = pickRecentCarousels(remakesQuery.data ?? [], CAROUSELS_RECENT_LIMIT);
  const canGenerate = idea.trim().length > 0;

  function handleGenerate(event: FormEvent) {
    event.preventDefault();
    if (!canGenerate) return;
    setLocation(buildCarouselGenerateHref(idea));
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Images className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Create a carousel</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Turn an idea or source into a ready-to-edit carousel.
            </p>
          </div>
        </div>

        <form className="space-y-3" onSubmit={handleGenerate}>
          <Textarea
            aria-label="Carousel topic or link"
            placeholder="Type an idea or paste a link..."
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
            className="min-h-28 resize-y bg-background"
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={!canGenerate}>
              Generate
            </Button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-foreground">Recent Carousels</h2>
            <p className="text-sm text-muted-foreground">
              Reopen work you have already generated
            </p>
          </div>
          <a
            href={CAROUSELS_LIBRARY_PATH}
            className="shrink-0 text-sm font-medium text-primary hover:underline"
            onClick={(event) => {
              event.preventDefault();
              setLocation(CAROUSELS_LIBRARY_PATH);
            }}
          >
            View all →
          </a>
        </div>

        {remakesQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading your carousels…</p>
        ) : recent.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/20 px-5 py-8 text-center">
            <LayoutGrid className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">
              No saved carousels yet
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Generate your first carousel above. Recent work will show up here.
            </p>
          </div>
        ) : (
          <div className={recentCarouselsGridClass(recent.length)}>
            {recent.map((remake) => {
              const template = CAROUSEL_TEMPLATES_BY_ID.get(remake.templateId);
              const title =
                remake.title?.trim() ||
                remake.niche?.trim() ||
                template?.name ||
                "Untitled carousel";
              return (
                <RemakeHistoryCard
                  key={remake.id}
                  templateName={title}
                  niche={remake.niche}
                  status={remake.status}
                  createdAt={remake.createdAt}
                  postDate={remake.postDate}
                  thumbnailUrl={remake.thumbnailUrl}
                  slideImageUrls={remake.slideImageUrls}
                  previewTemplate={template}
                  previewSlides={remake.slideStructure as CarouselSlideSpec[] | null}
                  previewSlideValues={remake.slotValues}
                  previewImageUrls={remake.imageUrls}
                  previewAspect={remake.aspectRatioOverride}
                  onClick={() => setLocation(buildCarouselEditHref(remake.id))}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
