import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  CAROUSEL_RECOMMENDED_VISUALS,
  scoreCarouselCreativeBrief,
  type CarouselCreativeBrief,
  type CarouselSlideRole,
} from "@shared/carouselStudio";
import {
  compileCreativeBriefToPlanningIR,
  type CarouselPlanningBeat,
  type CarouselPlanningIR,
} from "@shared/carouselPlanningIR";
import {
  compilePlanningIRToBaselineCompositionIR,
  validateCarouselCompositionIR,
  type CarouselCompositionIR,
} from "@shared/carouselCompositionIR";
import {
  OPEN_CASH_FLOW_USER_PROMPT,
  cashDrainsRemake67CorrectedBrief,
} from "./fixtures/cashDrainsRemake67";
import { validFiveLeakFiveFixBrief } from "./fixtures/cashLeaksRemake64";

vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../../_core/llm";
import {
  assembleVisualDirectorCompositionIR,
  buildCarouselVisualDirectionJsonSchema,
  buildCarouselVisualDirectionSystemPrompt,
  buildCarouselVisualDirectionUserPrompt,
  compatibleVisualDirectorArchetypes,
  generateCarouselVisualDirection,
  normalizeVisualDirectorDecisions,
  validateVisualDirectorDecisions,
  validateVisualDirectorPlanningCompatibility,
  type CarouselVisualDirectorDecision,
} from "../generateCarouselVisualDirection";

const mockedInvokeLLM = vi.mocked(invokeLLM);

const VISUAL_DIRECTOR_SOURCE = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../generateCarouselVisualDirection.ts"
  ),
  "utf8"
);

const OLD_TEMPLATE_IDS = [
  "hook_bold_center",
  "list_item_numbered",
  "cta_bold_center",
  "list_item_warm_numbered",
  "hook_photo_top",
];

function sampleOutline(
  roles: CarouselSlideRole[]
): CarouselCreativeBrief["slideOutline"] {
  return roles.map((role, index) => ({
    position: index + 1,
    role,
    objective: `${role} beat ${index + 1}`,
    recommendedVisual: "text" as const,
    listItemIndex: null,
  }));
}

function sampleBrief(
  overrides: Partial<CarouselCreativeBrief> = {}
): CarouselCreativeBrief {
  const estimatedSlideCount = overrides.estimatedSlideCount ?? 5;
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: overrides.id ?? "brief_visual_director",
    kicker: overrides.kicker ?? "Diagnostic",
    title: overrides.title ?? "Cash is a system",
    description: overrides.description ?? "Show why cash runs out before profit.",
    estimatedSlideCount,
    topic: overrides.topic ?? "small business cash flow",
    inferredAudience: overrides.inferredAudience ?? "small business owners",
    audienceReasoning:
      overrides.audienceReasoning ?? "The source names this audience.",
    contentGoal: overrides.contentGoal ?? "education",
    contentFormat: overrides.contentFormat ?? "breakdown",
    angleType: overrides.angleType ?? "diagnostic",
    hook: overrides.hook ?? "Profit on paper, empty in the bank.",
    corePromise:
      overrides.corePromise ?? "See the cash timing gaps before they compound.",
    centralInsight:
      overrides.centralInsight ?? "Cash timing is the silent killer.",
    keyPoints: overrides.keyPoints ?? [
      { title: "Timing", explanation: "Money leaves first.", purpose: "Name the gap." },
      { title: "Receivables", explanation: "Unpaid invoices hide.", purpose: "Show a leak." },
      { title: "Inventory", explanation: "Stock can trap cash.", purpose: "Show a second leak." },
      { title: "Check", explanation: "A weekly review helps.", purpose: "Give a next step." },
    ],
    slideOutline:
      overrides.slideOutline ??
      sampleOutline(["hook", "problem", "insight", "example", "cta"]),
    layoutFamily: overrides.layoutFamily ?? "breakdown",
    visualDirection: overrides.visualDirection ?? "Simple numbered cards.",
    imageDirection: overrides.imageDirection ?? "Neutral desk photos.",
    claimRisk: overrides.claimRisk ?? "medium",
    researchMode: overrides.researchMode ?? "claim_verification",
    evidenceRequirements: overrides.evidenceRequirements ?? ["Verify cash-cycle claims"],
    prohibitedClaims: overrides.prohibitedClaims ?? ["Guaranteed profit in 30 days"],
    ctaDirection: overrides.ctaDirection ?? "Save this cash-check list",
    scores:
      overrides.scores ??
      scoreCarouselCreativeBrief({
        relevance: 80,
        usefulness: 70,
        specificity: 60,
        visualPotential: 50,
        factualSafety: 90,
        originality: 40,
      }),
    confidence: overrides.confidence ?? 0.8,
    ...overrides,
  };
}

