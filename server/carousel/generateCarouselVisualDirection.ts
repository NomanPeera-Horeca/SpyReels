/**
 * Carousel Visual Director v1.
 * One whole-carousel LLM call chooses presentation. Deterministic code
 * assembles Composition IR so Planning IR remains semantic truth.
 *
 * Wired into the modern breakdown remake path with baseline fallback.
 */

import {
  CAROUSEL_COMPOSITION_ARCHETYPES,
  CAROUSEL_COMPOSITION_DENSITIES,
  CAROUSEL_COMPOSITION_EMPHASES,
  CAROUSEL_COMPOSITION_IR_VERSION,
  CAROUSEL_COMPOSITION_TEXT_PRIORITIES,
  CAROUSEL_COMPOSITION_TEXT_ROLES,
  CAROUSEL_COMPOSITION_VISUAL_KINDS,
  CAROUSEL_COMPOSITION_VISUAL_PLACEMENTS,
  CAROUSEL_COMPOSITION_VISUAL_ROLES,
  FORBIDDEN_CAROUSEL_COMPOSITION_IR_KEYS,
  compilePlanningIRToBaselineCompositionIR,
  validateCarouselCompositionIR,
  type CarouselCompositionArchetype,
  type CarouselCompositionDensity,
  type CarouselCompositionEmphasis,
  type CarouselCompositionIR,
  type CarouselCompositionTextPriority,
  type CarouselCompositionTextRegion,
  type CarouselCompositionTextRole,
  type CarouselCompositionVisualKind,
  type CarouselCompositionVisualPlacement,
  type CarouselCompositionVisualRegion,
  type CarouselCompositionVisualRole,
} from "@shared/carouselCompositionIR";
import {
  CAROUSEL_PLANNING_IR_VERSION,
  type CarouselPlanningBeat,
  type CarouselPlanningIR,
} from "@shared/carouselPlanningIR";
import type { CarouselRecommendedVisual } from "@shared/carouselStudio";
import { invokeLLM } from "../_core/llm";
import { withAiFormattingRules } from "../utils/aiFormattingRules";
import { parseLlmJson } from "../utils/parseLlmJson";

export const CAROUSEL_VISUAL_DIRECTION_OPERATION =
  "carousel_visual_direction" as const;

export type CarouselVisualDirectorDecision = {
  beatId: string;
  archetype: CarouselCompositionArchetype;
  emphasis: CarouselCompositionEmphasis;
  density: CarouselCompositionDensity;
  textRegions: CarouselCompositionTextRegion[];
  visualRegions: CarouselCompositionVisualRegion[];
};

export type CarouselVisualDirectorSource =
  | "ai"
  | "ai_repair"
  | "baseline_fallback";

export type CarouselVisualDirectorResult = {
  compositionIR: CarouselCompositionIR;
  source: CarouselVisualDirectorSource;
  attempts: number;
  issues: string[];
};

const ENUM_STRING = (values: readonly string[], description: string) => ({
  type: "string" as const,
  enum: [...values],
  description,
});

const ARCHETYPE_SET = new Set<string>(CAROUSEL_COMPOSITION_ARCHETYPES);
const EMPHASIS_SET = new Set<string>(CAROUSEL_COMPOSITION_EMPHASES);
const DENSITY_SET = new Set<string>(CAROUSEL_COMPOSITION_DENSITIES);
const TEXT_ROLE_SET = new Set<string>(CAROUSEL_COMPOSITION_TEXT_ROLES);
const TEXT_PRIORITY_SET = new Set<string>(CAROUSEL_COMPOSITION_TEXT_PRIORITIES);
const VISUAL_KIND_SET = new Set<string>(CAROUSEL_COMPOSITION_VISUAL_KINDS);
const VISUAL_PLACEMENT_SET = new Set<string>(
  CAROUSEL_COMPOSITION_VISUAL_PLACEMENTS
);
const VISUAL_ROLE_SET = new Set<string>(CAROUSEL_COMPOSITION_VISUAL_ROLES);

