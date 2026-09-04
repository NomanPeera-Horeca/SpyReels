/**
 * Framework execution family.
 * Consumes Planning IR + Composition IR. Does not invent relationships.
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

export const FRAMEWORK_FAMILY = "framework" as const;

export const FRAMEWORK_TREATMENTS = [
  "framework_cover",
  "model_overview",
  "pillar_system",
  "step_system",
  "layered_model",
  "cycle_model",
  "decision_tree",
  "matrix_framework",
  "principle_focus",
  "example_application",
  "framework_summary",
  "framework_closing",
] as const;
export type FrameworkTreatment = (typeof FRAMEWORK_TREATMENTS)[number];

export type FrameworkComposition = {
  family: typeof FRAMEWORK_FAMILY;
  archetype: string;
  treatment: FrameworkTreatment;
  semanticRole: CarouselPlanningBeatRole;
  listItemIndex: null;
  sequence: CarouselPlanningSequence | null;
  position: number;
  totalSlides: number;
  frameworkStepIndex: number | null;
  frameworkStepCount: number;
};

type SlideWithLooseComposition = {
  composition?: { family?: string } | null;
};

export function isFrameworkFamilySlide(
  slide: SlideWithLooseComposition
): boolean {
  return slide.composition?.family === FRAMEWORK_FAMILY;
}

export function frameworkStepCount(planningIR: CarouselPlanningIR): number {
  return planningIR.beats.filter((beat) => beat.role === "framework_step")
    .length;
}

export function frameworkStepIndex(
  planningIR: CarouselPlanningIR,
  beat: CarouselPlanningBeat
): number | null {
  if (beat.role !== "framework_step") return null;
  const steps = planningIR.beats.filter(
    (candidate) => candidate.role === "framework_step"
  );
  const index = steps.findIndex((candidate) => candidate.id === beat.id);
  return index >= 0 ? index + 1 : null;
}

function comparisonRoleCount(planningIR: CarouselPlanningIR): number {
  return planningIR.beats.filter((beat) => beat.role === "comparison").length;
}

function hasExampleBeat(planningIR: CarouselPlanningIR): boolean {
  return planningIR.beats.some((beat) => beat.role === "example");
}

/**
 * Strong Framework means the plan is a model with multiple working parts,
 * not a listicle that happens to use the word framework.
 */
export function hasStrongFrameworkSemantics(
  planningIR: CarouselPlanningIR
): boolean {
  return frameworkStepCount(planningIR) >= 2;
}

/**
 * Framework is an open model / system / decision-framework family.
 *
 * Open + preferredFamily framework always qualifies.
 * Otherwise only a structural fallback of 2+ framework_step beats qualifies.
 *
 * Enumerated contracts stay Breakdown.
 * Story, Comparison, and explicit Breakdown preferences stay out.
 * Internal list sequences alone are not enough.
 */
export function canUseFrameworkFamily(
  planningIR: CarouselPlanningIR | null | undefined
): boolean {
  if (!planningIR) return false;
  if (planningIR.contract.kind !== "open") return false;
  if (planningIR.strategy.preferredFamily === "comparison") return false;
  if (planningIR.strategy.preferredFamily === "story") return false;
  if (planningIR.strategy.angleType === "story") return false;
  if (planningIR.strategy.preferredFamily === "breakdown") return false;
  if (planningIR.strategy.preferredFamily === "framework") return true;
  return hasStrongFrameworkSemantics(planningIR);
}

function isDecisionStructure(args: {
  semanticRole: string;
  sequence?: CarouselPlanningSequence | null;
  comparisonRoleCount: number;
}): boolean {
  if (args.semanticRole === "comparison") return true;
  if (args.sequence?.kind === "problem_solution") return true;
  return args.comparisonRoleCount >= 2 && args.semanticRole === "insight";
}

function isOrderedStep(sequence?: CarouselPlanningSequence | null): boolean {
  return sequence?.kind === "list";
}

/**
 * Convert semantic role + Composition IR + plan structure into a Framework
 * treatment. Treatments describe model purpose, not template ids.
 */