function storyBrief(): CarouselCreativeBrief {
  return sampleBrief({
    title: "The night the till went quiet",
    hook: "The night the till went quiet.",
    corePromise: "Walk owners through one cash-crisis night.",
    contentFormat: "story",
    layoutFamily: "story",
    angleType: "story",
    estimatedSlideCount: 6,
    slideOutline: [
      {
        position: 1,
        role: "hook",
        objective: "Open on the quiet till.",
        recommendedVisual: "photo",
        listItemIndex: null,
      },
      {
        position: 2,
        role: "context",
        objective: "Set the night.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      {
        position: 3,
        role: "problem",
        objective: "Show the cash gap.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      {
        position: 4,
        role: "insight",
        objective: "Name the missed signal.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      {
        position: 5,
        role: "example",
        objective: "Replay the closing hour.",
        recommendedVisual: "photo",
        listItemIndex: null,
      },
      {
        position: 6,
        role: "cta",
        objective: "Ask them to check tonight.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
    ],
  });
}

const COVER_SAFE_ARCHETYPES = new Set([
  "text_focus",
  "text_visual_split",
  "full_bleed_visual",
  "story_scene",
]);
const LIST_ITEM_SAFE_ARCHETYPES = new Set([
  "number_focus",
  "text_visual_split",
  "comparison_split",
  "timeline_flow",
  "diagram_focus",
  "checklist_stack",
  "data_focus",
]);

function sampleBeat(
  overrides: Partial<CarouselPlanningBeat> = {}
): CarouselPlanningBeat {
  return {
    id: "beat_01",
    position: 1,
    role: "insight",
    objective: "Show the cash gap.",
    visualIntent: "text",
    sequence: null,
    ...overrides,
  };
}

function planningFromBrief(
  brief: CarouselCreativeBrief,
  sourceContent: string = OPEN_CASH_FLOW_USER_PROMPT
): CarouselPlanningIR {
  return compileCreativeBriefToPlanningIR({ brief, sourceContent });
}

function clonePlanning(planningIR: CarouselPlanningIR): CarouselPlanningIR {
  return JSON.parse(JSON.stringify(planningIR)) as CarouselPlanningIR;
}

function decisionsFromComposition(
  compositionIR: CarouselCompositionIR
): CarouselVisualDirectorDecision[] {
  return compositionIR.slides.map((slide) => ({
    beatId: slide.beatId,
    archetype: slide.archetype,
    emphasis: slide.emphasis,
    density: slide.density,
    textRegions: slide.textRegions.map((region) => ({ ...region })),
    visualRegions: slide.visualRegions.map((region) => ({ ...region })),
  }));
}

function baselineDecisions(
  planningIR: CarouselPlanningIR
): CarouselVisualDirectorDecision[] {
  return decisionsFromComposition(
    compilePlanningIRToBaselineCompositionIR(planningIR)
  );
}

function remake67StrongDecisions(
  planningIR: CarouselPlanningIR
): CarouselVisualDirectorDecision[] {
  const byId = Object.fromEntries(planningIR.beats.map((beat) => [beat.id, beat]));
  const cover = {
    beatId: "beat_01",
    archetype: "text_visual_split" as const,
    emphasis: "visual" as const,
    density: "low" as const,
    textRegions: [
      { role: "kicker" as const, priority: "secondary" as const },
      { role: "headline" as const, priority: "primary" as const },
      { role: "body" as const, priority: "tertiary" as const },
    ],
    visualRegions: [
      { role: "supporting" as const, kind: "photo" as const, placement: "right" as const },
    ],
  };
  const body: CarouselVisualDirectorDecision[] = [
    {
      beatId: "beat_02",
      archetype: "comparison_split",
      emphasis: "comparison",
      density: "medium",
      textRegions: [
        { role: "sequence", priority: "secondary" },
        { role: "headline", priority: "primary" },
        { role: "body", priority: "tertiary" },
      ],
      visualRegions: [
        { role: "primary", kind: "comparison", placement: "split" },
      ],
    },
    {
      beatId: "beat_03",
      archetype: "number_focus",
      emphasis: "sequence",
      density: "low",
      textRegions: [
        { role: "sequence", priority: "primary" },
        { role: "headline", priority: "secondary" },
        { role: "body", priority: "tertiary" },
      ],
      visualRegions: [],
    },
    {
      beatId: "beat_04",
      archetype: "diagram_focus",
      emphasis: "headline",
      density: "medium",
      textRegions: [
        { role: "sequence", priority: "secondary" },
        { role: "headline", priority: "primary" },
        { role: "body", priority: "tertiary" },
      ],
      visualRegions: [
        { role: "primary", kind: "diagram", placement: "center" },
      ],
    },
    {
      beatId: "beat_05",
      archetype: "timeline_flow",
      emphasis: "headline",
      density: "medium",
      textRegions: [
        { role: "sequence", priority: "secondary" },
        { role: "headline", priority: "primary" },
        { role: "body", priority: "tertiary" },
      ],
      visualRegions: [
        { role: "primary", kind: "timeline", placement: "center" },
      ],
    },
    {
      beatId: "beat_06",
      archetype: "text_visual_split",
      emphasis: "visual",
      density: "medium",
      textRegions: [
        { role: "sequence", priority: "secondary" },
        { role: "headline", priority: "primary" },
        { role: "body", priority: "tertiary" },
      ],
      visualRegions: [
        { role: "supporting", kind: "photo", placement: "right" },
      ],
    },
    {
      beatId: "beat_07",
      archetype: "number_focus",
      emphasis: "sequence",
      density: "low",
      textRegions: [
        { role: "sequence", priority: "primary" },
        { role: "headline", priority: "secondary" },
        { role: "body", priority: "tertiary" },
      ],
      visualRegions: [],
    },
  ];
  const closing = {
    beatId: "beat_08",
    archetype: "closing_focus" as const,
    emphasis: "cta" as const,
    density: "low" as const,
    textRegions: [
      { role: "headline" as const, priority: "secondary" as const },
      { role: "cta" as const, priority: "primary" as const },
    ],
    visualRegions: [],
  };
  const decisions = [cover, ...body, closing];
  expect(decisions.map((decision) => decision.beatId)).toEqual(
    planningIR.beats.map((beat) => beat.id)
  );
  expect(byId.beat_02?.visualIntent).toBe("comparison");
  return decisions;
}

function llmResult(slides: unknown[], raw?: string) {
  return {
    id: "msg_visual_director",
    created: 0,
    model: "claude-sonnet-4-6",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as const,
          content: raw ?? JSON.stringify({ slides }),
        },
        finish_reason: "stop",
      },
    ],
  };
}

