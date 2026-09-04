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

export const FRAMEWORK_PART_SOURCES = [
  "framework_steps",
  "ordered_parts",
  "none",
] as const;
export type FrameworkPartSource = (typeof FRAMEWORK_PART_SOURCES)[number];

export type FrameworkPartStructure = {
  source: FrameworkPartSource;
  partCount: number;
  indexByBeatId: Readonly<Record<string, number>>;
};

export type FrameworkComposition = {
  family: typeof FRAMEWORK_FAMILY;
  archetype: string;
  treatment: FrameworkTreatment;
  semanticRole: CarouselPlanningBeatRole;
  listItemIndex: null;
  sequence: CarouselPlanningSequence | null;
  position: number;
  totalSlides: number;
  frameworkPartCount: number;
  frameworkPartIndex: number | null;
  frameworkPartSource: FrameworkPartSource;
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
  return resolveFrameworkPartStructure(planningIR).indexByBeatId[beat.id] ?? null;
}

function orderedListBeats(planningIR: CarouselPlanningIR): CarouselPlanningBeat[] {
  return planningIR.beats.filter((beat) => {
    const sequence = beat.sequence;
    return (
      sequence?.kind === "list" &&
      Number.isInteger(sequence.index) &&
      sequence.index >= 1
    );
  });
}

/**
 * Grounded Framework parts from Planning IR only.
 * Copy never participates. Slide count never participates.
 *
 * CASE A: 2+ framework_step beats → those beats are the parts.
 * CASE B: open preferred Framework with 2+ list sequences → those
 * ordered beats are the parts. List proves order, not a timeline.
 * CASE C: otherwise no multipart structure.
 */
export function resolveFrameworkPartStructure(
  planningIR: CarouselPlanningIR
): FrameworkPartStructure {
  const steps = planningIR.beats.filter(
    (beat) => beat.role === "framework_step"
  );
  if (steps.length >= 2) {
    const indexByBeatId: Record<string, number> = {};
    steps.forEach((beat, index) => {
      indexByBeatId[beat.id] = index + 1;
    });
    return {
      source: "framework_steps",
      partCount: steps.length,
      indexByBeatId,
    };
  }

  const listed = orderedListBeats(planningIR);
  if (
    planningIR.contract.kind === "open" &&
    planningIR.strategy.preferredFamily === "framework" &&
    listed.length >= 2
  ) {
    const indexByBeatId: Record<string, number> = {};
    const unique = [...new Set(listed.map((beat) => beat.sequence!.index))].sort(
      (a, b) => a - b
    );
    listed.forEach((beat) => {
      const rank = unique.indexOf(beat.sequence!.index);
      indexByBeatId[beat.id] = rank >= 0 ? rank + 1 : beat.sequence!.index;
    });
    return {
      source: "ordered_parts",
      partCount: unique.length,
      indexByBeatId,
    };
  }

  return {
    source: "none",
    partCount: 0,
    indexByBeatId: {},
  };
}

export function frameworkPartIndex(
  structure: FrameworkPartStructure,
  beat: CarouselPlanningBeat
): number | null {
  return structure.indexByBeatId[beat.id] ?? null;
}

/** Text formatting only. Never used to decide part count. */
export function splitFrameworkCopyLines(
  text: string,
  exclude?: string
): string[] {
  const skip = exclude?.trim() || "";
  return text
    .split(/\n|•|;/)
    .map((line) => line.replace(/^\s*[-]\s*/, "").trim())
    .filter((line) => line && line !== skip);
}

/**
 * Labels for already-grounded parts. Copy cannot add or remove parts.
 * A missing line stays null and the slot still exists.
 */
export function labelFrameworkParts(
  partCount: number,
  text: string,
  exclude?: string
): Array<string | null> {
  const count = partCount >= 2 ? partCount : 0;
  const lines = splitFrameworkCopyLines(text, exclude);
  return Array.from({ length: count }, (_, index) => lines[index] ?? null);
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
  frameworkStepCount?: number;
  frameworkStepIndex?: number | null;
  frameworkPartCount?: number;
  frameworkPartIndex?: number | null;
  frameworkPartSource?: FrameworkPartSource;
  comparisonRoleCount: number;
  hasExample: boolean;
}): FrameworkTreatment {
  const {
    archetype,
    semanticRole,
    position,
    totalSlides,
    sequence,
    frameworkPartCount = args.frameworkStepCount ?? 0,
    frameworkPartIndex = args.frameworkStepIndex ?? null,
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

  if (semanticRole === "insight") return "principle_focus";

  if (semanticRole === "context") {
    return "model_overview";
  }

  if (semanticRole === "transition") {
    return archetype === "timeline_flow" ? "step_system" : "principle_focus";
  }

  const isGroundedPart = frameworkPartIndex != null && frameworkPartCount >= 2;

  if (semanticRole === "framework_step" || isGroundedPart) {
    if (archetype === "timeline_flow") return "step_system";
    if (semanticRole === "framework_step" && !isGroundedPart) {
      if (frameworkPartCount >= 2) return "model_overview";
      return archetype === "diagram_focus" ? "model_overview" : "principle_focus";
    }
    return "pillar_system";
  }

  if (archetype === "timeline_flow") return "step_system";
  if (archetype === "framework_grid") return "pillar_system";
  if (archetype === "diagram_focus") return "model_overview";
  if (archetype === "closing_focus") return "framework_closing";

  if (hasExample && position >= totalSlides - 2) return "example_application";
  if (frameworkPartCount >= 2 && position === 2) return "model_overview";
  return "principle_focus";
}

export type FrameworkTreatmentInput = {
  archetype: string;
  semanticRole: CarouselPlanningBeatRole | string;
  position: number;
  totalSlides: number;
  sequence?: CarouselPlanningSequence | null;
  frameworkStepCount?: number;
  frameworkStepIndex?: number | null;
  frameworkPartCount?: number;
  frameworkPartIndex?: number | null;
  frameworkPartSource?: FrameworkPartSource;
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
    const partIndex = slide.frameworkPartIndex ?? slide.frameworkStepIndex ?? null;
    if (partIndex != null) return "pillar_system";
    return "principle_focus";
  }
  if (treatment === "step_system") return "pillar_system";
  if (treatment === "model_overview") return "principle_focus";
  if (treatment === "cycle_model") return "principle_focus";
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
    const partIndex =
      slides[index]?.frameworkPartIndex ?? slides[index]?.frameworkStepIndex ?? null;
    if (partIndex != null && current === "pillar_system") {
      continue;
    }
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

/**
 * Renderer-side treatment guard. Framework stays type-led when a requested
 * image never arrives. Treatments themselves do not depend on photography.
 */
export function resolveFrameworkRenderTreatment(args: {
  treatment: FrameworkTreatment;
  imageUrl?: string | null;
}): FrameworkTreatment {
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
  const partStructure = resolveFrameworkPartStructure(args.planningIR);
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
        frameworkPartCount: partStructure.partCount,
        frameworkPartIndex: frameworkPartIndex(partStructure, beat),
        frameworkPartSource: partStructure.source,
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
      frameworkPartCount: partStructure.partCount,
      frameworkPartIndex: frameworkPartIndex(partStructure, beat),
      frameworkPartSource: partStructure.source,
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
