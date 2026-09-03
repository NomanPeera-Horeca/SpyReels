/**
 * Breakdown/Listicle layout family.
 * Consumes Composition IR. Visual Director chooses the archetype.
 * This module picks a treatment and builds renderable slides.
 * It does not invent a rigid template per slide type.
 */

import type {
  CarouselCompositionArchetype,
  CarouselCompositionIR,
  CarouselCompositionSlide,
  CarouselCompositionTextRole,
} from "./carouselCompositionIR";
import type {
  CarouselPlanningBeatRole,
  CarouselPlanningIR,
} from "./carouselPlanningIR";
import { formatCarouselListItemNumber } from "./carouselStudio";
import {
  CAROUSEL_STOCK_PREVIEW,
  type CarouselImageSlot,
  type CarouselLayoutId,
  type CarouselSlideRole,
  type CarouselSlideSpec,
  type CarouselSlotRole,
  type CarouselSlotValues,
  type CarouselTemplate,
  type CarouselTextSlot,
} from "./carouselTemplates";

export const BREAKDOWN_LISTICLE_FAMILY = "breakdown_listicle" as const;

export const BREAKDOWN_LISTICLE_TREATMENTS = [
  "strong_cover",
  "text_focus",
  "text_visual_split",
  "number_focus",
  "comparison_split",
  "diagram_focus",
  "timeline_flow",
  "checklist_stack",
  "data_focus",
  "closing_focus",
] as const;
export type BreakdownListicleTreatment =
  (typeof BREAKDOWN_LISTICLE_TREATMENTS)[number];

export const BREAKDOWN_LISTICLE_SUPPORTED_ARCHETYPES = [
  "text_focus",
  "text_visual_split",
  "number_focus",
  "comparison_split",
  "diagram_focus",
  "timeline_flow",
  "checklist_stack",
  "data_focus",
  "closing_focus",
] as const;
export type BreakdownListicleSupportedArchetype =
  (typeof BREAKDOWN_LISTICLE_SUPPORTED_ARCHETYPES)[number];

const SUPPORTED_ARCHETYPE_SET = new Set<string>(
  BREAKDOWN_LISTICLE_SUPPORTED_ARCHETYPES
);

export type BreakdownListicleComposition = {
  family: typeof BREAKDOWN_LISTICLE_FAMILY;
  archetype: CarouselCompositionArchetype;
  treatment: BreakdownListicleTreatment;
  semanticRole: CarouselPlanningBeatRole;
  listItemIndex: number | null;
};

export function isBreakdownListicleSlide(
  slide: Pick<CarouselSlideSpec, "composition">
): boolean {
  return slide.composition?.family === BREAKDOWN_LISTICLE_FAMILY;
}

function isStraightforwardEnumeratedListicle(
  planningIR: CarouselPlanningIR
): boolean {
  if (planningIR.contract.kind !== "enumerated") return false;

  const beats = planningIR.beats;
  if (beats.length < 3) return false;

  const coverCount = beats.filter((beat) => beat.role === "cover").length;
  const closingCount = beats.filter((beat) => beat.role === "closing").length;
  if (coverCount !== 1 || closingCount !== 1) return false;
  if (beats[0]?.role !== "cover") return false;
  if (beats[beats.length - 1]?.role !== "closing") return false;

  const body = beats.slice(1, -1);
  const listBeats = body.filter((beat) => beat.sequence?.kind === "list");
  if (listBeats.length === 0) return false;

  return body.every(
    (beat) => beat.role === "list_item" && beat.sequence?.kind === "list"
  );
}

/**
 * Execution eligibility from Planning IR structure.
 * preferredFamily is a strategist recommendation, not the gate.
 */
export function canUseBreakdownListicleFamily(
  planningIR: CarouselPlanningIR | null | undefined
): boolean {
  if (!planningIR) return false;
  if (planningIR.strategy.preferredFamily === "breakdown") return true;
  return isStraightforwardEnumeratedListicle(planningIR);
}

export function shouldUseBreakdownListicleFamily(args: {
  layoutFamily?: string | null;
  planningIR?: CarouselPlanningIR | null;
}): boolean {
  return canUseBreakdownListicleFamily(args.planningIR);
}