function regionRoles(slide: CarouselCompositionIR["slides"][number]): string[] {
  return slide.textRegions.map((region) => region.role);
}

function walkMinMaxItems(value: unknown, path: string, found: string[]): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkMinMaxItems(item, `${path}[${index}]`, found));
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.minItems === "number") {
    found.push(`${path}.minItems=${record.minItems}`);
  }
  if (typeof record.maxItems === "number") {
    found.push(`${path}.maxItems=${record.maxItems}`);
  }
  for (const [key, child] of Object.entries(record)) {
    walkMinMaxItems(child, `${path}.${key}`, found);
  }
}

describe("generateCarouselVisualDirection module boundary", () => {
  it("does not import remake, renderer, or old template IDs", () => {
    expect(VISUAL_DIRECTOR_SOURCE).not.toMatch(
      /from ["'][^"']*generateCarouselRemake["']/
    );
    expect(VISUAL_DIRECTOR_SOURCE).not.toMatch(
      /from ["'][^"']*carouselTemplates["']/
    );
    for (const templateId of OLD_TEMPLATE_IDS) {
      expect(VISUAL_DIRECTOR_SOURCE).not.toContain(templateId);
    }
  });
});

describe("Visual Director provider schema", () => {
  const schema = buildCarouselVisualDirectionJsonSchema();

  it("uses enum + required + additionalProperties false without minItems or maxItems", () => {
    expect(schema.name).toBe("carousel_visual_direction");
    expect(schema.strict).toBe(true);
    expect(schema.schema.additionalProperties).toBe(false);
    expect(schema.schema.required).toEqual(["slides"]);
    const slides = (
      schema.schema.properties as {
        slides: {
          minItems?: number;
          maxItems?: number;
          items: {
            required: string[];
            additionalProperties: boolean;
            properties: Record<string, unknown>;
          };
        };
      }
    ).slides;
    expect(slides.items.required).toEqual([
      "beatId",
      "archetype",
      "emphasis",
      "density",
      "textRegions",
      "visualRegions",
    ]);
    expect(slides.items.additionalProperties).toBe(false);
    expect(slides.items.properties).not.toHaveProperty("position");
    expect(slides.items.properties).not.toHaveProperty("semanticRole");
    expect(slides.items.properties).not.toHaveProperty("templateId");
    expect(slides.items.properties).not.toHaveProperty("layoutId");
    const unsupported: string[] = [];
    walkMinMaxItems(schema.schema, "schema", unsupported);
    expect(unsupported).toEqual([]);
  });
});