export function resolveFrameworkTreatment(args: {
  archetype: string;
  semanticRole: CarouselPlanningBeatRole | string;
  position: number;
  totalSlides: number;
  sequence?: CarouselPlanningSequence | null;
  frameworkStepCount: number;
  frameworkStepIndex: number | null;
  comparisonRoleCount: number;
  hasExample: boolean;
}): FrameworkTreatment {
  const {
    archetype,
    semanticRole,
    position,
    totalSlides,
    sequence,
    frameworkStepCount: stepCount,
    frameworkStepIndex: stepIndex,
    comparisonRoleCount: comparisons,
    hasExample,
  } = args;

  if (semanticRole === "cover") return "framework_cover";
  if (semanticRole === "closing") return "framework_closing";
  if (semanticRole === "summary") return "framework_summary";
  if (semanticRole === "example") return "example_application";

  if (archetype === "comparison_split" && comparisons >= 1) {
    return "matrix_framework";
  }

  if (isDecisionStructure({ semanticRole, sequence, comparisonRoleCount: comparisons })) {
    return "decision_tree";
  }

  if (semanticRole === "insight") {
    if (archetype === "diagram_focus" && stepCount >= 3) return "cycle_model";
    return "principle_focus";
  }

  if (semanticRole === "context") {
    if (archetype === "diagram_focus" && stepCount >= 3) return "layered_model";
    return "model_overview";
  }

  if (semanticRole === "transition") return "step_system";

  if (semanticRole === "framework_step") {
    if (archetype === "timeline_flow" || isOrderedStep(sequence)) {
      return "step_system";
    }
    if (archetype === "diagram_focus") {
      return stepIndex === 1 ? "model_overview" : "cycle_model";
    }
    if (archetype === "framework_grid") {
      return isOrderedStep(sequence) ? "step_system" : "pillar_system";
    }
    if (stepIndex === 1 && position <= 3) return "model_overview";
    return "pillar_system";
  }

  if (archetype === "timeline_flow") return "step_system";
  if (archetype === "framework_grid") return "pillar_system";
  if (archetype === "diagram_focus") return "model_overview";
  if (archetype === "closing_focus") return "framework_closing";

  if (hasExample && position >= totalSlides - 2) return "example_application";
  if (stepCount >= 2 && position === 2) return "model_overview";
  return "principle_focus";
}

export type FrameworkTreatmentInput = {
  archetype: string;
  semanticRole: CarouselPlanningBeatRole | string;
  position: number;
  totalSlides: number;
  sequence?: CarouselPlanningSequence | null;
  frameworkStepCount: number;
  frameworkStepIndex: number | null;
  comparisonRoleCount: number;
  hasExample: boolean;
};

function rematchRepeatedTreatment(
  treatment: FrameworkTreatment,
  slide: FrameworkTreatmentInput
): FrameworkTreatment {
  if (treatment === "framework_cover" || treatment === "framework_closing") {
    return treatment;
  }
  if (treatment === "pillar_system") {
    return isOrderedStep(slide.sequence) ? "step_system" : "layered_model";
  }
  if (treatment === "step_system") return "pillar_system";
  if (treatment === "model_overview") {
    return slide.archetype === "diagram_focus" ? "cycle_model" : "pillar_system";
  }
  if (treatment === "cycle_model") return "layered_model";
  if (treatment === "layered_model") return "principle_focus";
  if (treatment === "principle_focus") {
    return slide.semanticRole === "example"
      ? "example_application"
      : "model_overview";
  }
  if (treatment === "decision_tree") return "matrix_framework";
  if (treatment === "matrix_framework") return "decision_tree";
  if (treatment === "example_application") return "principle_focus";
  if (treatment === "framework_summary") return "principle_focus";
  return treatment;
}

/**
 * Walk the carousel and rematch adjacent / near-adjacent duplicates.
 * Does not invent new semantics. Geometry changes stay deterministic.
 */
