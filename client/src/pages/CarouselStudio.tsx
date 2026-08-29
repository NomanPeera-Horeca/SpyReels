/**
 * Admin-only Carousel Studio UI prototype (mock data, no backend).
 * Access by URL only. Non-admins see NotFound (same gate as AdminEntry).
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminPanelClient } from "@/admin/isAdminClient";
import { CarouselStudioApp } from "@/components/carousel-studio/CarouselStudioApp";
import NotFound from "@/pages/NotFound";

export default function CarouselStudio() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!isAdminPanelClient(user)) {
    return <NotFound />;
  }

  return <CarouselStudioApp />;
}