describe("Visual Director prompt", () => {
  it("sends planning data and withholds templates, slots, and CSS", () => {
    const planningIR = planningFromBrief(cashDrainsRemake67CorrectedBrief());
    const system = buildCarouselVisualDirectionSystemPrompt();
    const user = buildCarouselVisualDirectionUserPrompt(planningIR);

    expect(system).toContain("You are Spyreels Visual Director.");
    expect(system).toContain("Do not output finished copy.");
    expect(user).toContain(planningIR.topic);
    expect(user).toContain(planningIR.audience);
    expect(user).toContain(planningIR.goal);
    expect(user).toContain(planningIR.strategy.hook);
    expect(user).toContain("beat_01");
    expect(user).toContain("visualIntent=");
    expect(user).toContain("sequence=");
    expect(user).toContain("role=cover");
    expect(user.toLowerCase()).not.toContain("researchmode");
    expect(user).not.toMatch(/templateId|layoutId|slotId|fontSize|imagePrompt/);
    expect(user).not.toMatch(/#[0-9a-fA-F]{3,8}|font-family:|width:\s*\d/);
    for (const templateId of OLD_TEMPLATE_IDS) {
      expect(system).not.toContain(templateId);
      expect(user).not.toContain(templateId);
    }
  });
});

describe("assembleVisualDirectorCompositionIR", () => {
  it("uses Planning IR order and ignores model decision order", () => {
    const planningIR = planningFromBrief(cashDrainsRemake67CorrectedBrief());
    const decisions = remake67StrongDecisions(planningIR).slice().reverse();
    const compositionIR = assembleVisualDirectorCompositionIR({
      planningIR,
      decisions,
    });
    expect(compositionIR.slides.map((slide) => slide.beatId)).toEqual(
      planningIR.beats.map((beat) => beat.id)
    );
    expect(compositionIR.slides.map((slide) => slide.position)).toEqual(
      planningIR.beats.map((beat) => beat.position)
    );
    expect(compositionIR.slides.map((slide) => slide.semanticRole)).toEqual(
      planningIR.beats.map((beat) => beat.role)
    );
    expect(compositionIR.planningVersion).toBe(planningIR.version);
  });

  it("rejects unknown, duplicate, and missing beats", () => {
    const planningIR = planningFromBrief(cashDrainsRemake67CorrectedBrief());
    const valid = remake67StrongDecisions(planningIR);

    expect(() =>
      assembleVisualDirectorCompositionIR({
        planningIR,
        decisions: valid.map((decision, index) =>
          index === 0 ? { ...decision, beatId: "beat_99" } : decision
        ),
      })
    ).toThrow(/Unknown Visual Director beatId beat_99|Missing Visual Director decision/);

    expect(() =>
      assembleVisualDirectorCompositionIR({
        planningIR,
        decisions: [...valid.slice(0, 7), { ...valid[1]!, beatId: "beat_02" }],
      })
    ).toThrow(/unique|Missing/);

    expect(() =>
      assembleVisualDirectorCompositionIR({
        planningIR,
        decisions: valid.slice(0, 7),
      })
    ).toThrow(/exactly one decision|Missing/);
  });
});

describe("Remake 67 Visual Director", () => {
  beforeEach(() => {
    mockedInvokeLLM.mockReset();
  });

  it("assembles varied AI treatments without changing Planning IR fields", async () => {
    const planningIR = planningFromBrief(cashDrainsRemake67CorrectedBrief());
    const before = clonePlanning(planningIR);
    const decisions = remake67StrongDecisions(planningIR);
    mockedInvokeLLM.mockResolvedValueOnce(llmResult(decisions));

    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("ai");
    expect(result.attempts).toBe(1);
    expect(result.issues).toEqual([]);
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
    expect(mockedInvokeLLM.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({
        operation: "carousel_visual_direction",
        repairIteration: 0,
      })
    );

    const { compositionIR } = result;
    expect(compositionIR.slides).toHaveLength(8);
    expect(compositionIR.slides.map((slide) => slide.beatId)).toEqual(
      planningIR.beats.map((beat) => beat.id)
    );
    expect(compositionIR.slides.map((slide) => slide.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(compositionIR.slides.map((slide) => slide.semanticRole)).toEqual(
      planningIR.beats.map((beat) => beat.role)
    );
    expect(compositionIR.slides.map((slide) => slide.archetype)).toEqual([
      "text_visual_split",
      "comparison_split",
      "number_focus",
      "diagram_focus",
      "timeline_flow",
      "text_visual_split",
      "number_focus",
      "closing_focus",
    ]);
    expect(compositionIR.slides[0]?.density).toBe("low");
    expect(compositionIR.slides[0]?.emphasis).toBe("visual");
    expect(compositionIR.slides[7]?.emphasis).toBe("cta");
    expect(regionRoles(compositionIR.slides[0]!)).not.toContain("sequence");
    expect(regionRoles(compositionIR.slides[7]!)).not.toContain("sequence");
    expect(regionRoles(compositionIR.slides[7]!)).toContain("cta");
    expect(
      compositionIR.slides.filter((slide) => regionRoles(slide).includes("sequence"))
    ).toHaveLength(6);
    expect(JSON.stringify(compositionIR)).not.toMatch(/"0[1-9]"/);
    expect(JSON.stringify(decisions)).not.toMatch(/"0[1-9]"/);
    expect(validateCarouselCompositionIR(compositionIR, planningIR)).toEqual([]);
    expect(planningIR).toEqual(before);
    expect(planningIR.beats.map((beat) => beat.role)).toEqual(
      before.beats.map((beat) => beat.role)
    );
    expect(planningIR.beats.map((beat) => beat.sequence)).toEqual(
      before.beats.map((beat) => beat.sequence)
    );
  });
});

describe("Remake 64 Visual Director paired protection", () => {
  beforeEach(() => {
    mockedInvokeLLM.mockReset();
  });

  it("preserves problem/solution roles and sequence through assembly", async () => {
    const planningIR = planningFromBrief(validFiveLeakFiveFixBrief());
    const before = clonePlanning(planningIR);
    const decisions = baselineDecisions(planningIR);
    mockedInvokeLLM.mockResolvedValueOnce(llmResult(decisions));

    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("ai");
    expect(result.compositionIR.slides).toHaveLength(12);
    expect(result.compositionIR.slides.map((slide) => slide.semanticRole)).toEqual([
      "cover",
      "problem",
      "solution",
      "problem",
      "solution",
      "problem",
      "solution",
      "problem",
      "solution",
      "problem",
      "solution",
      "closing",
    ]);
    expect(
      result.compositionIR.slides.filter((slide) => slide.semanticRole === "list_item")
    ).toHaveLength(0);
    expect(
      result.compositionIR.slides.filter((slide) =>
        regionRoles(slide).includes("sequence")
      )
    ).toHaveLength(10);
    expect(JSON.stringify(result.compositionIR)).not.toMatch(/Leak 1|Fix 1/);
    expect(validateCarouselCompositionIR(result.compositionIR, planningIR)).toEqual(
      []
    );
    expect(planningIR).toEqual(before);
  });

  it("does not mutate Planning IR when paired decisions are invalid", async () => {
    const planningIR = planningFromBrief(validFiveLeakFiveFixBrief());
    const before = clonePlanning(planningIR);
    const invalid = baselineDecisions(planningIR).map((decision) => ({
      ...decision,
      textRegions: decision.textRegions.filter((region) => region.role !== "sequence"),
      archetype: "number_focus" as const,
      visualRegions: [],
    }));
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult(invalid))
      .mockResolvedValueOnce(llmResult(invalid));

    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("baseline_fallback");
    expect(result.attempts).toBe(2);
    expect(planningIR).toEqual(before);
    expect(planningIR.beats.map((beat) => beat.role)).toEqual(
      before.beats.map((beat) => beat.role)
    );
    expect(planningIR.beats.some((beat) => beat.sequence?.kind === "problem_solution")).toBe(
      true
    );
    expect(result.compositionIR.slides.map((slide) => slide.semanticRole)).toEqual(
      before.beats.map((beat) => beat.role)
    );
  });
});

describe("Visual Director failure handling", () => {
  let planningIR: CarouselPlanningIR;
  let valid: CarouselVisualDirectorDecision[];

  beforeEach(() => {
    mockedInvokeLLM.mockReset();
    planningIR = planningFromBrief(cashDrainsRemake67CorrectedBrief());
    valid = remake67StrongDecisions(planningIR);
  });

  it("A. uses the first valid response as ai", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(llmResult(valid));
    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("ai");
    expect(result.attempts).toBe(1);
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
  });

  it("B. repairs an invalid first response", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult(valid.slice(0, 7)))
      .mockResolvedValueOnce(llmResult(valid));
    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("ai_repair");
    expect(result.attempts).toBe(2);
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(2);
    expect(mockedInvokeLLM.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        operation: "carousel_visual_direction",
        repairIteration: 1,
      })
    );
    expect(result.issues.length).toBeGreaterThan(0);
    expect(validateCarouselCompositionIR(result.compositionIR, planningIR)).toEqual(
      []
    );
  });

  it("C. falls back when first and repair are invalid", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult(valid.slice(0, 6)))
      .mockResolvedValueOnce(llmResult(valid.slice(0, 5)));
    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("baseline_fallback");
    expect(result.attempts).toBe(2);
    expect(result.compositionIR).toEqual(
      compilePlanningIRToBaselineCompositionIR(planningIR)
    );
  });

  it("D. falls back when the provider throws", async () => {
    mockedInvokeLLM.mockRejectedValueOnce(new Error("provider unavailable"));
    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("baseline_fallback");
    expect(result.attempts).toBe(1);
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
    expect(result.issues.some((issue) => /provider unavailable/.test(issue))).toBe(
      true
    );
  });

  it("E. falls back after malformed JSON uses the repair path", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult([], "not-json{{"))
      .mockResolvedValueOnce(llmResult([], "{broken"));
    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("baseline_fallback");
    expect(result.attempts).toBe(2);
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(2);
  });

  it("F. repairs an unknown beat ID", async () => {
    const unknown = valid.map((decision, index) =>
      index === 2 ? { ...decision, beatId: "beat_99" } : decision
    );
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult(unknown))
      .mockResolvedValueOnce(llmResult(valid));
    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("ai_repair");
    expect(result.attempts).toBe(2);
    expect(result.issues.some((issue) => /Unknown Visual Director beatId/.test(issue))).toBe(
      true
    );
  });

  it("G. falls back after a duplicate beat survives repair", async () => {
    const duplicate = [...valid.slice(0, 7), { ...valid[1]!, beatId: "beat_02" }];
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult(duplicate))
      .mockResolvedValueOnce(llmResult(duplicate));
    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("baseline_fallback");
    expect(result.issues.some((issue) => /unique/.test(issue))).toBe(true);
  });

  it("H. repairs a missing beat", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult(valid.slice(1)))
      .mockResolvedValueOnce(llmResult(valid));
    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("ai_repair");
    expect(result.issues.some((issue) => /Missing Visual Director decision/.test(issue))).toBe(
      true
    );
  });

  it("I. rejects renderer-specific properties", async () => {
    const leaked = valid.map((decision, index) =>
      index === 0
        ? {
            ...decision,
            layoutId: "hook_bold_center",
            templateId: "photo_story_v2",
          }
        : decision
    );
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult(leaked))
      .mockResolvedValueOnce(llmResult(leaked));
    const issues = validateVisualDirectorDecisions(
      planningIR,
      normalizeVisualDirectorDecisions({ slides: leaked }),
      leaked
    );
    expect(issues.some((issue) => /layoutId/.test(issue))).toBe(true);
    expect(issues.some((issue) => /templateId/.test(issue))).toBe(true);

    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("baseline_fallback");
    expect(result.issues.some((issue) => /renderer or template specific/.test(issue))).toBe(
      true
    );
  });
});

