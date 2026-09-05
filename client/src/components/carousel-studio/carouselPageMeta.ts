export const CAROUSELS_DOCUMENT_TITLE = "Carousels | SpyReels";
export const CAROUSEL_LIBRARY_DOCUMENT_TITLE = "Carousel Library | SpyReels";
export const CAROUSEL_EDITOR_DOCUMENT_TITLE = "Edit Carousel | SpyReels";

export function carouselDocumentTitleForPath(pathname: string): string | null {
  const path = pathname.split("?")[0]?.replace(/\/$/, "") || "/";
  if (path === "/carousels") return CAROUSELS_DOCUMENT_TITLE;
  if (path === "/carousels/library" || path === "/carousel-library") {
    return CAROUSEL_LIBRARY_DOCUMENT_TITLE;
  }
  if (path === "/carousels/new" || /^\/carousels\/\d+\/edit$/.test(path)) {
    return CAROUSEL_EDITOR_DOCUMENT_TITLE;
  }
  if (path === "/carousel-studio") return CAROUSEL_EDITOR_DOCUMENT_TITLE;
  return null;
}