const FORBIDDEN_DECISION_KEY_SET = new Set<string>([
  ...FORBIDDEN_CAROUSEL_COMPOSITION_IR_KEYS,
]);
const LOCKED_PLANNING_KEYS = new Set([
  "position",
  "semanticRole",
  "sequence",
  "listItemIndex",
  "planningVersion",
  "topic",
]);
const SLIDE_TEMPLATE_ID_RE = /^slide_\d+$/;
const HEX_COLOR_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/;
const LITERAL_SEQUENCE_RE = /\b0[1-9]\b/;
const ALLOWED_DECISION_KEYS = new Set([
  "beatId",
  "archetype",
  "emphasis",
  "density",
  "textRegions",
  "visualRegions",
]);
const ALLOWED_TEXT_REGION_KEYS = new Set(["role", "priority"]);
const ALLOWED_VISUAL_REGION_KEYS = new Set(["role", "kind", "placement"]);

const COVER_ARCHETYPES = new Set<CarouselCompositionArchetype>([
  "text_focus",
  "text_visual_split",
  "full_bleed_visual",
  "story_scene",
]);
const COVER_EMPHASES = new Set<CarouselCompositionEmphasis>([
  "headline",
  "visual",
]);
const LIST_ITEM_ARCHETYPES = new Set<CarouselCompositionArchetype>([
  "number_focus",
  "text_visual_split",
  "comparison_split",
  "timeline_flow",
  "diagram_focus",
  "checklist_stack",
  "data_focus",
]);

const STRONG_VISUAL_INTENT_ARCHETYPES: Partial<
  Record<CarouselRecommendedVisual, readonly CarouselCompositionArchetype[]>
> = {
  timeline: ["timeline_flow"],
  comparison: ["comparison_split"],
  diagram: ["diagram_focus"],
  checklist: ["checklist_stack", "framework_grid"],
  data: ["data_focus"],
  photo: ["text_visual_split", "full_bleed_visual", "story_scene"],
};

type DecisionsPayload = {
  slides?: unknown;
};

function uniqueIssues(issues: string[]): string[] {
  return [...new Set(issues)];
}

function beatHasSequence(beat: CarouselPlanningBeat): boolean {
  return beat.sequence != null;
}

function intersectArchetypes(
  roleAllowed: ReadonlySet<CarouselCompositionArchetype>,
  intentAllowed: readonly CarouselCompositionArchetype[] | undefined
): ReadonlySet<CarouselCompositionArchetype> {
  if (!intentAllowed || intentAllowed.length === 0) return roleAllowed;
  const overlap = intentAllowed.filter((value) => roleAllowed.has(value));
  return new Set(overlap.length > 0 ? overlap : roleAllowed);
}

export function compatibleVisualDirectorArchetypes(
  beat: CarouselPlanningBeat
): ReadonlySet<CarouselCompositionArchetype> | null {
  const intentAllowed = STRONG_VISUAL_INTENT_ARCHETYPES[beat.visualIntent];

  if (beat.role === "closing") {
    return new Set<CarouselCompositionArchetype>(["closing_focus"]);
  }
  if (beat.role === "cover") {
    return intersectArchetypes(COVER_ARCHETYPES, intentAllowed);
  }
  if (beat.role === "list_item") {
    return intersectArchetypes(LIST_ITEM_ARCHETYPES, intentAllowed);
  }
  if (intentAllowed) {
    return new Set(intentAllowed);
  }
  return null;
}

function collectForbiddenDecisionKeys(
  value: unknown,
  path: string,
  found: string[]
): void {
  if (value == null || typeof value !== "object") {
    if (typeof value === "string") {
      if (HEX_COLOR_RE.test(value)) {
        found.push(`${path} contains a hex color`);
      }
      if (LITERAL_SEQUENCE_RE.test(value)) {
        found.push(`${path} stores a literal sequence number`);
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      collectForbiddenDecisionKeys(item, `${path}[${index}]`, found);
    });
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_DECISION_KEY_SET.has(key) || SLIDE_TEMPLATE_ID_RE.test(key)) {
      found.push(`${nextPath} is renderer or template specific`);
    }
    if (LOCKED_PLANNING_KEYS.has(key)) {
      found.push(`${nextPath} is a locked Planning IR field`);
    }
    collectForbiddenDecisionKeys(child, nextPath, found);
  }
}

