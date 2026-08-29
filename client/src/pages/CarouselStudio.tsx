/**
 * Admin-only Carousel Studio UI prototype (mock data, no backend).
 * Access by URL only. Non-admins see NotFound (same gate as AdminEntry).
 * Full-bleed page: mounted outside DashboardLayout in App.tsx.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { isAdminPanelClient } from "@/admin/isAdminClient";
import { CarouselStudioApp } from "@/components/carousel-studio/CarouselStudioApp";
import LandingPage from "@/pages/LandingPage";
import NotFound from "@/pages/NotFound";

export default function CarouselStudio() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  if (!isAdminPanelClient(user)) {
    return <NotFound />;
  }

  return <CarouselStudioApp />;
}
