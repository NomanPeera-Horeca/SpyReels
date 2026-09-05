/**
 * Authenticated Carousel Studio.
 * Full-bleed page: mounted outside DashboardLayout in App.tsx.
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { CarouselStudioApp } from "@/components/carousel-studio/CarouselStudioApp";
import LandingPage from "@/pages/LandingPage";

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

  return <CarouselStudioApp />;
}
