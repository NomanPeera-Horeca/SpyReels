/**
 * Shared Carousel Studio types (backend + frontend).
 * Phase 1: angle options only. Slide remake reuse comes in Phase 2+.
 */

/** One strategic direction proposed before full slide generation. */
export type CarouselAngleOption = {
  /** Category label, e.g. Contrarian, Framework, Story. */
  kicker: string;
  /** Short hook-style title for the direction. */
  title: string;
  /** One-sentence description of the strategic approach. */
  description: string;
  /** Suggested slide count for this direction (not full slide content). */
  estimatedSlideCount: number;
};

/** Payload shape stored in carousel_remakes.angleOptionsJson. */
export type CarouselAngleOptionsPayload = CarouselAngleOption[];

export const CAROUSEL_STUDIO_ANGLE_COUNT = 3;

export const CAROUSEL_STUDIO_MIN_SLIDES = 5;
export const CAROUSEL_STUDIO_MAX_SLIDES = 12;
