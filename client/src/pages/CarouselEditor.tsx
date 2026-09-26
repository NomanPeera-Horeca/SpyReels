/**
 * Focused Carousel editor belonging to /carousels.
 * Full-bleed page: mounted outside DashboardLayout in App.tsx.
 */
import { Redirect, useRoute, useSearch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { CarouselStudioApp } from "@/components/carousel-studio/CarouselStudioApp";
import {
  CAROUSELS_PATH,
  parseStudioLaunchSearch,
} from "@/components/carousel-studio/carouselsHub";
import { CAROUSEL_EDITOR_DOCUMENT_TITLE } from "@/components/carousel-studio/carouselPageMeta";
import { useCarouselDocumentTitle } from "@/components/carousel-studio/useCarouselDocumentTitle";
import LandingPage from "@/pages/LandingPage";
import { redirectSignedOutToMarketing } from "@/lib/marketingOrigin";

export default function CarouselEditor() {
  const { user, loading } = useAuth();
  const [isNewRoute] = useRoute("/carousels/new");
  const [isEditRoute, params] = useRoute("/carousels/:remakeId/edit");
  const search = useSearch();
  useCarouselDocumentTitle(CAROUSEL_EDITOR_DOCUMENT_TITLE);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    if (redirectSignedOutToMarketing()) {
      return (
        <div className="flex min-h-screen items-center justify-center text-muted-foreground">
          Loading…
        </div>
      );
    }
    return <LandingPage />;
  }

  if (isNewRoute) {
    const intent = parseStudioLaunchSearch(search.startsWith("?") ? search : `?${search}`);
    if (intent.kind !== "generate" || !intent.content) {
      return <Redirect to={CAROUSELS_PATH} />;
    }
    return (
      <CarouselStudioApp
        launchContent={intent.content}
        launchId={intent.launchId}
      />
    );
  }

  const remakeId = Number(params?.remakeId);
  if (!isEditRoute || !Number.isInteger(remakeId) || remakeId <= 0) {
    return <Redirect to={CAROUSELS_PATH} />;
  }

  return <CarouselStudioApp launchRemakeId={remakeId} />;
}