describe("Visual Director non-list formats", () => {
  beforeEach(() => {
    mockedInvokeLLM.mockReset();
  });

  async function expectOpenFormat(brief: CarouselCreativeBrief) {
    const planningIR = planningFromBrief(brief);
    expect(planningIR.contract.count).toBeNull();
    expect(planningIR.contract.itemType).toBeNull();
    expect(planningIR.beats.every((beat) => beat.sequence == null)).toBe(true);
    mockedInvokeLLM.mockResolvedValueOnce(llmResult(baselineDecisions(planningIR)));
    const result = await generateCarouselVisualDirection(planningIR);
    expect(result.source).toBe("ai");
    expect(result.compositionIR.slides).toHaveLength(planningIR.beats.length);
    expect(
      result.compositionIR.slides.every(
        (slide) => !regionRoles(slide).includes("sequence")
      )
    ).toBe(true);
    expect(validateCarouselCompositionIR(result.compositionIR, planningIR)).toEqual(
      []
    );
    return result;
  }

  it("directs a story carousel without list sequence", async () => {
    const result = await expectOpenFormat(storyBrief());
    expect(result.compositionIR.slides[0]?.archetype).toBe("text_visual_split");
    expect(result.compositionIR.slides.at(-1)?.archetype).toBe("closing_focus");
  });

  it("directs a comparison carousel without a promised count", async () => {
    const result = await expectOpenFormat(
      sampleBrief({
        title: "Profit versus cash on the same week",
        hook: "Profit versus cash on the same week.",
        corePromise: "Show the difference between profit and cash.",
        contentFormat: "comparison",
        layoutFamily: "comparison",
        estimatedSlideCount: 5,
        slideOutline: sampleOutline([
          "hook",
          "comparison",
          "insight",
          "comparison",
          "cta",
        ]),
      })
    );
    expect(result.compositionIR.slides[1]?.archetype).toBe("comparison_split");
    expect(result.compositionIR.slides[3]?.archetype).toBe("comparison_split");
  });

  it("directs a framework carousel without a list contract", async () => {
    const result = await expectOpenFormat(
      sampleBrief({
        title: "A weekly cash check owners can repeat",
        hook: "A weekly cash check owners can repeat.",
        corePromise: "Give owners a weekly cash check they can run every Monday.",
        contentFormat: "framework",
        layoutFamily: "framework",
        estimatedSlideCount: 5,
        slideOutline: sampleOutline([
          "hook",
          "framework",
          "insight",
          "framework",
          "cta",
        ]),
      })
    );
    expect(result.compositionIR.slides[1]?.archetype).toBe("framework_grid");
    expect(result.compositionIR.slides[3]?.archetype).toBe("framework_grid");
  });

  it("directs a roadmap carousel from timeline intent without inventing item numbers", async () => {
    const result = await expectOpenFormat(
      sampleBrief({
        title: "Ninety days to a cash buffer",
        hook: "Ninety days to a cash buffer.",
        corePromise: "Show a three month cash buffer path.",
        contentFormat: "roadmap",
        layoutFamily: "roadmap",
        estimatedSlideCount: 5,
        slideOutline: [
          {
            position: 1,
            role: "hook",
            objective: "Promise a ninety day buffer path.",
            recommendedVisual: "text",
            listItemIndex: null,
          },
          {
            position: 2,
            role: "context",
            objective: "Name the starting cash gap.",
            recommendedVisual: "timeline",
            listItemIndex: null,
          },
          {
            position: 3,
            role: "insight",
            objective: "Show the midpoint check.",
            recommendedVisual: "timeline",
            listItemIndex: null,
          },
          {
            position: 4,
            role: "example",
            objective: "Show the final buffer week.",
            recommendedVisual: "data",
            listItemIndex: null,
          },
          {
            position: 5,
            role: "cta",
            objective: "Ask them to start week one.",
            recommendedVisual: "text",
            listItemIndex: null,
          },
        ],
      })
    );
    expect(result.compositionIR.slides[1]?.archetype).toBe("timeline_flow");
    expect(result.compositionIR.slides[2]?.archetype).toBe("timeline_flow");
    expect(result.compositionIR.slides[3]?.archetype).toBe("data_focus");
  });

  it("directs an open breakdown without inventing sequence regions", async () => {
    const result = await expectOpenFormat(sampleBrief());
    expect(result.compositionIR.slides.map((slide) => slide.semanticRole)).toEqual([
      "cover",
      "problem",
      "insight",
      "example",
      "closing",
    ]);
  });
});