function collectUnexpectedDecisionKeys(
  decision: Record<string, unknown>,
  path: string,
  found: string[]
): void {
  for (const key of Object.keys(decision)) {
    if (!ALLOWED_DECISION_KEYS.has(key)) {
      found.push(`${path}.${key} is not a Visual Director decision field`);
    }
  }
  const textRegions = decision.textRegions;
  if (Array.isArray(textRegions)) {
    textRegions.forEach((region, index) => {
      if (!region || typeof region !== "object" || Array.isArray(region)) return;
      for (const key of Object.keys(region as Record<string, unknown>)) {
        if (!ALLOWED_TEXT_REGION_KEYS.has(key)) {
          found.push(
            `${path}.textRegions[${index}].${key} is not a text region field`
          );
        }
      }
    });
  }
  const visualRegions = decision.visualRegions;
  if (Array.isArray(visualRegions)) {
    visualRegions.forEach((region, index) => {
      if (!region || typeof region !== "object" || Array.isArray(region)) return;
      for (const key of Object.keys(region as Record<string, unknown>)) {
        if (!ALLOWED_VISUAL_REGION_KEYS.has(key)) {
          found.push(
            `${path}.visualRegions[${index}].${key} is not a visual region field`
          );
        }
      }
    });
  }
}

function asTextRegion(value: unknown): CarouselCompositionTextRegion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (typeof row.role !== "string" || typeof row.priority !== "string") {
    return null;
  }
  return {
    role: row.role as CarouselCompositionTextRole,
    priority: row.priority as CarouselCompositionTextPriority,
  };
}

function asVisualRegion(value: unknown): CarouselCompositionVisualRegion | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.role !== "string" ||
    typeof row.kind !== "string" ||
    typeof row.placement !== "string"
  ) {
    return null;
  }
  return {
    role: row.role as CarouselCompositionVisualRole,
    kind: row.kind as CarouselCompositionVisualKind,
    placement: row.placement as CarouselCompositionVisualPlacement,
  };
}

export function normalizeVisualDirectorDecisions(
  raw: unknown
): CarouselVisualDirectorDecision[] {
  if (!raw || typeof raw !== "object") return [];
  const slides = Array.isArray(raw)
    ? raw
    : (raw as DecisionsPayload).slides;
  if (!Array.isArray(slides)) return [];
  return slides.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const row = item as Record<string, unknown>;
    const textRegions = Array.isArray(row.textRegions)
      ? row.textRegions.map(asTextRegion).filter((region): region is CarouselCompositionTextRegion => region != null)
      : [];
    const visualRegions = Array.isArray(row.visualRegions)
      ? row.visualRegions
          .map(asVisualRegion)
          .filter((region): region is CarouselCompositionVisualRegion => region != null)
      : [];
    return [
      {
        beatId: typeof row.beatId === "string" ? row.beatId : "",
        archetype: row.archetype as CarouselCompositionArchetype,
        emphasis: row.emphasis as CarouselCompositionEmphasis,
        density: row.density as CarouselCompositionDensity,
        textRegions,
        visualRegions,
      },
    ];
  });
}

function extractRawDecisionObjects(raw: unknown): Record<string, unknown>[] {
  if (!raw || typeof raw !== "object") return [];
  const slides = Array.isArray(raw)
    ? raw
    : (raw as DecisionsPayload).slides;
  if (!Array.isArray(slides)) return [];
  return slides.filter(
    (item): item is Record<string, unknown> =>
      Boolean(item) && typeof item === "object" && !Array.isArray(item)
  );
}

