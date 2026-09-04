/**
 * Comparison execution family.
 * Consumes Planning IR + Composition IR. Does not invent A/B meaning from copy.
 */

import type {
  CarouselCompositionIR,
  CarouselCompositionSlide,
  CarouselCompositionTextRole,
} from "./carouselCompositionIR";
import type {
  CarouselPlanningBeat,
  CarouselPlanningBeatRole,
  CarouselPlanningIR,
  CarouselPlanningSequence,
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

export const COMPARISON_FAMILY = "comparison" as const;

export const COMPARISON_TREATMENTS = [
  "contrast_cover",
  "side_by_side",
  "asymmetric_comparison",
  "wrong_vs_right",
  "before_after",
  "tradeoff_matrix",
  "comparison_score",
  "myth_reality",
  "winner_reveal",
  "comparison_closing",
] as const;
export type ComparisonTreatment = (typeof COMPARISON_TREATMENTS)[number];

export type ComparisonSideKind = "problem" | "solution" | "option_a" | "option_b";

export type ComparisonSideIdentity = {
  leftKind: ComparisonSideKind;
  rightKind: ComparisonSideKind;
  focus: "problem" | "solution" | null;
  index: number | null;
};

export type ComparisonComposition = {
  family: typeof COMPARISON_FAMILY;
  archetype: string;
  treatment: ComparisonTreatment;
  semanticRole: CarouselPlanningBeatRole;
  listItemIndex: null;
  sequence: CarouselPlanningSequence | null;
  position: number;
  totalSlides: number;
};

type SlideWithLooseComposition = {
  composition?: { family?: string } | null;
};

export function isComparisonFamilySlide(
  slide: SlideWithLooseComposition
): boolean {
  return slide.composition?.family === COMPARISON_FAMILY;
}

function bodyBeats(planningIR: CarouselPlanningIR): CarouselPlanningBeat[] {
  return planningIR.beats.filter(
    (beat) => beat.role !== "cover" && beat.role !== "closing"
  );
}

function comparisonRoleCount(planningIR: CarouselPlanningIR): number {
  return planningIR.beats.filter((beat) => beat.role === "comparison").length;
}

function problemSolutionCount(planningIR: CarouselPlanningIR): number {
  return planningIR.beats.filter(
    (beat) => beat.sequence?.kind === "problem_solution"
  ).length;
}

function listSequenceCount(planningIR: CarouselPlanningIR): number {
  return planningIR.beats.filter((beat) => beat.sequence?.kind === "list").length;
}

/**
 * Strong comparison means the carousel strategy is contrast, not one slide
 * that happens to mention two things inside a listicle or story.
 */
export function hasStrongComparisonSemantics(
  planningIR: CarouselPlanningIR
): boolean {
  if (listSequenceCount(planningIR) > 0) return false;

  const comparisons = comparisonRoleCount(planningIR);
  if (comparisons >= 2) return true;

  const paired = problemSolutionCount(planningIR);
  const body = bodyBeats(planningIR);
  if (paired >= 2 && body.length > 0 && paired >= Math.ceil(body.length / 2)) {
    return true;
  }

  return false;
}

/**
 * Comparison is an open contrast execution family.
 * Enumerated list promises and Story / Breakdown strategies stay out.
 */
export function canUseComparisonFamily(
  planningIR: CarouselPlanningIR | null | undefined
): boolean {
  if (!planningIR) return false;
  if (planningIR.contract.kind !== "open") return false;
  if (listSequenceCount(planningIR) > 0) return false;
  if (planningIR.strategy.preferredFamily === "breakdown") return false;

  if (planningIR.strategy.preferredFamily === "comparison") return true;

  if (planningIR.strategy.preferredFamily === "story") return false;
  if (planningIR.strategy.angleType === "story") return false;
  return hasStrongComparisonSemantics(planningIR);
}

/**
 * Structured side identity only. Copy text is never parsed for meaning.
 */
export function resolveComparisonSideIdentity(
  sequence: CarouselPlanningSequence | null | undefined
): ComparisonSideIdentity {
  if (sequence?.kind === "problem_solution") {
    return {
      leftKind: "problem",
      rightKind: "solution",
      focus: sequence.side,
      index: sequence.index,
    };
  }
  return {
    leftKind: "option_a",
    rightKind: "option_b",
    focus: null,
    index: null,
  };
}

export type ComparisonSideLabels = {
  left: string | null;
  right: string | null;
};

/**
 * Two-sided Comparison imagery uses structured left/right slots.
 * Slot ids are the only mapping. Copy is never parsed for meaning.
 */
export function textContextForComparisonImageSlot(
  slideVals: Record<string, string | undefined>,
  imageSlotId: string
): string | null {
  const sideKey =
    imageSlotId === "photo_b" || imageSlotId === "right" ? "right" : "left";
  const sideCopy = slideVals[sideKey];
  if (typeof sideCopy === "string" && sideCopy.trim()) {
    return sideCopy.trim();
  }
  return null;
}

/**
 * Chrome labels only when structure already names the sides.
 * Slot copy is the identity when present. Never invent Option A / This side.
 */
export function resolveComparisonSideLabels(args: {
  treatment: ComparisonTreatment;
  sequence?: CarouselPlanningSequence | null;
}): ComparisonSideLabels {
  if (args.sequence?.kind === "problem_solution") {
    return { left: "Problem", right: "Better choice" };
  }
  if (args.treatment === "before_after") {
    return { left: "Before", right: "After" };
  }
  if (args.treatment === "myth_reality") {
    return { left: "The belief", right: "What actually matters" };
  }
  return { left: null, right: null };
}

export type ComparisonTradeoffDensity = "statement" | "pair" | "matrix";

/** Content volume decides density. Never synthesize extra rows. */
export function resolveComparisonTradeoffDensity(
  lineCount: number
): ComparisonTradeoffDensity {
  if (lineCount <= 1) return "statement";
  if (lineCount === 2) return "pair";
  return "matrix";
}

function isImageArchetype(archetype: string): boolean {
  return (
    archetype === "comparison_split" ||
    archetype === "text_visual_split" ||
    archetype === "full_bleed_visual" ||
    archetype === "story_scene"
  );
}

function isLateDecision(position: number, totalSlides: number): boolean {
  if (totalSlides < 5) return position === totalSlides - 1;
  return position >= totalSlides - 2;
}

function comparisonBodyRhythm(position: number, totalSlides: number): number {
  const bodyPosition = Math.max(0, position - 2);
  return totalSlides > 0 ? bodyPosition : 0;
}

/**
 * Convert semantic role + Composition IR + sequence into a Comparison treatment.
 * The treatment describes contrast purpose; renderer variants own geometry.
 */
export function resolveComparisonTreatment(args: {
  archetype: string;
  semanticRole: CarouselPlanningBeatRole | string;
  position: number;
  totalSlides: number;
  sequence?: CarouselPlanningSequence | null;
}): ComparisonTreatment {
  const { archetype, semanticRole, position, totalSlides, sequence } = args;

  if (semanticRole === "cover") return "contrast_cover";
  if (semanticRole === "closing") return "comparison_closing";
  if (archetype === "closing_focus") return "comparison_closing";

  if (sequence?.kind === "problem_solution") {
    if (sequence.side === "problem") {
      return isImageArchetype(archetype) ? "before_after" : "wrong_vs_right";
    }
    if (isLateDecision(position, totalSlides)) return "winner_reveal";
    return "asymmetric_comparison";
  }

  if (archetype === "data_focus") {
    if (
      isLateDecision(position, totalSlides) &&
      (semanticRole === "example" ||
        semanticRole === "summary" ||
        semanticRole === "insight")
    ) {
      return "winner_reveal";
    }
    if (semanticRole === "example") return "asymmetric_comparison";
    return "comparison_score";
  }
  if (archetype === "checklist_stack" || archetype === "diagram_focus") {
    if (isLateDecision(position, totalSlides)) return "winner_reveal";
    if (semanticRole === "example") return "asymmetric_comparison";
    if (semanticRole === "insight" && position % 2 === 0) {
      return "asymmetric_comparison";
    }
    return "tradeoff_matrix";
  }

  if (semanticRole === "problem") return "wrong_vs_right";
  if (semanticRole === "solution") {
    return isLateDecision(position, totalSlides)
      ? "winner_reveal"
      : "asymmetric_comparison";
  }

  if (semanticRole === "insight" || semanticRole === "summary") {
    if (isLateDecision(position, totalSlides)) return "winner_reveal";
    return position % 2 === 0 ? "asymmetric_comparison" : "myth_reality";
  }
  if (semanticRole === "example") {
    return isLateDecision(position, totalSlides)
      ? "winner_reveal"
      : "asymmetric_comparison";
  }

  const rhythm = comparisonBodyRhythm(position, totalSlides);
  const cycle: ComparisonTreatment[] = [
    "side_by_side",
    "asymmetric_comparison",
    isImageArchetype(archetype) ? "before_after" : "tradeoff_matrix",
    "myth_reality",
    "tradeoff_matrix",
    "comparison_score",
  ];
  return cycle[rhythm % cycle.length] ?? "side_by_side";
}

export type ComparisonTreatmentInput = {
  archetype: string;
  semanticRole: CarouselPlanningBeatRole | string;
  position: number;
  totalSlides: number;
  sequence?: CarouselPlanningSequence | null;
};

function rematchRepeatedTreatment(
  treatment: ComparisonTreatment,
  slide: ComparisonTreatmentInput
): ComparisonTreatment {
  if (treatment === "contrast_cover" || treatment === "comparison_closing") {
    return treatment;
  }
  if (treatment === "tradeoff_matrix") {
    if (isLateDecision(slide.position, slide.totalSlides)) return "winner_reveal";
    if (slide.semanticRole === "insight") return "myth_reality";
    return "asymmetric_comparison";
  }
  if (treatment === "myth_reality") {
    return isLateDecision(slide.position, slide.totalSlides)
      ? "winner_reveal"
      : "asymmetric_comparison";
  }
  if (treatment === "comparison_score") {
    return isLateDecision(slide.position, slide.totalSlides)
      ? "winner_reveal"
      : "asymmetric_comparison";
  }
  if (treatment === "winner_reveal") return "asymmetric_comparison";
  if (treatment === "asymmetric_comparison") {
    return isImageArchetype(slide.archetype) ? "before_after" : "side_by_side";
  }
  if (treatment === "side_by_side") return "asymmetric_comparison";
  if (treatment === "wrong_vs_right") return "asymmetric_comparison";
  if (treatment === "before_after") return "asymmetric_comparison";
  return treatment;
}

/**
 * Walk the carousel and rematch adjacent / near-adjacent duplicates.
 * Does not invent new semantics. Geometry changes stay deterministic.
 */
export function resolveComparisonTreatments(
  slides: ComparisonTreatmentInput[]
): ComparisonTreatment[] {
  const resolved = slides.map((slide) => resolveComparisonTreatment(slide));
  for (let index = 1; index < resolved.length; index += 1) {
    const current = resolved[index]!;
    const previous = resolved[index - 1];
    const near = index >= 2 ? resolved[index - 2] : undefined;
    if (current !== previous && current !== near) continue;
    const rematched = rematchRepeatedTreatment(current, slides[index]!);
    if (rematched !== previous && rematched !== near) {
      resolved[index] = rematched;
      continue;
    }
    const second = rematchRepeatedTreatment(rematched, slides[index]!);
    if (second !== previous && second !== near) {
      resolved[index] = second;
    }
  }
  return resolved;
}

function hasImage(imageUrl?: string | null): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}

