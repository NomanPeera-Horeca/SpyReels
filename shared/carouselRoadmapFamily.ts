/**
 * How-To / Roadmap execution family.
 * Consumes Planning IR + Composition IR. Does not invent steps.
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

export const ROADMAP_FAMILY = "roadmap" as const;

export const ROADMAP_TREATMENTS = [
  "howto_cover",
  "route_overview",
  "step_focus",
  "action_checklist",
  "obstacle_fix",
  "worked_example",
  "progress_checkpoint",
  "howto_summary",
  "howto_closing",
] as const;
export type RoadmapTreatment = (typeof ROADMAP_TREATMENTS)[number];

export const ROADMAP_STEP_SOURCES = ["ordered_steps", "none"] as const;
export type RoadmapStepSource = (typeof ROADMAP_STEP_SOURCES)[number];

export type RoadmapStepStructure = {
  source: RoadmapStepSource;
  stepCount: number;
  indexByBeatId: Readonly<Record<string, number>>;
};

export type RoadmapComposition = {
  family: typeof ROADMAP_FAMILY;
  archetype: string;
  treatment: RoadmapTreatment;
  semanticRole: CarouselPlanningBeatRole;
  listItemIndex: null;
  sequence: CarouselPlanningSequence | null;
  position: number;
  totalSlides: number;
  roadmapStepCount: number;
  roadmapStepIndex: number | null;
  roadmapStepSource: RoadmapStepSource;
};

type SlideWithLooseComposition = {
  composition?: { family?: string } | null;
};

export function isRoadmapFamilySlide(
  slide: SlideWithLooseComposition
): boolean {
  return slide.composition?.family === ROADMAP_FAMILY;
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
 * Grounded Roadmap steps from Planning IR only.
 * Copy never participates. Slide count never participates.
 *
 * CASE A: preferredFamily is roadmap AND 2+ UNIQUE ordered list indexes exist.
 * List proves order. Duplicate indexes do not count as a path.
 * Because the family is already roadmap, those grounded ordered items may
 * be visualized as execution steps.
 *
 * CASE B: otherwise no step structure. Do not infer steps from
 * totalSlides, copy, headline numbering, paragraphs, variants, labels,
 * problem_solution pairs, or framework_step beats.
 */
export function resolveRoadmapStepStructure(
  planningIR: CarouselPlanningIR
): RoadmapStepStructure {
  const listed = orderedListBeats(planningIR);
  const unique = [...new Set(listed.map((beat) => beat.sequence!.index))].sort(
    (a, b) => a - b
  );
  if (
    planningIR.strategy.preferredFamily === "roadmap" &&
    unique.length >= 2
  ) {
    const indexByBeatId: Record<string, number> = {};
    listed.forEach((beat) => {
      const rank = unique.indexOf(beat.sequence!.index);
      indexByBeatId[beat.id] = rank >= 0 ? rank + 1 : beat.sequence!.index;
    });
    return {
      source: "ordered_steps",
      stepCount: unique.length,
      indexByBeatId,
    };
  }

  return {
    source: "none",
    stepCount: 0,
    indexByBeatId: {},
  };
}

export function roadmapStepIndex(
  structure: RoadmapStepStructure,
  beat: CarouselPlanningBeat
): number | null {
  return structure.indexByBeatId[beat.id] ?? null;
}

