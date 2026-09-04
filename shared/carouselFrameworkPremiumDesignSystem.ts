import type { CarouselPlanningSequence } from "./carouselPlanningIR";
import type { FrameworkTreatment } from "./carouselFrameworkFamily";
import { PREMIUM_CAROUSEL_DESIGN_FOUNDATION } from "./carouselPremiumDesignSystem";

export type FrameworkPremiumVariant =
  | "cover_editorial"
  | "cover_diagram"
  | "centered_system"
  | "connected_nodes"
  | "vertical_pillars"
  | "stepped_path"
  | "vertical_flow"
  | "stacked_layers"
  | "circular_flow"
  | "decision_split"
  | "quadrant_editorial"
  | "manifesto"
  | "model_plus_example"
  | "framework_takeaway"
  | "decision_close";

export const FRAMEWORK_PREMIUM_DESIGN_FOUNDATION = {
  ...PREMIUM_CAROUSEL_DESIGN_FOUNDATION,
  frameworkVersion: 1,
  typography: {
    ...PREMIUM_CAROUSEL_DESIGN_FOUNDATION.typography,
    frameworkBody: "0.86rem",
    partLabel: "0.62rem",
    decision: "clamp(1.85rem, 7.4vw, 2.45rem)",
  },
} as const;

export type FrameworkPremiumVariantInput = {
  treatment: FrameworkTreatment;
  position: number;
  totalSlides: number;
  archetype?: string | null;
  sequence?: CarouselPlanningSequence | null;
  frameworkStepCount?: number;
  frameworkStepIndex?: number | null;
  imageUrl?: string | null;
  previousVariant?: FrameworkPremiumVariant | null;
};

function hasImage(imageUrl?: string | null): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}

function avoidRepeat(
  candidate: FrameworkPremiumVariant,
  fallback: FrameworkPremiumVariant,
  previousVariant?: FrameworkPremiumVariant | null
): FrameworkPremiumVariant {
  if (previousVariant && candidate === previousVariant) return fallback;
  return candidate;
}

/**
 * Deterministic renderer-level rhythm. Semantic role, archetype, position,
 * and real Framework structure are the stable inputs. No randomness and
 * no additional design-model call.
 */
export function resolveFrameworkPremiumVariant({
  treatment,
  position,
  totalSlides,
  archetype,
  sequence,
  frameworkStepCount = 0,
  imageUrl,
  previousVariant,
}: FrameworkPremiumVariantInput): FrameworkPremiumVariant {
  const withImage = hasImage(imageUrl);
  const ordered = sequence?.kind === "list";
  const even = position % 2 === 0;

  switch (treatment) {
    case "framework_cover":
      if (withImage) {
        return avoidRepeat("cover_editorial", "cover_diagram", previousVariant);
      }
      return avoidRepeat(
        frameworkStepCount >= 3 || totalSlides >= 6
          ? "cover_diagram"
          : "cover_editorial",
        "cover_editorial",
        previousVariant
      );
    case "model_overview":
      return avoidRepeat(
        even || archetype === "diagram_focus"
          ? "centered_system"
          : "connected_nodes",
        "connected_nodes",
        previousVariant
      );
    case "pillar_system":
      return "vertical_pillars";
    case "step_system":
      return avoidRepeat(
        ordered || even ? "stepped_path" : "vertical_flow",
        "vertical_flow",
        previousVariant
      );
    case "layered_model":
      return "stacked_layers";
    case "cycle_model":
      return "circular_flow";
    case "decision_tree":
      return "decision_split";
    case "matrix_framework":
      return "quadrant_editorial";
    case "principle_focus":
      return "manifesto";
    case "example_application":
      return "model_plus_example";
    case "framework_summary":
      return avoidRepeat("manifesto", "framework_takeaway", previousVariant);
    case "framework_closing":
      return totalSlides % 2 === 0 ? "decision_close" : "framework_takeaway";
  }
}
