import type {
  CarouselCompositionIR,
  CarouselCompositionSlide,
  CarouselCompositionTextRole,
} from "./carouselCompositionIR";
import type {
  CarouselPlanningBeatRole,
  CarouselPlanningIR,
} from "./carouselPlanningIR";
import {
  CAROUSEL_STOCK_PREVIEW,
  type CarouselImageSlot,
  type CarouselLayoutId,
  type CarouselSlideRole,
  type CarouselSlideSpec,
  type CarouselSlotRole,
  type CarouselTemplate,
  type CarouselTextSlot,
} from "./carouselTemplates";

export const STORY_NARRATIVE_FAMILY = "story_narrative" as const;

export const STORY_NARRATIVE_TREATMENTS = [
  "cinematic_cover",
  "story_scene",
  "editorial_setup",
  "tension_statement",
  "quote_moment",
  "image_text_split",
  "turning_point",
  "timeline_moment",
  "insight_reveal",
  "story_closing",
] as const;
export type StoryNarrativeTreatment =
  (typeof STORY_NARRATIVE_TREATMENTS)[number];

export type StoryNarrativeComposition = {
  family: typeof STORY_NARRATIVE_FAMILY;
  archetype: string;
  treatment: StoryNarrativeTreatment;
  semanticRole: CarouselPlanningBeatRole;
  /** Story has no numbered list sequence. Kept null for shared render metadata shape. */
  listItemIndex: null;
  position: number;
  totalSlides: number;
};

type SlideWithLooseComposition = {
  composition?: { family?: string } | null;
};

export function isStoryNarrativeSlide(
  slide: SlideWithLooseComposition
): boolean {
  return slide.composition?.family === STORY_NARRATIVE_FAMILY;
}

/**
 * Story is an open narrative execution family. Explicit/enumerated promises stay
 * out of this family even if a strategist happened to label the angle "story".
 */
export function canUseStoryNarrativeFamily(
  planningIR: CarouselPlanningIR | null | undefined
): boolean {
  if (!planningIR) return false;
  if (planningIR.contract.kind !== "open") return false;
  return (
    planningIR.strategy.preferredFamily === "story" ||
    planningIR.strategy.angleType === "story"
  );
}

function isImageArchetype(archetype: string): boolean {
  return (
    archetype === "story_scene" ||
    archetype === "full_bleed_visual" ||
    archetype === "text_visual_split"
  );
}

function isTurningPointWindow(position: number, totalSlides: number): boolean {
  if (totalSlides < 5) return false;
  const firstPossible = Math.max(3, Math.ceil(totalSlides * 0.5));
  const lastPossible = Math.max(firstPossible, totalSlides - 2);
  return position >= firstPossible && position <= lastPossible;
}

/**
 * Convert semantic role + Composition IR into a Story treatment. The treatment
 * describes narrative purpose; renderer variants own exact geometry.
 */
export function resolveStoryNarrativeTreatment(args: {
  archetype: string;
  semanticRole: CarouselPlanningBeatRole | string;
  position: number;
  totalSlides: number;
}): StoryNarrativeTreatment {
  const { archetype, semanticRole, position, totalSlides } = args;

  if (semanticRole === "cover") return "cinematic_cover";
  if (semanticRole === "closing") return "story_closing";
  if (archetype === "timeline_flow") return "timeline_moment";
  if (archetype === "quote_focus") return "quote_moment";

  if (
    (semanticRole === "insight" || semanticRole === "transition") &&
    isTurningPointWindow(position, totalSlides)
  ) {
    return "turning_point";
  }

  if (semanticRole === "problem") {
    return isImageArchetype(archetype) ? "story_scene" : "tension_statement";
  }

  if (semanticRole === "insight" || semanticRole === "summary") {
    return "insight_reveal";
  }

  if (archetype === "story_scene" || archetype === "full_bleed_visual") {
    return "story_scene";
  }
  if (archetype === "text_visual_split") return "image_text_split";

  if (semanticRole === "context") return "editorial_setup";
  if (semanticRole === "example" || semanticRole === "story") {
    return isImageArchetype(archetype) ? "story_scene" : "editorial_setup";
  }

  return "editorial_setup";
}

function hasImage(imageUrl?: string | null): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}

/** Renderer-only degradation. Composition IR and stored treatment remain intact. */
export function resolveStoryNarrativeRenderTreatment(args: {
  treatment: StoryNarrativeTreatment;
  semanticRole?: string | null;
  imageUrl?: string | null;
}): StoryNarrativeTreatment {
  if (
    args.treatment !== "story_scene" &&
    args.treatment !== "image_text_split"
  ) {
    return args.treatment;
  }
  if (hasImage(args.imageUrl)) return args.treatment;
  if (args.semanticRole === "problem") return "tension_statement";
  if (args.semanticRole === "insight" || args.semanticRole === "summary") {
    return "insight_reveal";
  }
  if (args.treatment === "story_scene") return "story_scene";
  return "editorial_setup";
}