export function breakdownSequenceLabel(
  listItemIndex: number | null | undefined
): string | null {
  if (listItemIndex == null || !Number.isInteger(listItemIndex)) return null;
  if (listItemIndex < 1) return null;
  return formatCarouselListItemNumber(listItemIndex);
}

export function resolveBreakdownListicleTreatment(args: {
  archetype: string;
  semanticRole: string;
}): BreakdownListicleTreatment {
  const { archetype, semanticRole } = args;

  if (semanticRole === "closing") return "closing_focus";

  if (semanticRole === "cover") {
    if (archetype === "text_visual_split") return "text_visual_split";
    return "strong_cover";
  }

  if (archetype === "closing_focus") return "closing_focus";
  if (archetype === "text_visual_split") return "text_visual_split";
  if (archetype === "number_focus") return "number_focus";
  if (archetype === "comparison_split") return "comparison_split";
  if (archetype === "diagram_focus") return "diagram_focus";
  if (archetype === "timeline_flow") return "timeline_flow";
  if (archetype === "checklist_stack") return "checklist_stack";
  if (archetype === "data_focus") return "data_focus";
  if (archetype === "text_focus") return "text_focus";

  if (semanticRole === "list_item") return "number_focus";
  return "text_focus";
}

function hasResolvedBreakdownImage(imageUrl?: string | null): boolean {
  return typeof imageUrl === "string" && imageUrl.trim().length > 0;
}

/**
 * Renderer-only degradation. Does not change Composition IR or stored treatment.
 * A split slide with no image must not reserve an empty image box.
 */
export function resolveBreakdownListicleRenderTreatment(args: {
  archetype: string;
  semanticRole: string;
  imageUrl?: string | null;
  listItemIndex?: number | null;
}): BreakdownListicleTreatment {
  const treatment = resolveBreakdownListicleTreatment({
    archetype: args.archetype,
    semanticRole: args.semanticRole,
  });
  if (treatment !== "text_visual_split") return treatment;
  if (hasResolvedBreakdownImage(args.imageUrl)) return treatment;
  if (args.semanticRole === "cover") return "strong_cover";
  if (args.listItemIndex != null) return "number_focus";
  return "text_focus";
}

export function isSupportedBreakdownArchetype(
  archetype: string
): archetype is BreakdownListicleSupportedArchetype {
  return SUPPORTED_ARCHETYPE_SET.has(archetype);
}

function fallbackLayoutId(
  treatment: BreakdownListicleTreatment
): CarouselLayoutId {
  switch (treatment) {
    case "strong_cover":
      return "hook_bold_center";
    case "text_visual_split":
      return "hook_photo_top";
    case "closing_focus":
      return "cta_bold_center";
    default:
      return "list_item_numbered";
  }
}

function slideRoleFromBeat(role: CarouselPlanningBeatRole): CarouselSlideRole {
  switch (role) {
    case "cover":
      return "hook";
    case "closing":
      return "cta";
    case "problem":
      return "problem";
    case "example":
      return "example";
    default:
      return "list_item";
  }
}

function listItemIndexFromBeat(
  beat: CarouselPlanningIR["beats"][number]
): number | null {
  if (beat.sequence?.kind === "list") return beat.sequence.index;
  if (beat.sequence?.kind === "problem_solution") return beat.sequence.index;
  return null;
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
  sequence: "Number",
  kicker: "Kicker",
  headline: "Headline",
  body: "Body",
  support: "Support",
  cta: "CTA",
};

const REGION_BUDGET: Record<
  CarouselCompositionTextRole,
  { min: number; max: number }
> = {
  sequence: { min: 1, max: 3 },
  kicker: { min: 4, max: 22 },
  headline: { min: 14, max: 48 },
  body: { min: 24, max: 140 },
  support: { min: 8, max: 90 },
  cta: { min: 6, max: 28 },
};

function slotForRegion(
  role: CarouselCompositionTextRole,
  defaultText: string
): CarouselTextSlot {
  return {
    id: role === "cta" ? "cta_label" : role,
    role: REGION_SLOT_ROLE[role],
    label: REGION_LABEL[role],
    budget: REGION_BUDGET[role],
    defaultText,
  };
}

function extraComparisonSlots(): CarouselTextSlot[] {
  return [
    {
      id: "left",
      role: "headline",
      label: "Left comparison",
      budget: { min: 4, max: 28 },
      defaultText: "",
    },
    {
      id: "right",
      role: "headline",
      label: "Right comparison",
      budget: { min: 4, max: 28 },
      defaultText: "",
    },
  ];
}