describe("Visual Director role-bound archetypes", () => {
  it("does not accept timeline_flow on a cover with timeline visualIntent", () => {
    const beat = sampleBeat({ role: "cover", visualIntent: "timeline" });
    const allowed = compatibleVisualDirectorArchetypes(beat);
    expect(allowed).not.toBeNull();
    expect(allowed!.has("timeline_flow")).toBe(false);
    for (const archetype of allowed!) {
      expect(COVER_SAFE_ARCHETYPES.has(archetype)).toBe(true);
    }
    expect(
      validateVisualDirectorPlanningCompatibility(beat, {
        archetype: "timeline_flow",
      })
    ).not.toEqual([]);

    const planningIR = planningFromBrief(cashDrainsRemake67CorrectedBrief());
    const decisions = remake67StrongDecisions(planningIR).map((decision, index) =>
      index === 0 ? { ...decision, archetype: "timeline_flow" as const } : decision
    );
    const issues = validateVisualDirectorDecisions(planningIR, decisions);
    expect(
      issues.some((issue) => /must use a cover-safe archetype/.test(issue))
    ).toBe(true);
  });

  it("does not accept diagram_focus on a cover with diagram visualIntent", () => {
    const beat = sampleBeat({ role: "cover", visualIntent: "diagram" });
    const allowed = compatibleVisualDirectorArchetypes(beat);
    expect(allowed).not.toBeNull();
    expect(allowed!.has("diagram_focus")).toBe(false);
    for (const archetype of allowed!) {
      expect(COVER_SAFE_ARCHETYPES.has(archetype)).toBe(true);
    }
    expect(
      validateVisualDirectorPlanningCompatibility(beat, {
        archetype: "diagram_focus",
      })
    ).not.toEqual([]);
  });

  it("allows photo-compatible cover archetypes when visualIntent is photo", () => {
    const beat = sampleBeat({ role: "cover", visualIntent: "photo" });
    const allowed = compatibleVisualDirectorArchetypes(beat);
    expect(allowed).not.toBeNull();
    expect([...allowed!].sort()).toEqual(
      ["full_bleed_visual", "story_scene", "text_visual_split"].sort()
    );
    for (const archetype of [
      "text_visual_split",
      "full_bleed_visual",
      "story_scene",
    ] as const) {
      expect(
        validateVisualDirectorPlanningCompatibility(beat, { archetype })
      ).toEqual([]);
    }
  });

  it("still requires timeline_flow on a normal body timeline beat", () => {
    const beat = sampleBeat({ role: "insight", visualIntent: "timeline" });
    const allowed = compatibleVisualDirectorArchetypes(beat);
    expect(allowed).not.toBeNull();
    expect([...allowed!]).toEqual(["timeline_flow"]);
    expect(
      validateVisualDirectorPlanningCompatibility(beat, {
        archetype: "timeline_flow",
      })
    ).toEqual([]);
    expect(
      validateVisualDirectorPlanningCompatibility(beat, {
        archetype: "text_focus",
      })
    ).not.toEqual([]);
  });

  it("still requires diagram_focus on a normal body diagram beat", () => {
    const beat = sampleBeat({ role: "insight", visualIntent: "diagram" });
    const allowed = compatibleVisualDirectorArchetypes(beat);
    expect(allowed).not.toBeNull();
    expect([...allowed!]).toEqual(["diagram_focus"]);
    expect(
      validateVisualDirectorPlanningCompatibility(beat, {
        archetype: "diagram_focus",
      })
    ).toEqual([]);
    expect(
      validateVisualDirectorPlanningCompatibility(beat, {
        archetype: "text_focus",
      })
    ).not.toEqual([]);
  });

  it("never lets list_item escape LIST_ITEM archetypes", () => {
    for (const visualIntent of CAROUSEL_RECOMMENDED_VISUALS) {
      const beat = sampleBeat({
        role: "list_item",
        visualIntent,
        sequence: { kind: "list", index: 1 },
      });
      const allowed = compatibleVisualDirectorArchetypes(beat);
      if (!allowed) continue;
      for (const archetype of allowed) {
        expect(LIST_ITEM_SAFE_ARCHETYPES.has(archetype)).toBe(true);
      }
    }

    const photoBeat = sampleBeat({
      role: "list_item",
      visualIntent: "photo",
      sequence: { kind: "list", index: 1 },
    });
    const photoAllowed = compatibleVisualDirectorArchetypes(photoBeat);
    expect(photoAllowed).not.toBeNull();
    expect(photoAllowed!.has("text_visual_split")).toBe(true);
    expect(photoAllowed!.has("full_bleed_visual")).toBe(false);
    expect(photoAllowed!.has("story_scene")).toBe(false);
  });
});

describe("Visual Director locked planning fields", () => {
  it("cannot change Planning IR meaning through extra decision fields", () => {
    const planningIR = planningFromBrief(validFiveLeakFiveFixBrief());
    const before = clonePlanning(planningIR);
    const decisions = baselineDecisions(planningIR).map((decision, index) =>
      index === 1
        ? {
            ...decision,
            semanticRole: "list_item",
            position: 99,
            sequence: { kind: "list", index: 1 },
          }
        : decision
    );
    const issues = validateVisualDirectorDecisions(
      planningIR,
      normalizeVisualDirectorDecisions({ slides: decisions }),
      decisions
    );
    expect(issues.some((issue) => /locked Planning IR field/.test(issue))).toBe(
      true
    );
    const assembled = assembleVisualDirectorCompositionIR({
      planningIR,
      decisions: baselineDecisions(planningIR),
    });
    expect(assembled.slides[1]?.semanticRole).toBe("problem");
    expect(assembled.slides[1]?.position).toBe(2);
    expect(planningIR).toEqual(before);
  });
});