const REGION_SLOT_ROLE: Record<CarouselCompositionTextRole, CarouselSlotRole> = {
  sequence: "kicker",
  kicker: "kicker",
  headline: "headline",
  body: "body",
  support: "subhead",
  cta: "cta_label",
};

const REGION_LABEL: Record<CarouselCompositionTextRole, string> = {
  sequence: "Sequence",
  kicker: "Kicker",
  headline: "Headline",
  body: "Story detail",
  support: "Support",
  cta: "CTA",
};

const REGION_BUDGET: Record<
  CarouselCompositionTextRole,
  { min: number; max: number }
> = {
  sequence: { min: 1, max: 3 },
  kicker: { min: 4, max: 24 },
  headline: { min: 12, max: 58 },
  body: { min: 20, max: 150 },
  support: { min: 8, max: 90 },
  cta: { min: 6, max: 30 },
};

function slotForRegion(role: CarouselCompositionTextRole): CarouselTextSlot {
  return {
    id: role === "cta" ? "cta_label" : role,
    role: REGION_SLOT_ROLE[role],
    label: REGION_LABEL[role],
    budget: REGION_BUDGET[role],
    defaultText: "",
  };
}

function slotsForStorySlide(
  compositionSlide: CarouselCompositionSlide
): CarouselTextSlot[] {
  const slots = compositionSlide.textRegions
    .filter((region) => region.role !== "sequence")
    .map((region) => slotForRegion(region.role));

  if (!slots.some((slot) => slot.id === "headline")) {
    slots.unshift(slotForRegion("headline"));
  }

  const ids = new Set<string>();
  return slots.filter((slot) => {
    if (ids.has(slot.id)) return false;
    ids.add(slot.id);
    return true;
  });
}

function wantsPhoto(compositionSlide: CarouselCompositionSlide): boolean {
  return compositionSlide.visualRegions.some(
    (region) =>
      region.kind === "photo" ||
      region.kind === "illustration" ||
      region.kind === "icon_scene"
  );
}

function photoImageSlot(objective: string): CarouselImageSlot {
  return {
    id: "photo",
    label: "Story scene",
    searchQueryHint: objective,
    defaultImageUrl: CAROUSEL_STOCK_PREVIEW.cafeCreator,
  };
}

function slideRoleFromBeat(role: CarouselPlanningBeatRole): CarouselSlideRole {
  if (role === "cover") return "hook";
  if (role === "closing") return "cta";
  if (role === "problem") return "problem";
  if (role === "example" || role === "story") return "example";
  return "list_item";
}

function fallbackLayoutId(
  treatment: StoryNarrativeTreatment
): CarouselLayoutId {
  switch (treatment) {
    case "cinematic_cover":
      return "hook_photo_top";
    case "story_scene":
    case "image_text_split":
      return "photo_caption_bubble";
    case "quote_moment":
      return "quote_tweet_card";
    case "story_closing":
      return "cta_bold_center";
    default:
      return "hook_bold_center";
  }
}

/**
 * Build renderable Story slides from the existing Planning + Composition IRs.
 * No templates are chosen here beyond a legacy fallback layoutId required by
 * CarouselSlideSpec; the composition-aware registry owns the real renderer.
 */
export function buildStoryNarrativeSlides(args: {
  template: CarouselTemplate;
  planningIR: CarouselPlanningIR;
  compositionIR: CarouselCompositionIR;
}): CarouselSlideSpec[] {
  const count = Math.min(
    args.planningIR.beats.length,
    args.compositionIR.slides.length
  );
  const slides: CarouselSlideSpec[] = [];

  for (let index = 0; index < count; index += 1) {
    const beat = args.planningIR.beats[index]!;
    const compositionSlide = args.compositionIR.slides[index]!;
    const treatment = resolveStoryNarrativeTreatment({
      archetype: compositionSlide.archetype,
      semanticRole: beat.role,
      position: beat.position,
      totalSlides: count,
    });
    const storyComposition: StoryNarrativeComposition = {
      family: STORY_NARRATIVE_FAMILY,
      archetype: compositionSlide.archetype,
      treatment,
      semanticRole: beat.role,
      listItemIndex: null,
      position: beat.position,
      totalSlides: count,
    };

    const slide = {
      id: `slide_${String(index + 1).padStart(2, "0")}`,
      role: slideRoleFromBeat(beat.role),
      viralWhy: beat.objective,
      layoutId: fallbackLayoutId(treatment),
      slots: slotsForStorySlide(compositionSlide),
      ...(wantsPhoto(compositionSlide)
        ? { imageSlots: [photoImageSlot(beat.objective)] }
        : {}),
      composition: storyComposition,
    };

    // CarouselSlideSpec currently narrows composition metadata to the first
    // composition-aware family. Runtime/registry support multiple families;
    // keep this cast local until that legacy type is widened separately.
    slides.push(slide as unknown as CarouselSlideSpec);
  }

  return slides;
}