function supportSlotForTreatment(
  treatment: BreakdownListicleTreatment
): CarouselTextSlot {
  if (treatment === "checklist_stack") {
    return {
      id: "support",
      role: "subhead",
      label: "Checklist lines",
      budget: REGION_BUDGET.support,
      defaultText: "",
    };
  }
  if (treatment === "data_focus") {
    return {
      id: "support",
      role: "subhead",
      label: "Data point",
      budget: REGION_BUDGET.support,
      defaultText: "",
    };
  }
  return slotForRegion("support", "");
}

function slotsForCompositionSlide(args: {
  compositionSlide: CarouselCompositionSlide;
  treatment: BreakdownListicleTreatment;
  listItemIndex: number | null;
}): CarouselTextSlot[] {
  const { compositionSlide, treatment, listItemIndex } = args;
  const sequence = breakdownSequenceLabel(listItemIndex);
  const slots: CarouselTextSlot[] = [];

  for (const region of compositionSlide.textRegions) {
    if (region.role === "sequence") {
      slots.push({
        id: "kicker",
        role: "kicker",
        label: "Number",
        budget: REGION_BUDGET.sequence,
        defaultText: sequence ?? "",
      });
      continue;
    }
    if (region.role === "kicker" && sequence) {
      continue;
    }
    slots.push(slotForRegion(region.role, ""));
  }

  if (treatment === "comparison_split") {
    slots.push(...extraComparisonSlots());
  }
  if (
    treatment === "diagram_focus" ||
    treatment === "timeline_flow" ||
    treatment === "checklist_stack" ||
    treatment === "data_focus"
  ) {
    if (!slots.some((slot) => slot.id === "support")) {
      slots.push(supportSlotForTreatment(treatment));
    } else if (treatment === "checklist_stack" || treatment === "data_focus") {
      const support = slots.find((slot) => slot.id === "support");
      if (support) {
        support.label =
          treatment === "checklist_stack" ? "Checklist lines" : "Data point";
      }
    }
  }

  const ids = new Set<string>();
  return slots.filter((slot) => {
    if (ids.has(slot.id)) return false;
    ids.add(slot.id);
    return true;
  });
}

function photoImageSlot(objective: string): CarouselImageSlot {
  return {
    id: "photo",
    label: "Photo",
    searchQueryHint: objective,
    defaultImageUrl: CAROUSEL_STOCK_PREVIEW.analytics,
  };
}

function wantsPhoto(compositionSlide: CarouselCompositionSlide): boolean {
  return compositionSlide.visualRegions.some(
    (region) =>
      region.kind === "photo" ||
      region.kind === "illustration" ||
      region.kind === "icon_scene"
  );
}

export function buildBreakdownListicleSlides(args: {
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
    const listItemIndex = listItemIndexFromBeat(beat);
    const treatment = resolveBreakdownListicleTreatment({
      archetype: compositionSlide.archetype,
      semanticRole: beat.role,
    });
    const composition: BreakdownListicleComposition = {
      family: BREAKDOWN_LISTICLE_FAMILY,
      archetype: compositionSlide.archetype,
      treatment,
      semanticRole: beat.role,
      listItemIndex,
    };

    slides.push({
      id: `slide_${String(index + 1).padStart(2, "0")}`,
      role: slideRoleFromBeat(beat.role),
      viralWhy: beat.objective,
      layoutId: fallbackLayoutId(treatment),
      slots: slotsForCompositionSlide({
        compositionSlide,
        treatment,
        listItemIndex,
      }),
      ...(wantsPhoto(compositionSlide)
        ? { imageSlots: [photoImageSlot(beat.objective)] }
        : {}),
      composition,
    });
  }

  return slides;
}

export function applyPlanningSequenceToCopy(
  slides: CarouselSlideSpec[],
  values: Record<string, CarouselSlotValues>
): Record<string, CarouselSlotValues> {
  const next: Record<string, CarouselSlotValues> = { ...values };
  for (const slide of slides) {
    if (!isBreakdownListicleSlide(slide)) continue;
    const label = breakdownSequenceLabel(slide.composition?.listItemIndex);
    const slideVals = { ...(next[slide.id] ?? {}) };
    if (label) {
      slideVals.kicker = label;
    } else if (/^\d{1,2}$/.test((slideVals.kicker ?? "").trim())) {
      delete slideVals.kicker;
    }
    next[slide.id] = slideVals;
  }
  return next;
}