/** Renderer-only degradation. Composition IR and stored treatment remain intact. */
export function resolveComparisonRenderTreatment(args: {
  treatment: ComparisonTreatment;
  semanticRole?: string | null;
  imageUrl?: string | null;
}): ComparisonTreatment {
  if (args.treatment !== "before_after") return args.treatment;
  if (hasImage(args.imageUrl)) return args.treatment;
  if (args.semanticRole === "problem") return "wrong_vs_right";
  if (args.semanticRole === "insight" || args.semanticRole === "summary") {
    return "myth_reality";
  }
  return "asymmetric_comparison";
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
  body: "Comparison detail",
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
  support: { min: 8, max: 120 },
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

function extraComparisonSlots(
  sequence: CarouselPlanningSequence | null
): CarouselTextSlot[] {
  const identity = resolveComparisonSideIdentity(sequence);
  const leftLabel =
    identity.leftKind === "problem" ? "Problem side" : "Option A";
  const rightLabel =
    identity.rightKind === "solution" ? "Better-choice side" : "Option B";
  return [
    {
      id: "left",
      role: "headline",
      label: leftLabel,
      budget: { min: 4, max: 42 },
      defaultText: "",
    },
    {
      id: "right",
      role: "headline",
      label: rightLabel,
      budget: { min: 4, max: 42 },
      defaultText: "",
    },
  ];
}

function wantsSideSlots(treatment: ComparisonTreatment): boolean {
  return (
    treatment === "side_by_side" ||
    treatment === "asymmetric_comparison" ||
    treatment === "wrong_vs_right" ||
    treatment === "before_after" ||
    treatment === "tradeoff_matrix" ||
    treatment === "comparison_score" ||
    treatment === "myth_reality" ||
    treatment === "winner_reveal" ||
    treatment === "contrast_cover"
  );
}

function slotsForComparisonSlide(args: {
  compositionSlide: CarouselCompositionSlide;
  treatment: ComparisonTreatment;
  sequence: CarouselPlanningSequence | null;
}): CarouselTextSlot[] {
  const slots = args.compositionSlide.textRegions
    .filter((region) => region.role !== "sequence")
    .map((region) => slotForRegion(region.role));

  if (!slots.some((slot) => slot.id === "headline")) {
    slots.unshift(slotForRegion("headline"));
  }

  if (wantsSideSlots(args.treatment)) {
    slots.push(...extraComparisonSlots(args.sequence));
  }

  if (
    (args.treatment === "tradeoff_matrix" ||
      args.treatment === "comparison_score") &&
    !slots.some((slot) => slot.id === "support")
  ) {
    const support = slotForRegion("support");
    support.label =
      args.treatment === "tradeoff_matrix"
        ? "Trade-off dimensions"
        : "Relative strength";
    slots.push(support);
  }

  const ids = new Set<string>();
  return slots.filter((slot) => {
    if (ids.has(slot.id)) return false;
    ids.add(slot.id);
    return true;
  });
}

function wantsPhoto(
  compositionSlide: CarouselCompositionSlide,
  treatment: ComparisonTreatment
): boolean {
  if (
    compositionSlide.visualRegions.some(
      (region) =>
        region.kind === "photo" ||
        region.kind === "illustration" ||
        region.kind === "icon_scene" ||
        region.kind === "comparison"
    )
  ) {
    return true;
  }
  return (
    treatment === "before_after" ||
    treatment === "contrast_cover" ||
    treatment === "side_by_side"
  );
}

function wantsSecondPhoto(treatment: ComparisonTreatment): boolean {
  return (
    treatment === "before_after" ||
    treatment === "side_by_side" ||
    treatment === "contrast_cover"
  );
}

function photoImageSlots(objective: string, second: boolean): CarouselImageSlot[] {
  const primary: CarouselImageSlot = {
    id: "photo",
    label: "Comparison visual A",
    searchQueryHint: objective,
    defaultImageUrl: CAROUSEL_STOCK_PREVIEW.cafeCreator,
  };
  if (!second) return [primary];
  return [
    primary,
    {
      id: "photo_b",
      label: "Comparison visual B",
      searchQueryHint: objective,
      defaultImageUrl: CAROUSEL_STOCK_PREVIEW.cafeCreator,
    },
  ];
}

function slideRoleFromBeat(role: CarouselPlanningBeatRole): CarouselSlideRole {
  if (role === "cover") return "hook";
  if (role === "closing") return "cta";
  if (role === "problem") return "problem";
  if (role === "example") return "example";
  return "list_item";
}

function fallbackLayoutId(treatment: ComparisonTreatment): CarouselLayoutId {
  switch (treatment) {
    case "contrast_cover":
      return "hook_photo_top";
    case "before_after":
    case "side_by_side":
      return "photo_caption_bubble";
    case "comparison_closing":
      return "cta_bold_center";
    default:
      return "hook_bold_center";
  }
}

/**
 * Build renderable Comparison slides from the existing Planning + Composition IRs.
 */
export function buildComparisonFamilySlides(args: {
  template: CarouselTemplate;
  planningIR: CarouselPlanningIR;
  compositionIR: CarouselCompositionIR;
}): CarouselSlideSpec[] {
  const count = Math.min(
    args.planningIR.beats.length,
    args.compositionIR.slides.length
  );
  const slides: CarouselSlideSpec[] = [];
  const treatments = resolveComparisonTreatments(
    Array.from({ length: count }, (_, index) => {
      const beat = args.planningIR.beats[index]!;
      const compositionSlide = args.compositionIR.slides[index]!;
      return {
        archetype: compositionSlide.archetype,
        semanticRole: beat.role,
        position: beat.position,
        totalSlides: count,
        sequence: beat.sequence,
      };
    })
  );

  for (let index = 0; index < count; index += 1) {
    const beat = args.planningIR.beats[index]!;
    const compositionSlide = args.compositionIR.slides[index]!;
    const treatment = treatments[index]!;
    const comparisonComposition: ComparisonComposition = {
      family: COMPARISON_FAMILY,
      archetype: compositionSlide.archetype,
      treatment,
      semanticRole: beat.role,
      listItemIndex: null,
      sequence: beat.sequence,
      position: beat.position,
      totalSlides: count,
    };

    const slide = {
      id: `slide_${String(index + 1).padStart(2, "0")}`,
      role: slideRoleFromBeat(beat.role),
      viralWhy: beat.objective,
      layoutId: fallbackLayoutId(treatment),
      slots: slotsForComparisonSlide({
        compositionSlide,
        treatment,
        sequence: beat.sequence,
      }),
      ...(wantsPhoto(compositionSlide, treatment)
        ? {
            imageSlots: photoImageSlots(
              beat.objective,
              wantsSecondPhoto(treatment)
            ),
          }
        : {}),
      composition: comparisonComposition,
    };

    slides.push(slide as unknown as CarouselSlideSpec);
  }

  return slides;
}
