/**
 * Template-agnostic Carousel Composition IR v1.
 * Describes how each planning beat should be visually communicated.
 * Planning IR remains semantic truth. Layout families and renderers own geometry.
 *
 * Original Mode and Remix Mode both emit this same contract.
 * This module is not Visual Director and does not call a model.
 */

import {
  CAROUSEL_PLANNING_IR_VERSION,
  type CarouselPlanningBeat,
  type CarouselPlanningBeatRole,
  type CarouselPlanningIR,
  type CarouselPlanningIRVersion,
} from "./carouselPlanningIR";

export const CAROUSEL_COMPOSITION_IR_VERSION = 1 as const;
export type CarouselCompositionIRVersion = typeof CAROUSEL_COMPOSITION_IR_VERSION;

export const CAROUSEL_COMPOSITION_ARCHETYPES = [
  "text_focus",
  "number_focus",
  "text_visual_split",
  "full_bleed_visual",
  "comparison_split",
  "checklist_stack",
  "timeline_flow",
  "diagram_focus",
  "data_focus",
  "quote_focus",
  "story_scene",
  "framework_grid",
  "closing_focus",
] as const;
export type CarouselCompositionArchetype =
  (typeof CAROUSEL_COMPOSITION_ARCHETYPES)[number];

export const CAROUSEL_COMPOSITION_EMPHASES = [
  "headline",
  "sequence",
  "visual",
  "data",
  "comparison",
  "quote",
  "cta",
] as const;
export type CarouselCompositionEmphasis =
  (typeof CAROUSEL_COMPOSITION_EMPHASES)[number];

export const CAROUSEL_COMPOSITION_DENSITIES = ["low", "medium", "high"] as const;
export type CarouselCompositionDensity =
  (typeof CAROUSEL_COMPOSITION_DENSITIES)[number];

export const CAROUSEL_COMPOSITION_TEXT_ROLES = [
  "sequence",
  "kicker",
  "headline",
  "body",
  "support",
  "cta",
] as const;
export type CarouselCompositionTextRole =
  (typeof CAROUSEL_COMPOSITION_TEXT_ROLES)[number];

export const CAROUSEL_COMPOSITION_TEXT_PRIORITIES = [
  "primary",
  "secondary",
  "tertiary",
] as const;
export type CarouselCompositionTextPriority =
  (typeof CAROUSEL_COMPOSITION_TEXT_PRIORITIES)[number];

export type CarouselCompositionTextRegion = {
  role: CarouselCompositionTextRole;
  priority: CarouselCompositionTextPriority;
};

export const CAROUSEL_COMPOSITION_VISUAL_KINDS = [
  "photo",
  "illustration",
  "diagram",
  "timeline",
  "comparison",
  "checklist",
  "data",
  "icon_scene",
] as const;
export type CarouselCompositionVisualKind =
  (typeof CAROUSEL_COMPOSITION_VISUAL_KINDS)[number];

export const CAROUSEL_COMPOSITION_VISUAL_PLACEMENTS = [
  "background",
  "left",
  "right",
  "top",
  "bottom",
  "center",
  "split",
  "full_bleed",
] as const;
export type CarouselCompositionVisualPlacement =
  (typeof CAROUSEL_COMPOSITION_VISUAL_PLACEMENTS)[number];

export const CAROUSEL_COMPOSITION_VISUAL_IMPORTANCES = [
  "primary",
  "supporting",
] as const;
export type CarouselCompositionVisualImportance =
  (typeof CAROUSEL_COMPOSITION_VISUAL_IMPORTANCES)[number];

export type CarouselCompositionVisual = {
  kind: CarouselCompositionVisualKind;
  placement: CarouselCompositionVisualPlacement;
  importance: CarouselCompositionVisualImportance;
};

export type CarouselCompositionSlide = {
  beatId: string;
  position: number;
  semanticRole: CarouselPlanningBeatRole;
  archetype: CarouselCompositionArchetype;
  emphasis: CarouselCompositionEmphasis;
  density: CarouselCompositionDensity;
  textRegions: CarouselCompositionTextRegion[];
  visual: CarouselCompositionVisual | null;
};

