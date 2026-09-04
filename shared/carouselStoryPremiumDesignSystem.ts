import type { StoryNarrativeTreatment } from "./carouselStoryFamily";
import { PREMIUM_CAROUSEL_DESIGN_FOUNDATION } from "./carouselPremiumDesignSystem";

export type StoryPremiumVariant =
  | "cover_full_bleed"
  | "cover_editorial_frame"
  | "cover_type"
  | "scene_full_bleed"
  | "scene_framed"
  | "scene_caption_bottom"
  | "setup_left"
  | "setup_center"
  | "tension_oversized"
  | "tension_accent_field"
  | "quote_center"
  | "quote_side"
  | "split_image_left"
  | "split_image_right"
  | "turning_point_reveal"
  | "turning_point_image"
  | "timeline_editorial"
  | "insight_manifesto"
  | "insight_editorial"
  | "closing_resolution";

export const STORY_PREMIUM_DESIGN_FOUNDATION = {
  ...PREMIUM_CAROUSEL_DESIGN_FOUNDATION,
  storyVersion: 1,
  pacing: {
    imageHeavyEvery: 3,
    quoteWindow: 4,
  },
  typography: {
    ...PREMIUM_CAROUSEL_DESIGN_FOUNDATION.typography,
    storyBody: "0.86rem",
    caption: "0.75rem",
  },
} as const;

export type StoryPremiumVariantInput = {
  treatment: StoryNarrativeTreatment;
  position: number;
  totalSlides: number;
  imageUrl?: string | null;
};

function hasImage(imageUrl?: string | null): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}

/**
 * Deterministic renderer-level rhythm. Story has no numbered list sequence, so
 * physical narrative position is the stable input for left/right and scene
 * variation. No randomness and no model call.
 */
export function resolveStoryPremiumVariant({
  treatment,
  position,
  totalSlides,
  imageUrl,
}: StoryPremiumVariantInput): StoryPremiumVariant {
  const withImage = hasImage(imageUrl);

  switch (treatment) {
    case "cinematic_cover":
      if (!withImage) return "cover_type";
      return totalSlides % 2 === 0 ? "cover_full_bleed" : "cover_editorial_frame";
    case "story_scene":
      if (!withImage) return "scene_caption_bottom";
      if (position % 3 === 0) return "scene_caption_bottom";
      return position % 2 === 0 ? "scene_framed" : "scene_full_bleed";
    case "editorial_setup":
      return position % 2 === 0 ? "setup_left" : "setup_center";
    case "tension_statement":
      return position % 2 === 0
        ? "tension_accent_field"
        : "tension_oversized";
    case "quote_moment":
      return position % 2 === 0 ? "quote_side" : "quote_center";
    case "image_text_split":
      if (!withImage) return position % 2 === 0 ? "setup_left" : "setup_center";
      return position % 2 === 0 ? "split_image_left" : "split_image_right";
    case "turning_point":
      return withImage ? "turning_point_image" : "turning_point_reveal";
    case "timeline_moment":
      return "timeline_editorial";
    case "insight_reveal":
      return position % 2 === 0 ? "insight_editorial" : "insight_manifesto";
    case "story_closing":
      return "closing_resolution";
  }
}
