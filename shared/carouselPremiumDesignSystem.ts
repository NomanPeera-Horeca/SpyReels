import type { BreakdownListicleTreatment } from "./carouselBreakdownFamily";

/**
 * Renderer-level visual variants for the premium Breakdown/Listicle family.
 *
 * These are deliberately downstream of Composition IR: the Visual Director
 * still decides semantic archetype/treatment; this layer only chooses geometry
 * and visual rhythm from existing render-time facts.
 */
export type BreakdownPremiumVariant =
  | "cover_editorial_image"
  | "cover_editorial_type"
  | "text_editorial"
  | "number_hero_left"
  | "number_feature_card"
  | "split_image_left"
  | "split_image_right"
  | "comparison_panels"
  | "diagram_process"
  | "timeline_editorial"
  | "checklist_grouped"
  | "checklist_cards"
  | "data_metric_hero"
  | "closing_manifesto";

export type BreakdownPremiumVariantInput = {
  treatment: BreakdownListicleTreatment;
  semanticRole?: string | null;
  listItemIndex?: number | null;
  imageUrl?: string | null;
};

/** Shared renderer tokens: one visual grammar, many semantic compositions. */
export const PREMIUM_CAROUSEL_DESIGN_FOUNDATION = {
  version: 1,
  spacing: {
    edge: "1.55rem",
    edgeGenerous: "1.8rem",
    section: "1.15rem",
    tight: "0.55rem",
  },
  radius: {
    surface: "1.15rem",
    media: "1.3rem",
    compact: "0.78rem",
    pill: "999px",
  },
  typography: {
    eyebrow: "0.66rem",
    body: "0.88rem",
    bodySmall: "0.8rem",
  },
  alpha: {
    hairline: 0.11,
    surface: 0.055,
    accentSoft: 0.12,
    accentMedium: 0.22,
    ghost: 0.16,
  },
} as const;

function hasImage(imageUrl?: string | null): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}

/**
 * Deterministic controlled variation.
 * No randomness, no new model call, and no content/template identifiers.
 */
export function resolveBreakdownPremiumVariant({
  treatment,
  listItemIndex,
  imageUrl,
}: BreakdownPremiumVariantInput): BreakdownPremiumVariant {
  switch (treatment) {
    case "strong_cover":
      return hasImage(imageUrl) ? "cover_editorial_image" : "cover_editorial_type";
    case "text_focus":
      return "text_editorial";
    case "number_focus":
      return (listItemIndex ?? 1) % 2 === 0
        ? "number_feature_card"
        : "number_hero_left";
    case "text_visual_split":
      return (listItemIndex ?? 1) % 2 === 0
        ? "split_image_left"
        : "split_image_right";
    case "comparison_split":
      return "comparison_panels";
    case "diagram_focus":
      return "diagram_process";
    case "timeline_flow":
      return "timeline_editorial";
    case "checklist_stack":
      return (listItemIndex ?? 1) % 3 === 1
        ? "checklist_cards"
        : "checklist_grouped";
    case "data_focus":
      return "data_metric_hero";
    case "closing_focus":
      return "closing_manifesto";
  }
}