export type CarouselCompositionIR = {
  version: CarouselCompositionIRVersion;
  planningVersion: CarouselPlanningIRVersion;
  slides: CarouselCompositionSlide[];
};

/** Object keys that belong to templates, slots, copy, assets, or the renderer. */
export const FORBIDDEN_CAROUSEL_COMPOSITION_IR_KEYS = [
  "templateId",
  "layoutId",
  "carouselLayoutId",
  "CarouselLayoutId",
  "slotId",
  "slotIds",
  "slot",
  "headline",
  "body",
  "subhead",
  "kicker",
  "cta_label",
  "text",
  "copy",
  "x",
  "y",
  "width",
  "height",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "color",
  "colors",
  "typography",
  "dimensions",
  "imageUrl",
  "imageUrls",
  "prompt",
  "imagePrompt",
  "gptPrompt",
  "crop",
  "assetId",
  "assetIds",
  "css",
  "className",
  "component",
  "renderer",
  "url",
  "mode",
] as const;

const FORBIDDEN_IR_KEY_SET = new Set<string>(
  FORBIDDEN_CAROUSEL_COMPOSITION_IR_KEYS
);
const SLIDE_TEMPLATE_ID_RE = /^slide_\d+$/;
const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const ARCHETYPE_SET = new Set<string>(CAROUSEL_COMPOSITION_ARCHETYPES);
const EMPHASIS_SET = new Set<string>(CAROUSEL_COMPOSITION_EMPHASES);
const DENSITY_SET = new Set<string>(CAROUSEL_COMPOSITION_DENSITIES);
const TEXT_ROLE_SET = new Set<string>(CAROUSEL_COMPOSITION_TEXT_ROLES);
const TEXT_PRIORITY_SET = new Set<string>(CAROUSEL_COMPOSITION_TEXT_PRIORITIES);
const VISUAL_KIND_SET = new Set<string>(CAROUSEL_COMPOSITION_VISUAL_KINDS);
const VISUAL_PLACEMENT_SET = new Set<string>(
  CAROUSEL_COMPOSITION_VISUAL_PLACEMENTS
);
const VISUAL_IMPORTANCE_SET = new Set<string>(
  CAROUSEL_COMPOSITION_VISUAL_IMPORTANCES
);

type ArchetypeVisualRule = {
  requireNull?: boolean;
  kinds?: readonly CarouselCompositionVisualKind[];
  placements?: readonly CarouselCompositionVisualPlacement[];
};

const ARCHETYPE_VISUAL_RULES: Record<
  CarouselCompositionArchetype,
  ArchetypeVisualRule
> = {
  text_focus: { requireNull: true },
  number_focus: { requireNull: true },
  closing_focus: { requireNull: true },
  quote_focus: { requireNull: true },
  text_visual_split: {
    kinds: ["photo", "illustration", "icon_scene"],
    placements: ["left", "right", "split"],
  },
  full_bleed_visual: {
    kinds: ["photo", "illustration"],
    placements: ["full_bleed"],
  },
  comparison_split: {
    kinds: ["comparison"],
    placements: ["split", "left", "right"],
  },
  checklist_stack: {
    kinds: ["checklist"],
    placements: ["center", "bottom"],
  },
  timeline_flow: {
    kinds: ["timeline"],
    placements: ["center"],
  },
  diagram_focus: {
    kinds: ["diagram"],
    placements: ["center"],
  },
  data_focus: {
    kinds: ["data"],
    placements: ["center"],
  },
  story_scene: {
    kinds: ["photo", "illustration", "icon_scene"],
    placements: ["background", "center", "full_bleed"],
  },
  framework_grid: {
    kinds: ["diagram", "checklist"],
    placements: ["center"],
  },
};

function uniqueIssues(issues: string[]): string[] {
  return [...new Set(issues)];
}