export function breakdownRegionCopy(
  values: CarouselSlotValues,
  region: CarouselCompositionTextRole | "left" | "right"
): string {
  switch (region) {
    case "sequence":
      return "";
    case "kicker":
      return values.kicker ?? "";
    case "headline":
      return values.headline ?? "";
    case "body":
      return values.body || values.subhead || "";
    case "support":
      return values.support || "";
    case "cta":
      return values.cta || values.cta_label || "";
    case "left":
      return values.left || "";
    case "right":
      return values.right || "";
    default:
      return "";
  }
}

export function splitNativeSteps(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/\n+|•|→|->|(?:\s+vs\.?\s+)/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.slice(0, 4);
}

export function splitChecklistLines(text: string): string[] {
  const native = splitNativeSteps(text);
  if (native.length >= 2) return native.slice(0, 4);
  if (native.length === 1) {
    const sentences = native[0]!
      .split(/(?<=\.)\s+/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (sentences.length >= 2) return sentences.slice(0, 4);
  }
  return native.slice(0, 4);
}

export function breakdownChecklistLines(values: CarouselSlotValues): string[] {
  const fromSupport = splitChecklistLines(breakdownRegionCopy(values, "support"));
  if (fromSupport.length > 0) return fromSupport;
  return splitChecklistLines(breakdownRegionCopy(values, "body"));
}

export function breakdownDiagramNodes(values: CarouselSlotValues): string[] {
  const fromSupport = splitNativeSteps(breakdownRegionCopy(values, "support"));
  if (fromSupport.length >= 2) return fromSupport.slice(0, 4);
  if (fromSupport.length === 1) return fromSupport;
  return splitChecklistLines(breakdownRegionCopy(values, "body")).slice(0, 4);
}

export function breakdownDataPoint(values: CarouselSlotValues): string {
  return breakdownRegionCopy(values, "support").trim();
}

/**
 * Presentation-only. Lifts a threshold or metric phrase from the support slot.
 * Never reads body. Never invents a statistic.
 */
const SUPPORT_THRESHOLD_PHRASE_RE =
  /\b(\d+(?:\.\d+)?\+?\s*(?:days?|hours?|weeks?|months?|years?|mins?|minutes?)|\d+(?:\.\d+)?%|\$[\d,]+(?:\.\d+)?|\d+(?:\.\d+)?x)\b/i;

export function breakdownDataHero(values: CarouselSlotValues): string {
  const support = breakdownDataPoint(values);
  if (!support) return "";
  const match = support.match(SUPPORT_THRESHOLD_PHRASE_RE);
  if (!match?.[1]) return support;
  return match[1].replace(/\s+/g, " ").trim();
}

export type BreakdownChecklistRhythm = "compact" | "roomy" | "lead";

export function breakdownChecklistRhythm(
  listItemIndex: number | null | undefined
): BreakdownChecklistRhythm {
  const n = listItemIndex ?? 1;
  if (n <= 2) return "compact";
  if (n <= 4) return "roomy";
  return "lead";
}

export function breakdownTreatmentChrome(
  treatment: BreakdownListicleTreatment
): readonly string[] {
  switch (treatment) {
    case "strong_cover":
      return ["kicker", "headline", "accent-rule", "body"];
    case "text_focus":
      return ["small-sequence", "headline", "body"];
    case "text_visual_split":
      return ["small-sequence", "headline", "body", "image-panel"];
    case "number_focus":
      return ["hero-sequence", "headline", "body"];
    case "comparison_split":
      return ["small-sequence", "headline", "left-right", "body"];
    case "diagram_focus":
      return ["small-sequence", "headline", "diagram-nodes"];
    case "timeline_flow":
      return ["small-sequence", "headline", "timeline-points"];
    case "checklist_stack":
      return ["small-sequence", "headline", "body", "check-rows"];
    case "data_focus":
      return ["small-sequence", "headline", "data-hero", "data-point", "body"];
    case "closing_focus":
      return ["headline", "body", "cta"];
  }
}