export function validateVisualDirectorDecisions(
  planningIR: CarouselPlanningIR,
  decisions: readonly CarouselVisualDirectorDecision[],
  rawDecisions?: unknown
): string[] {
  const issues: string[] = [];
  const rawObjects =
    rawDecisions === undefined
      ? (decisions as unknown as Record<string, unknown>[])
      : extractRawDecisionObjects(rawDecisions);

  rawObjects.forEach((row, index) => {
    const path = `decisions[${index}]`;
    collectForbiddenDecisionKeys(row, path, issues);
    collectUnexpectedDecisionKeys(row, path, issues);
  });

  const expectedIds = planningIR.beats.map((beat) => beat.id);
  const decisionIds = decisions.map((decision) => decision.beatId);

  if (decisions.length !== planningIR.beats.length) {
    issues.push(
      `Visual Director must return exactly one decision per planning beat (expected ${planningIR.beats.length}, got ${decisions.length})`
    );
  }

  const uniqueIds = new Set(decisionIds);
  if (uniqueIds.size !== decisionIds.length) {
    issues.push("Visual Director beat IDs must be unique");
  }

  const expectedSet = new Set(expectedIds);
  for (const id of uniqueIds) {
    if (!expectedSet.has(id)) {
      issues.push(`Unknown Visual Director beatId ${id || "(empty)"}`);
    }
  }
  for (const id of expectedIds) {
    if (!uniqueIds.has(id)) {
      issues.push(`Missing Visual Director decision for beat ${id}`);
    }
  }

  const decisionById = new Map(
    decisions.map((decision) => [decision.beatId, decision])
  );

  for (const beat of planningIR.beats) {
    const decision = decisionById.get(beat.id);
    if (!decision) continue;

    if (!ARCHETYPE_SET.has(decision.archetype)) {
      issues.push(`Beat ${beat.id} has unknown archetype`);
    }
    if (!EMPHASIS_SET.has(decision.emphasis)) {
      issues.push(`Beat ${beat.id} has unknown emphasis`);
    }
    if (!DENSITY_SET.has(decision.density)) {
      issues.push(`Beat ${beat.id} has unknown density`);
    }

    const roles = decision.textRegions.map((region) => region.role);
    if (new Set(roles).size !== roles.length) {
      issues.push(`Beat ${beat.id} has duplicate text region roles`);
    }
    for (const region of decision.textRegions) {
      if (!TEXT_ROLE_SET.has(region.role)) {
        issues.push(`Beat ${beat.id} has unknown text region role`);
      }
      if (!TEXT_PRIORITY_SET.has(region.priority)) {
        issues.push(`Beat ${beat.id} has unknown text region priority`);
      }
    }
    if (!roles.includes("headline")) {
      issues.push(`Beat ${beat.id} must include a headline text region`);
    }

    const hasSequence = roles.includes("sequence");
    const needsSequence = beatHasSequence(beat);
    if (needsSequence && !hasSequence) {
      issues.push(`Beat ${beat.id} must include a sequence text region`);
    }
    if (!needsSequence && hasSequence) {
      issues.push(`Beat ${beat.id} must not include a sequence text region`);
    }
    if ((beat.role === "cover" || beat.role === "closing") && hasSequence) {
      issues.push(`${beat.role} beat ${beat.id} must not include a sequence text region`);
    }

    const hasCta = roles.includes("cta");
    if (beat.role === "closing" && !hasCta) {
      issues.push(`Closing beat ${beat.id} must include a cta text region`);
    }
    if (beat.role !== "closing" && hasCta) {
      issues.push(`Beat ${beat.id} must not include a cta text region`);
    }

    for (const region of decision.visualRegions) {
      if (!VISUAL_ROLE_SET.has(region.role)) {
        issues.push(`Beat ${beat.id} has unknown visual region role`);
      }
      if (!VISUAL_KIND_SET.has(region.kind)) {
        issues.push(`Beat ${beat.id} has unknown visual kind`);
      }
      if (!VISUAL_PLACEMENT_SET.has(region.placement)) {
        issues.push(`Beat ${beat.id} has unknown visual placement`);
      }
    }

    if (beat.role === "cover") {
      if (!COVER_ARCHETYPES.has(decision.archetype)) {
        issues.push(`Cover beat ${beat.id} must use a cover-safe archetype`);
      }
      if (decision.density !== "low") {
        issues.push(`Cover beat ${beat.id} must use low density`);
      }
      if (!COVER_EMPHASES.has(decision.emphasis)) {
        issues.push(
          `Cover beat ${beat.id} must emphasize headline or visual`
        );
      }
    }
    if (beat.role === "closing") {
      if (decision.archetype !== "closing_focus") {
        issues.push(`Closing beat ${beat.id} must use closing_focus`);
      }
      if (decision.emphasis !== "cta") {
        issues.push(`Closing beat ${beat.id} must emphasize cta`);
      }
    }

    issues.push(
      ...validateVisualDirectorPlanningCompatibility(beat, decision)
    );
  }

  return uniqueIssues(issues);
}

export function validateVisualDirectorPlanningCompatibility(
  beat: CarouselPlanningBeat,
  decision: Pick<CarouselVisualDirectorDecision, "archetype">
): string[] {
  const allowed = compatibleVisualDirectorArchetypes(beat);
  if (!allowed) return [];
  if (!allowed.has(decision.archetype)) {
    return [
      `Beat ${beat.id} visualIntent ${beat.visualIntent} is incompatible with archetype ${decision.archetype}`,
    ];
  }
  return [];
}