function includesUnion<T extends string>(
  values: readonly T[],
  value: string
): value is T {
  return (values as readonly string[]).includes(value);
}

function beatHasSequence(beat: CarouselPlanningBeat): boolean {
  return beat.sequence != null;
}

function baselineArchetype(
  beat: CarouselPlanningBeat
): CarouselCompositionArchetype {
  if (beat.role === "closing") return "closing_focus";

  switch (beat.visualIntent) {
    case "comparison":
      return "comparison_split";
    case "timeline":
      return "timeline_flow";
    case "checklist":
      return "checklist_stack";
    case "diagram":
      return "diagram_focus";
    case "data":
      return "data_focus";
    case "photo":
      return "text_visual_split";
    default:
      break;
  }

  if (beat.role === "cover") return "text_focus";
  if (beat.role === "list_item") return "number_focus";
  if (beat.role === "comparison") return "comparison_split";
  if (beat.role === "framework_step") return "framework_grid";
  if (beat.role === "story") return "story_scene";
  return "text_focus";
}

function baselineEmphasis(
  beat: CarouselPlanningBeat,
  archetype: CarouselCompositionArchetype
): CarouselCompositionEmphasis {
  if (beat.role === "closing") return "cta";
  if (beatHasSequence(beat)) return "sequence";
  if (archetype === "data_focus") return "data";
  if (archetype === "comparison_split") return "comparison";
  if (archetype === "quote_focus") return "quote";
  if (archetype === "full_bleed_visual" || archetype === "text_visual_split") {
    return "visual";
  }
  return "headline";
}

function baselineDensity(
  role: CarouselPlanningBeatRole,
  archetype: CarouselCompositionArchetype
): CarouselCompositionDensity {
  if (role === "cover" || role === "closing") return "low";
  if (
    archetype === "text_focus" ||
    archetype === "number_focus" ||
    archetype === "quote_focus"
  ) {
    return "low";
  }
  if (archetype === "checklist_stack" || archetype === "framework_grid") {
    return "high";
  }
  return "medium";
}

function baselineTextRegions(
  beat: CarouselPlanningBeat,
  emphasis: CarouselCompositionEmphasis
): CarouselCompositionTextRegion[] {
  const regions: CarouselCompositionTextRegion[] = [];
  if (beatHasSequence(beat)) {
    regions.push({
      role: "sequence",
      priority: emphasis === "sequence" ? "primary" : "secondary",
    });
  }

  if (beat.role === "closing") {
    regions.push({ role: "headline", priority: "secondary" });
    regions.push({ role: "cta", priority: "primary" });
    return regions;
  }

  if (beat.role === "cover") {
    regions.push({ role: "kicker", priority: "secondary" });
  }

  regions.push({ role: "headline", priority: "primary" });
  regions.push({ role: "body", priority: "secondary" });
  return regions;
}

function baselineVisual(
  archetype: CarouselCompositionArchetype
): CarouselCompositionVisual | null {
  switch (archetype) {
    case "text_visual_split":
      return { kind: "photo", placement: "right", importance: "supporting" };
    case "full_bleed_visual":
      return { kind: "photo", placement: "full_bleed", importance: "primary" };
    case "comparison_split":
      return { kind: "comparison", placement: "split", importance: "primary" };
    case "checklist_stack":
      return { kind: "checklist", placement: "center", importance: "supporting" };
    case "timeline_flow":
      return { kind: "timeline", placement: "center", importance: "primary" };
    case "diagram_focus":
      return { kind: "diagram", placement: "center", importance: "primary" };
    case "data_focus":
      return { kind: "data", placement: "center", importance: "primary" };
    case "story_scene":
      return { kind: "photo", placement: "background", importance: "supporting" };
    case "framework_grid":
      return { kind: "diagram", placement: "center", importance: "supporting" };
    default:
      return null;
  }
}