/** Text formatting only. Never used to decide step count. */
export function splitRoadmapCopyLines(
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
 * Labels for already-grounded steps. Copy cannot add or remove steps.
 * A missing line stays null and the slot still exists.
 */
export function labelRoadmapSteps(
  stepCount: number,
  text: string,
  exclude?: string
): Array<string | null> {
  const count = stepCount >= 2 ? stepCount : 0;
  const lines = splitRoadmapCopyLines(text, exclude);
  return Array.from({ length: count }, (_, index) => lines[index] ?? null);
}

/**
 * Roadmap is an explicit How-To / execution-path family.
 *
 * preferredFamily === "roadmap" is the only positive gate.
 * Comparison, Story, Framework, and Breakdown preferences stay out.
 * angleType how_to alone never claims this family.
 */
export function canUseRoadmapFamily(
  planningIR: CarouselPlanningIR | null | undefined
): boolean {
  if (!planningIR) return false;
  if (planningIR.strategy.preferredFamily === "comparison") return false;
  if (planningIR.strategy.preferredFamily === "story") return false;
  if (planningIR.strategy.angleType === "story") return false;
  if (planningIR.strategy.preferredFamily === "framework") return false;
  if (planningIR.strategy.preferredFamily === "breakdown") return false;
  return planningIR.strategy.preferredFamily === "roadmap";
}

/**
 * Convert semantic role + Composition IR + grounded step structure into a
 * Roadmap treatment. Treatments describe execution purpose, not template ids.
 */
export function resolveRoadmapTreatment(args: {
  archetype: string;
  semanticRole: CarouselPlanningBeatRole | string;
  position: number;
  totalSlides: number;
  sequence?: CarouselPlanningSequence | null;
  roadmapStepCount?: number;
  roadmapStepIndex?: number | null;
  roadmapStepSource?: RoadmapStepSource;
}): RoadmapTreatment {
  const {
    archetype,
    semanticRole,
    roadmapStepCount = 0,
    roadmapStepIndex: stepIndex = null,
  } = args;

  if (semanticRole === "cover") return "howto_cover";
  if (semanticRole === "closing") return "howto_closing";
  if (semanticRole === "summary") return "howto_summary";
  if (semanticRole === "example") return "worked_example";
  if (semanticRole === "problem") return "obstacle_fix";

  const isGroundedStep = stepIndex != null && roadmapStepCount >= 2;

  if (semanticRole === "list_item" || isGroundedStep) {
    if (archetype === "checklist_stack") return "action_checklist";
    return "step_focus";
  }

  if (semanticRole === "context") return "route_overview";

  if (archetype === "checklist_stack") return "action_checklist";
  if (archetype === "closing_focus") return "howto_closing";
  if (semanticRole === "transition") return "progress_checkpoint";
  if (semanticRole === "insight") {
    return archetype === "checklist_stack"
      ? "action_checklist"
      : "progress_checkpoint";
  }

  if (archetype === "timeline_flow" || archetype === "diagram_focus") {
    return "route_overview";
  }

  return "route_overview";
}

/**
 * Static UI eyebrow for a treatment. Variant geometry may be reused;
 * the visible label always comes from treatment semantics, never copy.
 */
export function roadmapTreatmentEyebrow(
  treatment: RoadmapTreatment
): string {
  switch (treatment) {
    case "howto_cover":
      return "How to";
    case "route_overview":
      return "Route";
    case "step_focus":
      return "Step";
    case "action_checklist":
      return "Do this";
    case "obstacle_fix":
      return "Fix";
    case "worked_example":
      return "In practice";
    case "progress_checkpoint":
      return "Checkpoint";
    case "howto_summary":
      return "Recap";
    case "howto_closing":
      return "Next";
  }
}

export type RoadmapTreatmentInput = {
  archetype: string;
  semanticRole: CarouselPlanningBeatRole | string;
  position: number;
  totalSlides: number;
  sequence?: CarouselPlanningSequence | null;
  roadmapStepCount?: number;
  roadmapStepIndex?: number | null;
  roadmapStepSource?: RoadmapStepSource;
};

/**
 * Deterministic treatment per slide. Kept as a batch API.
 * Does not rematch for visual rhythm. Adjacent duplicates stay valid
 * when semantic role + archetype + grounded steps resolve the same way.
 */
export function resolveRoadmapTreatments(
  slides: RoadmapTreatmentInput[]
): RoadmapTreatment[] {
  return slides.map((slide) => resolveRoadmapTreatment(slide));
}

/** Renderer-side treatment guard. Treatments do not depend on photography. */
export function resolveRoadmapRenderTreatment(args: {
  treatment: RoadmapTreatment;
  imageUrl?: string | null;
}): RoadmapTreatment {
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
  body: "How-to detail",
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

function slotsForRoadmapSlide(args: {
  compositionSlide: CarouselCompositionSlide;
  treatment: RoadmapTreatment;
}): CarouselTextSlot[] {
  const slots = args.compositionSlide.textRegions
    .filter((region) => region.role !== "sequence")
    .map((region) => slotForRegion(region.role));

  if (!slots.some((slot) => slot.id === "headline")) {
    slots.unshift(slotForRegion("headline"));
  }

  if (
    (args.treatment === "route_overview" ||
      args.treatment === "step_focus" ||
      args.treatment === "action_checklist" ||
      args.treatment === "worked_example") &&
    !slots.some((slot) => slot.id === "support")
  ) {
    slots.push(slotForRegion("support"));
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
    label: "How-to visual",
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

function fallbackLayoutId(treatment: RoadmapTreatment): CarouselLayoutId {
  switch (treatment) {
    case "howto_cover":
      return "hook_bold_center";
    case "worked_example":
      return "photo_caption_bubble";
    case "howto_closing":
      return "cta_bold_center";
    default:
      return "hook_bold_center";
  }
}

/**
 * Build renderable Roadmap slides from the existing Planning + Composition IRs.
 * No templates are chosen here beyond a legacy fallback layoutId required by
 * CarouselSlideSpec; the composition-aware registry owns the real renderer.
 */
export function buildRoadmapFamilySlides(args: {
  template: CarouselTemplate;
  planningIR: CarouselPlanningIR;
  compositionIR: CarouselCompositionIR;
}): CarouselSlideSpec[] {
  const count = Math.min(
    args.planningIR.beats.length,
    args.compositionIR.slides.length
  );
  const stepStructure = resolveRoadmapStepStructure(args.planningIR);
  const slides: CarouselSlideSpec[] = [];
  const treatments = resolveRoadmapTreatments(
    Array.from({ length: count }, (_, index) => {
      const beat = args.planningIR.beats[index]!;
      const compositionSlide = args.compositionIR.slides[index]!;
      return {
        archetype: compositionSlide.archetype,
        semanticRole: beat.role,
        position: beat.position,
        totalSlides: count,
        sequence: beat.sequence,
        roadmapStepCount: stepStructure.stepCount,
        roadmapStepIndex: roadmapStepIndex(stepStructure, beat),
        roadmapStepSource: stepStructure.source,
      };
    })
  );

  for (let index = 0; index < count; index += 1) {
    const beat = args.planningIR.beats[index]!;
    const compositionSlide = args.compositionIR.slides[index]!;
    const treatment = treatments[index]!;
    const roadmapComposition: RoadmapComposition = {
      family: ROADMAP_FAMILY,
      archetype: compositionSlide.archetype,
      treatment,
      semanticRole: beat.role,
      listItemIndex: null,
      sequence: beat.sequence,
      position: beat.position,
      totalSlides: count,
      roadmapStepCount: stepStructure.stepCount,
      roadmapStepIndex: roadmapStepIndex(stepStructure, beat),
      roadmapStepSource: stepStructure.source,
    };

    const slide = {
      id: `slide_${String(index + 1).padStart(2, "0")}`,
      role: slideRoleFromBeat(beat.role),
      viralWhy: beat.objective,
      layoutId: fallbackLayoutId(treatment),
      slots: slotsForRoadmapSlide({
        compositionSlide,
        treatment,
      }),
      ...(wantsPhoto(compositionSlide)
        ? { imageSlots: [photoImageSlot(beat.objective)] }
        : {}),
      composition: roadmapComposition,
    };

    slides.push(slide as unknown as CarouselSlideSpec);
  }

  return slides;
}