export function assembleVisualDirectorCompositionIR(args: {
  planningIR: CarouselPlanningIR;
  decisions: readonly CarouselVisualDirectorDecision[];
}): CarouselCompositionIR {
  const { planningIR, decisions } = args;
  const coverageIssues = validateVisualDirectorDecisions(planningIR, decisions);
  const structural = coverageIssues.filter(
    (issue) =>
      issue.includes("exactly one decision") ||
      issue.includes("must be unique") ||
      issue.startsWith("Unknown Visual Director beatId") ||
      issue.startsWith("Missing Visual Director decision")
  );
  if (structural.length > 0) {
    throw new Error(structural.join("; "));
  }

  const decisionById = new Map(
    decisions.map((decision) => [decision.beatId, decision])
  );

  return {
    version: CAROUSEL_COMPOSITION_IR_VERSION,
    planningVersion: CAROUSEL_PLANNING_IR_VERSION,
    slides: planningIR.beats.map((beat) => {
      const decision = decisionById.get(beat.id);
      if (!decision) {
        throw new Error(`Missing Visual Director decision for beat ${beat.id}`);
      }
      return {
        beatId: beat.id,
        position: beat.position,
        semanticRole: beat.role,
        archetype: decision.archetype,
        emphasis: decision.emphasis,
        density: decision.density,
        textRegions: decision.textRegions.map((region) => ({
          role: region.role,
          priority: region.priority,
        })),
        visualRegions: decision.visualRegions.map((region) => ({
          role: region.role,
          kind: region.kind,
          placement: region.placement,
        })),
      };
    }),
  };
}

