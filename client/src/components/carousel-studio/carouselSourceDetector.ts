/**
 * Client entry for the shared carousel source detector.
 * Keep detection logic in shared/carouselSourceDetector.ts.
 */
export {
  CAROUSEL_DETECTED_SOURCE_KINDS,
  detectCarouselSource,
  looksLikeCarouselSourceUrl,
  normalizeCarouselSourceUrl,
  type CarouselDetectedSource,
  type CarouselDetectedSourceKind,
} from "@shared/carouselSourceDetector";