function compileSlide(beat: CarouselPlanningBeat): CarouselCompositionSlide {
  const archetype = baselineArchetype(beat);
  const emphasis = baselineEmphasis(beat, archetype);
  return {
    beatId: beat.id,
    position: beat.position,
    semanticRole: beat.role,
    archetype,
    emphasis,
    density: baselineDensity(beat.role, archetype),
    textRegions: baselineTextRegions(beat, emphasis),
    visual: baselineVisual(archetype),
  };
}

export function compilePlanningIRToBaselineCompositionIR(
  planningIR: CarouselPlanningIR
): CarouselCompositionIR {
  return {
    version: CAROUSEL_COMPOSITION_IR_VERSION,
    planningVersion: CAROUSEL_PLANNING_IR_VERSION,
    slides: planningIR.beats.map(compileSlide),
  };
}

function collectForbiddenCompositionIRKeys(
  value: unknown,
  path: string,
  found: string[]
): void {
  if (value == null || typeof value !== "object") {
    if (typeof value === "string" && HEX_COLOR_RE.test(value)) {
      found.push(`${path} contains a hex color`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectForbiddenCompositionIRKeys(item, `${path}[${index}]`, found);
    });
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_IR_KEY_SET.has(key) || SLIDE_TEMPLATE_ID_RE.test(key)) {
      found.push(`${nextPath} is renderer or template specific`);
    }
    collectForbiddenCompositionIRKeys(child, nextPath, found);
  }
}

function slideHasRegion(
  slide: CarouselCompositionSlide,
  role: CarouselCompositionTextRole
): boolean {
  return slide.textRegions.some((region) => region.role === role);
}

function validateTextRegions(
  slide: CarouselCompositionSlide,
  beat: CarouselPlanningBeat,
  issues: string[]
): void {
  const roles = slide.textRegions.map((region) => region.role);
  if (new Set(roles).size !== roles.length) {
    issues.push(`Slide ${slide.position} has duplicate text region roles`);
  }

  for (const region of slide.textRegions) {
    if (!TEXT_ROLE_SET.has(region.role)) {
      issues.push(`Slide ${slide.position} has unknown text region role`);
    }
    if (!TEXT_PRIORITY_SET.has(region.priority)) {
      issues.push(`Slide ${slide.position} has unknown text region priority`);
    }
  }

  if (!slideHasRegion(slide, "headline")) {
    issues.push(`Slide ${slide.position} must include a headline text region`);
  }

  const needsSequence = beatHasSequence(beat);
  const hasSequence = slideHasRegion(slide, "sequence");
  if (needsSequence && !hasSequence) {
    issues.push(
      `${beat.role} beat ${beat.id} must include a sequence text region`
    );
  }
  if (!needsSequence && hasSequence) {
    issues.push(
      `${beat.role} beat ${beat.id} must not include a sequence text region`
    );
  }
  if (slide.semanticRole === "cover" && hasSequence) {
    issues.push("Cover slide must not include a sequence text region");
  }
  if (slide.semanticRole === "closing" && hasSequence) {
    issues.push("Closing slide must not include a sequence text region");
  }

  const hasCta = slideHasRegion(slide, "cta");
  if (slide.semanticRole === "closing" && !hasCta) {
    issues.push("Closing slide must include a cta text region");
  }
  if (slide.semanticRole !== "closing" && hasCta) {
    issues.push(
      `${slide.semanticRole} slide ${slide.position} must not include a cta text region`
    );
  }
}

