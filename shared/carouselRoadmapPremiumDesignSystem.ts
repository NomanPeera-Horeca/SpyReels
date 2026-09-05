import type { CarouselPlanningSequence } from "./carouselPlanningIR";
import type { RoadmapTreatment } from "./carouselRoadmapFamily";
import { PREMIUM_CAROUSEL_DESIGN_FOUNDATION } from "./carouselPremiumDesignSystem";

export type RoadmapPremiumVariant =
  | "cover_editorial"
  | "cover_path"
  | "route_map"
  | "step_focus"
  | "step_photo_split"
  | "action_checklist"
  | "progress_path"
  | "worked_example"
  | "checkpoint"
  | "recap"
  | "decision_close";

export const ROADMAP_PREMIUM_DESIGN_FOUNDATION = {
  ...PREMIUM_CAROUSEL_DESIGN_FOUNDATION,
  roadmapVersion: 1,
  typography: {
    ...PREMIUM_CAROUSEL_DESIGN_FOUNDATION.typography,
    roadmapBody: "0.86rem",
    stepLabel: "0.62rem",
    stepHero: "clamp(2.4rem, 10vw, 3.35rem)",
    nextAction: "clamp(1.75rem, 7vw, 2.35rem)",
  },
  geometry: {
    stationSize: "1.85rem",
    stationSizeActive: "2.45rem",
    pathStroke: "0.22rem",
    pathBand: "7.6rem",
  },
} as const;

export type RoadmapPremiumVariantInput = {
  treatment: RoadmapTreatment;
  position: number;
  totalSlides: number;
  archetype?: string | null;
  sequence?: CarouselPlanningSequence | null;
  roadmapStepCount?: number;
  roadmapStepIndex?: number | null;
  imageUrl?: string | null;
  previousVariant?: RoadmapPremiumVariant | null;
};

function hasImage(imageUrl?: string | null): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}

function avoidRepeat(
  candidate: RoadmapPremiumVariant,
  fallback: RoadmapPremiumVariant,
  previousVariant?: RoadmapPremiumVariant | null
): RoadmapPremiumVariant {
  if (previousVariant && candidate === previousVariant) return fallback;
  return candidate;
}

/**
 * Deterministic renderer-level rhythm. Semantic role, archetype, position,
 * and real Roadmap step structure are the stable inputs. No randomness and
 * no additional design-model call.
 *
 * Variant choice never changes stepCount or stepIndex.
 */
export function resolveRoadmapPremiumVariant({
  treatment,
  position,
  totalSlides: _totalSlides,
  archetype,
  roadmapStepCount = 0,
  roadmapStepIndex = null,
  imageUrl,
  previousVariant,
}: RoadmapPremiumVariantInput): RoadmapPremiumVariant {
  const grounded = roadmapStepCount >= 2;
  const even = position % 2 === 0;

  switch (treatment) {
    case "howto_cover":
      if (grounded) {
        return avoidRepeat("cover_path", "cover_editorial", previousVariant);
      }
      return "cover_editorial";
    case "route_overview":
      if (grounded) {
        return avoidRepeat("route_map", "progress_path", previousVariant);
      }
      return avoidRepeat("recap", "checkpoint", previousVariant);
    case "step_focus":
      if (!grounded || roadmapStepIndex == null) {
        return avoidRepeat("checkpoint", "recap", previousVariant);
      }
      if (hasImage(imageUrl) && archetype === "text_visual_split") {
        return "step_photo_split";
      }
      return even
        ? avoidRepeat("progress_path", "step_focus", previousVariant)
        : avoidRepeat("step_focus", "progress_path", previousVariant);
    case "action_checklist":
      return "action_checklist";
    case "obstacle_fix":
      return avoidRepeat("checkpoint", "recap", previousVariant);
    case "worked_example":
      return "worked_example";
    case "progress_checkpoint":
      return grounded
        ? avoidRepeat("checkpoint", "progress_path", previousVariant)
        : avoidRepeat("checkpoint", "recap", previousVariant);
    case "howto_summary":
      return avoidRepeat("recap", "checkpoint", previousVariant);
    case "howto_closing":
      return "decision_close";
  }
}

/**
 * Walk slides in order and thread previousVariant.
 * Variant choice never changes step count or step index.
 */
export function resolveRoadmapPremiumVariants(
  slides: RoadmapPremiumVariantInput[]
): RoadmapPremiumVariant[] {
  const resolved: RoadmapPremiumVariant[] = [];
  for (const slide of slides) {
    resolved.push(
      resolveRoadmapPremiumVariant({
        ...slide,
        previousVariant: resolved.at(-1) ?? null,
      })
    );
  }
  return resolved;
}

/**
 * previousVariant for each slide is the variant the previous slide
 * actually resolved, including image-aware choices.
 */
export function resolvePreviousRoadmapVariants(
  slides: RoadmapPremiumVariantInput[]
): Array<RoadmapPremiumVariant | null> {
  const variants = resolveRoadmapPremiumVariants(slides);
  return slides.map((_, index) =>
    index === 0 ? null : variants[index - 1] ?? null
  );
}
