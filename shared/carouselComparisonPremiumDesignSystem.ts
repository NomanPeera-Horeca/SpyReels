import type { CarouselPlanningSequence } from "./carouselPlanningIR";
import type { ComparisonTreatment } from "./carouselComparisonFamily";
import { PREMIUM_CAROUSEL_DESIGN_FOUNDATION } from "./carouselPremiumDesignSystem";

export type ComparisonPremiumVariant =
  | "cover_split"
  | "cover_versus"
  | "cover_type"
  | "columns_rule"
  | "panels_editorial"
  | "left_dominant"
  | "right_dominant"
  | "stacked_contrast"
  | "offset_panels"
  | "before_after_split"
  | "before_after_stack"
  | "matrix_rows"
  | "matrix_editorial"
  | "score_editorial"
  | "score_type"
  | "myth_above"
  | "reality_first"
  | "winner_dominant"
  | "winner_type"
  | "closing_decision";

export const COMPARISON_PREMIUM_DESIGN_FOUNDATION = {
  ...PREMIUM_CAROUSEL_DESIGN_FOUNDATION,
  comparisonVersion: 1,
  typography: {
    ...PREMIUM_CAROUSEL_DESIGN_FOUNDATION.typography,
    comparisonBody: "0.84rem",
    sideLabel: "0.62rem",
    decision: "clamp(2rem, 8.2vw, 2.7rem)",
  },
} as const;

export type ComparisonPremiumVariantInput = {
  treatment: ComparisonTreatment;
  position: number;
  totalSlides: number;
  sequence?: CarouselPlanningSequence | null;
  imageUrl?: string | null;
  previousTreatment?: ComparisonTreatment | null;
};

function hasImage(imageUrl?: string | null): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}

/**
 * Deterministic renderer-level rhythm. Sequence side, semantic position, and
 * image presence are the stable inputs. No randomness and no model call.
 */
export function resolveComparisonPremiumVariant({
  treatment,
  position,
  totalSlides,
  sequence,
  imageUrl,
  previousTreatment,
}: ComparisonPremiumVariantInput): ComparisonPremiumVariant {
  const withImage = hasImage(imageUrl);
  const solutionFocus =
    sequence?.kind === "problem_solution" && sequence.side === "solution";
  const repeated = previousTreatment === treatment;

  switch (treatment) {
    case "contrast_cover":
      if (!withImage) return "cover_type";
      return totalSlides % 2 === 0 ? "cover_split" : "cover_versus";
    case "side_by_side":
      return position % 2 === 0 ? "columns_rule" : "panels_editorial";
    case "asymmetric_comparison":
      if (solutionFocus) return "right_dominant";
      if (repeated) return "right_dominant";
      return position % 2 === 0 ? "right_dominant" : "left_dominant";
    case "wrong_vs_right":
      return position % 2 === 0 ? "offset_panels" : "stacked_contrast";
    case "before_after":
      if (!withImage) return "stacked_contrast";
      return position % 2 === 0 ? "before_after_stack" : "before_after_split";
    case "tradeoff_matrix":
      return position % 2 === 0 || repeated ? "matrix_editorial" : "matrix_rows";
    case "comparison_score":
      if (repeated || position >= totalSlides - 2) return "score_editorial";
      return position % 2 === 0 ? "score_editorial" : "score_type";
    case "myth_reality":
      if (repeated) return "reality_first";
      return position % 2 === 0 ? "reality_first" : "myth_above";
    case "winner_reveal":
      return withImage ? "winner_dominant" : "winner_type";
    case "comparison_closing":
      return "closing_decision";
  }
}
