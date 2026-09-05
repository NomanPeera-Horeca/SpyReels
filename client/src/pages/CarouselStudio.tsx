/**
 * Legacy /carousel-studio URL. Redirects into the Carousels product.
 */
import { Redirect, useSearch } from "wouter";
import { legacyStudioRedirectPath } from "@/components/carousel-studio/carouselsHub";

export default function CarouselStudio() {
  const search = useSearch();
  return <Redirect to={legacyStudioRedirectPath(search)} />;
}