function validateVisualCompatibility(
  slide: CarouselCompositionSlide,
  issues: string[]
): void {
  if (!ARCHETYPE_SET.has(slide.archetype)) {
    issues.push(`Slide ${slide.position} has unknown archetype`);
    return;
  }
  const rule = ARCHETYPE_VISUAL_RULES[slide.archetype];
  if (rule.requireNull) {
    if (slide.visual != null) {
      issues.push(
        `Slide ${slide.position} archetype ${slide.archetype} must not include a visual`
      );
    }
    return;
  }
  if (slide.visual == null) {
    issues.push(
      `Slide ${slide.position} archetype ${slide.archetype} must include a visual`
    );
    return;
  }
  if (!VISUAL_KIND_SET.has(slide.visual.kind)) {
    issues.push(`Slide ${slide.position} has unknown visual kind`);
  }
  if (!VISUAL_PLACEMENT_SET.has(slide.visual.placement)) {
    issues.push(`Slide ${slide.position} has unknown visual placement`);
  }
  if (!VISUAL_IMPORTANCE_SET.has(slide.visual.importance)) {
    issues.push(`Slide ${slide.position} has unknown visual importance`);
  }
  if (rule.kinds && !includesUnion(rule.kinds, slide.visual.kind)) {
    issues.push(
      `Slide ${slide.position} visual kind is incompatible with ${slide.archetype}`
    );
  }
  if (rule.placements && !includesUnion(rule.placements, slide.visual.placement)) {
    issues.push(
      `Slide ${slide.position} visual placement is incompatible with ${slide.archetype}`
    );
  }
}

export function validateCarouselCompositionIR(
  compositionIR: CarouselCompositionIR,
  planningIR: CarouselPlanningIR
): string[] {
  const issues: string[] = [];

  if (compositionIR.version !== CAROUSEL_COMPOSITION_IR_VERSION) {
    issues.push(`Unsupported composition IR version ${compositionIR.version}`);
  }
  if (compositionIR.planningVersion !== planningIR.version) {
    issues.push("Composition IR planningVersion must match Planning IR version");
  }
  if (compositionIR.planningVersion !== CAROUSEL_PLANNING_IR_VERSION) {
    issues.push(
      `Unsupported composition planningVersion ${compositionIR.planningVersion}`
    );
  }

  if (compositionIR.slides.length !== planningIR.beats.length) {
    issues.push("Composition IR must contain one slide per planning beat");
  }

  const positions = compositionIR.slides.map((slide) => slide.position);
  const expectedPositions = compositionIR.slides.map((_, index) => index + 1);
  if (positions.some((value, index) => value !== expectedPositions[index])) {
    issues.push("Composition slide positions must be contiguous starting at 1");
  }

  const beatIds = compositionIR.slides.map((slide) => slide.beatId);
  if (new Set(beatIds).size !== beatIds.length) {
    issues.push("Composition beat IDs must be unique");
  }

  const covers = compositionIR.slides.filter(
    (slide) => slide.semanticRole === "cover"
  );
  if (covers.length !== 1) {
    issues.push("Composition IR must contain exactly one cover");
  } else if (compositionIR.slides[0]?.semanticRole !== "cover") {
    issues.push("Cover composition must be first");
  }

  const closings = compositionIR.slides.filter(
    (slide) => slide.semanticRole === "closing"
  );
  if (closings.length !== 1) {
    issues.push("Composition IR must contain exactly one closing");
  } else if (
    compositionIR.slides[compositionIR.slides.length - 1]?.semanticRole !==
    "closing"
  ) {
    issues.push("Closing composition must be last");
  }

  const count = Math.min(compositionIR.slides.length, planningIR.beats.length);
  for (let index = 0; index < count; index += 1) {
    const slide = compositionIR.slides[index]!;
    const beat = planningIR.beats[index]!;
    if (slide.beatId !== beat.id) {
      issues.push(`Slide ${index + 1} beatId must be ${beat.id}`);
    }
    if (slide.position !== beat.position) {
      issues.push(`Slide ${index + 1} position must be ${beat.position}`);
    }
    if (slide.semanticRole !== beat.role) {
      issues.push(
        `Slide ${index + 1} semanticRole must remain ${beat.role}`
      );
    }
    if (!EMPHASIS_SET.has(slide.emphasis)) {
      issues.push(`Slide ${slide.position} has unknown emphasis`);
    }
    if (!DENSITY_SET.has(slide.density)) {
      issues.push(`Slide ${slide.position} has unknown density`);
    }
    validateTextRegions(slide, beat, issues);
    validateVisualCompatibility(slide, issues);
  }

  collectForbiddenCompositionIRKeys(compositionIR, "", issues);
  return uniqueIssues(issues);
}