export function buildCarouselVisualDirectionJsonSchema(): {
  name: string;
  strict: true;
  schema: Record<string, unknown>;
} {
  const textRegionSchema = {
    type: "object",
    properties: {
      role: ENUM_STRING(
        CAROUSEL_COMPOSITION_TEXT_ROLES,
        "Semantic text region only. Do not include finished copy."
      ),
      priority: ENUM_STRING(
        CAROUSEL_COMPOSITION_TEXT_PRIORITIES,
        "Relative importance of this text region."
      ),
    },
    required: ["role", "priority"],
    additionalProperties: false,
  };

  const visualRegionSchema = {
    type: "object",
    properties: {
      role: ENUM_STRING(
        CAROUSEL_COMPOSITION_VISUAL_ROLES,
        "Whether this visual is primary, supporting, or annotation."
      ),
      kind: ENUM_STRING(
        CAROUSEL_COMPOSITION_VISUAL_KINDS,
        "Semantic visual kind. Not an image prompt or asset URL."
      ),
      placement: ENUM_STRING(
        CAROUSEL_COMPOSITION_VISUAL_PLACEMENTS,
        "Semantic placement. Not coordinates or CSS."
      ),
    },
    required: ["role", "kind", "placement"],
    additionalProperties: false,
  };

  return {
    name: "carousel_visual_direction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        slides: {
          type: "array",
          description:
            "One composition decision per planning beat. Coverage is enforced in application validation, not by array length constraints.",
          items: {
            type: "object",
            properties: {
              beatId: {
                type: "string",
                description:
                  "Must match a Planning IR beat id. Do not invent ids.",
              },
              archetype: ENUM_STRING(
                CAROUSEL_COMPOSITION_ARCHETYPES,
                "Visual composition archetype for this beat."
              ),
              emphasis: ENUM_STRING(
                CAROUSEL_COMPOSITION_EMPHASES,
                "Primary communication emphasis."
              ),
              density: ENUM_STRING(
                CAROUSEL_COMPOSITION_DENSITIES,
                "How much information this slide should carry."
              ),
              textRegions: {
                type: "array",
                description:
                  "Semantic text regions only. Do not include headline, body, or CTA wording.",
                items: textRegionSchema,
              },
              visualRegions: {
                type: "array",
                description:
                  "Zero or more visual regions. Most slides use 0 or 1. Use multiple only when they improve communication.",
                items: visualRegionSchema,
              },
            },
            required: [
              "beatId",
              "archetype",
              "emphasis",
              "density",
              "textRegions",
              "visualRegions",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["slides"],
      additionalProperties: false,
    },
  };
}

export function buildCarouselVisualDirectionSystemPrompt(): string {
  return withAiFormattingRules(
    [
      "You are Spyreels Visual Director.",
      "You receive an approved semantic carousel plan.",
      "Your job is to choose the most effective visual composition for each slide while treating the carousel as one coherent visual sequence.",
      "Do not rewrite the content.",
      "Do not change slide meaning.",
      "Do not change slide order.",
      "Do not invent new content.",
      "Do not output finished copy.",
      "Do not choose fonts, colors, coordinates, templates or image prompts.",
      "Choose composition based on what each beat needs to communicate.",
    ].join(" ")
  );
}

function formatBeatLine(beat: CarouselPlanningBeat): string {
  const sequence = beat.sequence
    ? JSON.stringify(beat.sequence)
    : "null";
  return [
    `${beat.position}. ${beat.id} | role=${beat.role} | visualIntent=${beat.visualIntent} | sequence=${sequence}`,
    `   objective: ${beat.objective}`,
  ].join("\n");
}

export function buildCarouselVisualDirectionUserPrompt(
  planningIR: CarouselPlanningIR
): string {
  const planningView = {
    topic: planningIR.topic,
    audience: planningIR.audience,
    goal: planningIR.goal,
    strategy: {
      angleType: planningIR.strategy.angleType,
      hook: planningIR.strategy.hook,
      corePromise: planningIR.strategy.corePromise,
      centralInsight: planningIR.strategy.centralInsight,
      preferredFamily: planningIR.strategy.preferredFamily,
      ctaDirection: planningIR.strategy.ctaDirection,
    },
    beats: planningIR.beats.map((beat) => ({
      beatId: beat.id,
      position: beat.position,
      role: beat.role,
      objective: beat.objective,
      visualIntent: beat.visualIntent,
      sequence: beat.sequence,
    })),
  };

  return [
    "Approved semantic carousel plan:",
    `Topic: ${planningIR.topic}`,
    `Audience: ${planningIR.audience}`,
    `Goal: ${planningIR.goal}`,
    "Strategy:",
    `- angleType: ${planningIR.strategy.angleType}`,
    `- hook: ${planningIR.strategy.hook}`,
    `- corePromise: ${planningIR.strategy.corePromise}`,
    `- centralInsight: ${planningIR.strategy.centralInsight}`,
    `- preferredFamily: ${planningIR.strategy.preferredFamily}`,
    `- ctaDirection: ${planningIR.strategy.ctaDirection}`,
    "",
    "Beats:",
    ...planningIR.beats.map(formatBeatLine),
    "",
    "Machine-readable planning view:",
    JSON.stringify(planningView),
    "",
    "Return one decision per beatId. Code will attach position and semanticRole from Planning IR.",
    "Treat the carousel as one sequence. Use purposeful rhythm, not random variety.",
    "Avoid mechanically repeating the same composition when another treatment communicates the idea better.",
    "Repeated compositions are valid when the content genuinely benefits from consistency.",
    "",
    "Planning visualIntent is a strong semantic signal.",
    "timeline stays timeline_flow. comparison stays comparison_split. diagram stays diagram_focus.",
    "checklist stays checklist_stack or framework_grid. data stays data_focus.",
    "photo may use text_visual_split, full_bleed_visual, or story_scene.",
    "text gives more freedom among compatible archetypes.",
    "",
    "Cover: low density. Use text_focus, text_visual_split, full_bleed_visual, or story_scene.",
    "Cover emphasis is headline or visual. Do not force every cover into text_focus.",
    "Closing: archetype closing_focus, emphasis cta, include a cta text region, no sequence region.",
    "Keep closing visually simpler than the body.",
    "",
    "If a beat has sequence metadata, include a sequence text region. Do not output literal 01, 02, or 03.",
    "Planning IR owns sequence.index. Do not flatten problem/solution pairs into list_item.",
    "List items may use number_focus, text_visual_split, comparison_split, timeline_flow, diagram_focus, checklist_stack, or data_focus when justified.",
    "",
    "Text regions are semantic only. No finished copy.",
    "Most slides should use 0 or 1 visual regions. Use multiple only when they improve communication.",
    "Do not create visuals just to fill space.",
    "Do not include template IDs, layout IDs, renderer slots, CSS, coordinates, fonts, colors, image URLs, or image prompts.",
  ].join("\n");
}

export function buildCarouselVisualDirectionRepairNote(issues: string[]): string {
  return [
    "PREVIOUS OUTPUT FAILED VALIDATION. Fix ONLY these structural and compatibility issues and return a full corrected payload.",
    "Do not change Planning IR meaning, beat order, or sequence metadata.",
    ...issues,
  ].join("\n");
}

function tryBuildCompositionIR(
  planningIR: CarouselPlanningIR,
  raw: unknown
):
  | { ok: true; compositionIR: CarouselCompositionIR }
  | { ok: false; issues: string[] } {
  const rawObjects = extractRawDecisionObjects(raw);
  const decisions = normalizeVisualDirectorDecisions(raw);
  const decisionIssues = validateVisualDirectorDecisions(
    planningIR,
    decisions,
    raw
  );
  if (decisionIssues.length > 0) {
    return { ok: false, issues: decisionIssues };
  }
  if (rawObjects.length === 0) {
    return { ok: false, issues: ["Visual Director returned no slide decisions"] };
  }
  try {
    const compositionIR = assembleVisualDirectorCompositionIR({
      planningIR,
      decisions,
    });
    const compositionIssues = validateCarouselCompositionIR(
      compositionIR,
      planningIR
    );
    if (compositionIssues.length > 0) {
      return { ok: false, issues: compositionIssues };
    }
    return { ok: true, compositionIR };
  } catch (error) {
    return {
      ok: false,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }
}

type VisualDirectorInvokeMeta = {
  raw: unknown;
  jsonParsed: boolean;
  emptyContent: boolean;
  finishReason: string | null;
  requestedModel: string;
  actualModel: string | null;
};

function summarizeVisualDirectorDecision(
  decision: CarouselVisualDirectorDecision
): CarouselVisualDirectorDecision {
  return {
    beatId: decision.beatId,
    archetype: decision.archetype,
    emphasis: decision.emphasis,
    density: decision.density,
    textRegions: decision.textRegions.map((region) => ({
      role: region.role,
      priority: region.priority,
    })),
    visualRegions: decision.visualRegions.map((region) => ({
      role: region.role,
      kind: region.kind,
      placement: region.placement,
    })),
  };
}

function collectAttemptDiagnostics(
  planningIR: CarouselPlanningIR,
  raw: unknown
): {
  decisions: CarouselVisualDirectorDecision[];
  rawSlideCount: number;
  visualDirectorIssues: string[];
  compositionIssues: string[];
} {
  const decisions = normalizeVisualDirectorDecisions(raw);
  const rawSlideCount = extractRawDecisionObjects(raw).length;
  const visualDirectorIssues = validateVisualDirectorDecisions(
    planningIR,
    decisions,
    raw
  );
  let compositionIssues: string[] = [];
  if (visualDirectorIssues.length === 0 && rawSlideCount > 0) {
    try {
      const compositionIR = assembleVisualDirectorCompositionIR({
        planningIR,
        decisions,
      });
      compositionIssues = validateCarouselCompositionIR(
        compositionIR,
        planningIR
      );
    } catch (error) {
      compositionIssues = [
        error instanceof Error ? error.message : String(error),
      ];
    }
  }
  return { decisions, rawSlideCount, visualDirectorIssues, compositionIssues };
}

function logVisualDirectorAttempt(args: {
  attempt: number;
  invokeSucceeded: boolean;
  meta?: Partial<VisualDirectorInvokeMeta> & {
    rawSlideCount?: number;
    normalizedCount?: number;
  };
  decisions?: CarouselVisualDirectorDecision[];
  visualDirectorIssues?: string[];
  compositionIssues?: string[];
  invokeError?: string;
}): void {
  console.log(
    "[visualDirector:diag] attempt",
    args.attempt,
    JSON.stringify(
      {
        invokeSucceeded: args.invokeSucceeded,
        requestedModel: args.meta?.requestedModel ?? null,
        actualModel: args.meta?.actualModel ?? null,
        finishReason: args.meta?.finishReason ?? null,
        jsonParsed: args.meta?.jsonParsed ?? null,
        emptyContent: args.meta?.emptyContent ?? null,
        rawSlideCount: args.meta?.rawSlideCount ?? null,
        normalizedDecisionCount: args.meta?.normalizedCount ?? null,
        decisions: (args.decisions ?? []).map(summarizeVisualDirectorDecision),
        visualDirectorIssues: args.visualDirectorIssues ?? [],
        compositionIssues: args.compositionIssues ?? [],
        invokeError: args.invokeError ?? null,
      },
      null,
      2
    )
  );
}

async function invokeVisualDirectorOnce(args: {
  planningIR: CarouselPlanningIR;
  repairNote?: string;
}): Promise<VisualDirectorInvokeMeta> {
  const schema = buildCarouselVisualDirectionJsonSchema();
  const basePrompt = buildCarouselVisualDirectionUserPrompt(args.planningIR);
  const userPrompt = args.repairNote
    ? `${basePrompt}\n\n${args.repairNote}`
    : basePrompt;

  const response = await invokeLLM({
    operation: CAROUSEL_VISUAL_DIRECTION_OPERATION,
    repairIteration: args.repairNote ? 1 : 0,
    messages: [
      {
        role: "system",
        content: buildCarouselVisualDirectionSystemPrompt(),
      },
      {
        role: "user",
        content: userPrompt,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: schema,
    },
  });

  const requestedModel = "claude-sonnet-4-6";
  const actualModel =
    typeof response.model === "string" ? response.model : null;
  const finishReason = response.choices[0]?.finish_reason ?? null;
  const rawText = String(response.choices[0]?.message?.content ?? "");
  if (!rawText.trim()) {
    return {
      raw: { slides: [] },
      jsonParsed: false,
      emptyContent: true,
      finishReason,
      requestedModel,
      actualModel,
    };
  }
  const parsed = parseLlmJson<DecisionsPayload | null>(rawText, null);
  if (parsed == null) {
    return {
      raw: { slides: [] },
      jsonParsed: false,
      emptyContent: false,
      finishReason,
      requestedModel,
      actualModel,
    };
  }
  return {
    raw: parsed,
    jsonParsed: true,
    emptyContent: false,
    finishReason,
    requestedModel,
    actualModel,
  };
}

function fallbackResult(
  planningIR: CarouselPlanningIR,
  attempts: number,
  issues: string[]
): CarouselVisualDirectorResult {
  return {
    compositionIR: compilePlanningIRToBaselineCompositionIR(planningIR),
    source: "baseline_fallback",
    attempts,
    issues: uniqueIssues(issues),
  };
}

/**
 * Choose visual composition for an entire Planning IR.
 * One LLM call, one repair attempt, then deterministic baseline fallback.
 */
export async function generateCarouselVisualDirection(
  planningIR: CarouselPlanningIR
): Promise<CarouselVisualDirectorResult> {
  const issues: string[] = [];
  let attempts = 0;

  try {
    attempts = 1;
    const firstInvoke = await invokeVisualDirectorOnce({ planningIR });
    const firstDiag = collectAttemptDiagnostics(planningIR, firstInvoke.raw);
    logVisualDirectorAttempt({
      attempt: 1,
      invokeSucceeded: true,
      meta: {
        ...firstInvoke,
        rawSlideCount: firstDiag.rawSlideCount,
        normalizedCount: firstDiag.decisions.length,
      },
      decisions: firstDiag.decisions,
      visualDirectorIssues: firstDiag.visualDirectorIssues,
      compositionIssues: firstDiag.compositionIssues,
    });
    const first = tryBuildCompositionIR(planningIR, firstInvoke.raw);
    if (first.ok) {
      return {
        compositionIR: first.compositionIR,
        source: "ai",
        attempts: 1,
        issues: [],
      };
    }
    issues.push(...first.issues);

    attempts = 2;
    const repairInvoke = await invokeVisualDirectorOnce({
      planningIR,
      repairNote: buildCarouselVisualDirectionRepairNote(first.issues),
    });
    const repairDiag = collectAttemptDiagnostics(planningIR, repairInvoke.raw);
    logVisualDirectorAttempt({
      attempt: 2,
      invokeSucceeded: true,
      meta: {
        ...repairInvoke,
        rawSlideCount: repairDiag.rawSlideCount,
        normalizedCount: repairDiag.decisions.length,
      },
      decisions: repairDiag.decisions,
      visualDirectorIssues: repairDiag.visualDirectorIssues,
      compositionIssues: repairDiag.compositionIssues,
    });
    const repaired = tryBuildCompositionIR(planningIR, repairInvoke.raw);
    if (repaired.ok) {
      return {
        compositionIR: repaired.compositionIR,
        source: "ai_repair",
        attempts: 2,
        issues: uniqueIssues(issues),
      };
    }
    issues.push(...repaired.issues);
    return fallbackResult(planningIR, 2, issues);
  } catch (error) {
    const invokeError =
      error instanceof Error ? error.message : String(error);
    logVisualDirectorAttempt({
      attempt: Math.max(attempts, 1),
      invokeSucceeded: false,
      invokeError,
    });
    issues.push(invokeError);
    return fallbackResult(planningIR, Math.max(attempts, 1), issues);
  }
}
