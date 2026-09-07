import { Images } from "lucide-react";
import { useLocation } from "wouter";
import { CarouselLanding } from "@/components/carousel-studio/CarouselLanding";
import { detectCarouselSource } from "@/components/carousel-studio/carouselSourceDetector";
import { createCarouselLaunchId } from "@/components/carousel-studio/carouselLaunchSession";
import { trackCarouselCreateEvent } from "@/components/carousel-studio/trackCarouselCreateEvent";
import {
  CAROUSELS_LIBRARY_PATH,
  CAROUSELS_RECENT_LIMIT,
  buildCarouselEditHref,
  buildCarouselGenerateHref,
  pickRecentCarousels,
} from "@/components/carousel-studio/carouselsHub";
import { CAROUSEL_CREATE_EVENT } from "@shared/carouselCreateAnalytics";
import { CAROUSELS_DOCUMENT_TITLE } from "@/components/carousel-studio/carouselPageMeta";
import { useCarouselDocumentTitle } from "@/components/carousel-studio/useCarouselDocumentTitle";
import { trpc } from "@/lib/trpc";
import { useState } from "react";

export default function Carousels() {
  const [, setLocation] = useLocation();
  const [idea, setIdea] = useState("");
  const [creating, setCreating] = useState(false);
  useCarouselDocumentTitle(CAROUSELS_DOCUMENT_TITLE);
  const remakesQuery = trpc.carouselRemake.list.useQuery({
    limit: 20,
    sort: "newest",
  });
  const recent = pickRecentCarousels(
    remakesQuery.data ?? [],
    CAROUSELS_RECENT_LIMIT
  ).map((remake) => ({
    id: remake.id,
    title:
      remake.title?.trim() ||
      remake.niche?.trim() ||
      "Untitled carousel",
    createdAt: remake.createdAt,
    thumbnailUrl: remake.thumbnailUrl,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <CarouselLanding
        idea={idea}
        onIdeaChange={setIdea}
        submitting={creating}
        onCreate={(content) => {
          if (creating) return;
          setCreating(true);
          const launchId = createCarouselLaunchId();
          trackCarouselCreateEvent(CAROUSEL_CREATE_EVENT.submit, {
            source_kind: detectCarouselSource(content).kind,
            launch_id: launchId,
            surface: "hub",
          });
          setLocation(buildCarouselGenerateHref(content, launchId));
        }}
        recent={recent}
        onOpenRecent={(id) => setLocation(buildCarouselEditHref(id))}
      />
      <div className="mt-4 flex items-center justify-between gap-3 px-1 text-sm">
        <span className="inline-flex items-center gap-2 text-muted-foreground">
          <Images className="h-4 w-4" />
          Saved carousels
        </span>
        <a
          href={CAROUSELS_LIBRARY_PATH}
          className="shrink-0 font-medium text-primary hover:underline"
          onClick={(event) => {
            event.preventDefault();
            setLocation(CAROUSELS_LIBRARY_PATH);
          }}
        >
          View all →
        </a>
      </div>
    </div>
  );
}