export function resolveFrameworkTreatments(
  slides: FrameworkTreatmentInput[]
): FrameworkTreatment[] {
  const resolved = slides.map((slide) => resolveFrameworkTreatment(slide));
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

/**
 * Renderer-side treatment guard. Framework stays type-led when a requested
 * image never arrives. Treatments themselves do not depend on photography.
 */
export function resolveFrameworkRenderTreatment(args: {
  treatment: FrameworkTreatment;
  imageUrl?: string | null;
}): FrameworkTreatment {
  void hasImage(args.imageUrl);
  return args.treatment;
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
  body: "Framework detail",
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

function wantsDecisionSlots(treatment: FrameworkTreatment): boolean {
  return treatment === "decision_tree" || treatment === "matrix_framework";
}

function extraDecisionSlots(): CarouselTextSlot[] {
  return [
    {
      id: "left",
      role: "headline",
      label: "Decision path A",
      budget: { min: 4, max: 42 },
      defaultText: "",
    },
    {
      id: "right",
      role: "headline",
      label: "Decision path B",
      budget: { min: 4, max: 42 },
      defaultText: "",
    },
  ];
}

function slotsForFrameworkSlide(args: {
  compositionSlide: CarouselCompositionSlide;
  treatment: FrameworkTreatment;
}): CarouselTextSlot[] {
  const slots = args.compositionSlide.textRegions
    .filter((region) => region.role !== "sequence")
    .map((region) => slotForRegion(region.role));

  if (!slots.some((slot) => slot.id === "headline")) {
    slots.unshift(slotForRegion("headline"));
  }

  if (
    (args.treatment === "model_overview" ||
      args.treatment === "pillar_system" ||
      args.treatment === "step_system" ||
      args.treatment === "example_application") &&
    !slots.some((slot) => slot.id === "support")
  ) {
    slots.push(slotForRegion("support"));
  }

  if (wantsDecisionSlots(args.treatment)) {
    slots.push(...extraDecisionSlots());
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
    label: "Framework visual",
    searchQueryHint: objective,
    defaultImageUrl: CAROUSEL_STOCK_PREVIEW.cafeCreator,
  };
}

function slideRoleFromBeat(role: CarouselPlanningBeatRole): CarouselSlideRole {
  if (role === "cover") return "hook";
  if (role === "closing") return "cta";
  if (role === "problem") return "problem";
  if (role === "example") return "example";
  return "list_item";
}

function fallbackLayoutId(treatment: FrameworkTreatment): CarouselLayoutId {
  switch (treatment) {
    case "framework_cover":
      return "hook_bold_center";
    case "example_application":
      return "photo_caption_bubble";
    case "framework_closing":
      return "cta_bold_center";
    default:
      return "hook_bold_center";
  }
}

/**
 * Build renderable Framework slides from the existing Planning + Composition IRs.
 * No templates are chosen here beyond a legacy fallback layoutId required by
 * CarouselSlideSpec; the composition-aware registry owns the real renderer.
 */
export function buildFrameworkFamilySlides(args: {
  template: CarouselTemplate;
  planningIR: CarouselPlanningIR;
  compositionIR: CarouselCompositionIR;
}): CarouselSlideSpec[] {
  const count = Math.min(
    args.planningIR.beats.length,
    args.compositionIR.slides.length
  );
  const stepCount = frameworkStepCount(args.planningIR);
  const comparisons = comparisonRoleCount(args.planningIR);
  const hasExample = hasExampleBeat(args.planningIR);
  const slides: CarouselSlideSpec[] = [];
  const treatments = resolveFrameworkTreatments(
    Array.from({ length: count }, (_, index) => {
      const beat = args.planningIR.beats[index]!;
      const compositionSlide = args.compositionIR.slides[index]!;
      return {
        archetype: compositionSlide.archetype,
        semanticRole: beat.role,
        position: beat.position,
        totalSlides: count,
        sequence: beat.sequence,
        frameworkStepCount: stepCount,
        frameworkStepIndex: frameworkStepIndex(args.planningIR, beat),
        comparisonRoleCount: comparisons,
        hasExample,
      };
    })
  );

  for (let index = 0; index < count; index += 1) {
    const beat = args.planningIR.beats[index]!;
    const compositionSlide = args.compositionIR.slides[index]!;
    const treatment = treatments[index]!;
    const frameworkComposition: FrameworkComposition = {
      family: FRAMEWORK_FAMILY,
      archetype: compositionSlide.archetype,
      treatment,
      semanticRole: beat.role,
      listItemIndex: null,
      sequence: beat.sequence,
      position: beat.position,
      totalSlides: count,
      frameworkStepIndex: frameworkStepIndex(args.planningIR, beat),
      frameworkStepCount: stepCount,
    };

    const slide = {
      id: `slide_${String(index + 1).padStart(2, "0")}`,
      role: slideRoleFromBeat(beat.role),
      viralWhy: beat.objective,
      layoutId: fallbackLayoutId(treatment),
      slots: slotsForFrameworkSlide({
        compositionSlide,
        treatment,
      }),
      ...(wantsPhoto(compositionSlide)
        ? { imageSlots: [photoImageSlot(beat.objective)] }
        : {}),
      composition: frameworkComposition,
    };

    slides.push(slide as unknown as CarouselSlideSpec);
  }

  return slides;
}
