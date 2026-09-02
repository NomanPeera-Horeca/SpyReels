import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  scoreCarouselCreativeBrief,
  type CarouselCreativeBrief,
  type CarouselSlideRole,
} from "./carouselStudio";
import {
  compileCreativeBriefToPlanningIR,
  type CarouselPlanningIR,
} from "./carouselPlanningIR";
import {
  CAROUSEL_COMPOSITION_ARCHETYPES,
  CAROUSEL_COMPOSITION_IR_VERSION,
  FORBIDDEN_CAROUSEL_COMPOSITION_IR_KEYS,
  compilePlanningIRToBaselineCompositionIR,
  describeCarouselArchetypeVisualContract,
  validateCarouselArchetypeVisualRegions,
  validateCarouselCompositionIR,
  type CarouselCompositionIR,
  type CarouselCompositionVisualRegion,
} from "./carouselCompositionIR";
import {
  OPEN_CASH_FLOW_USER_PROMPT,
  cashDrainsRemake67CorrectedBrief,
} from "../server/carousel/tests/fixtures/cashDrainsRemake67";
import { validFiveLeakFiveFixBrief } from "../server/carousel/tests/fixtures/cashLeaksRemake64";

const COMPOSITION_MODULE_SOURCE = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "carouselCompositionIR.ts"),
  "utf8"
);

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
    id: overrides.id ?? "brief_composition",
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

function planningFromBrief(
  brief: CarouselCreativeBrief,
  sourceContent: string = OPEN_CASH_FLOW_USER_PROMPT
): CarouselPlanningIR {
  return compileCreativeBriefToPlanningIR({ brief, sourceContent });
}

function compileValid(brief: CarouselCreativeBrief): {
  planningIR: CarouselPlanningIR;
  compositionIR: CarouselCompositionIR;
} {
  const planningIR = planningFromBrief(brief);
  const compositionIR = compilePlanningIRToBaselineCompositionIR(planningIR);
  return { planningIR, compositionIR };
}

function regionRoles(slide: CarouselCompositionIR["slides"][number]): string[] {
  return slide.textRegions.map((region) => region.role);
}

describe("carouselCompositionIR module boundary", () => {
  it("does not import templates or layout IDs", () => {
    expect(COMPOSITION_MODULE_SOURCE).not.toMatch(
      /from ["'][^"']*carouselTemplates["']/
    );
    expect(COMPOSITION_MODULE_SOURCE).not.toMatch(
      /import\s*\{[^}]*\b(?:CarouselTemplate|CarouselLayoutId)\b/
    );
    expect(COMPOSITION_MODULE_SOURCE).not.toMatch(/generateCarouselRemake/);
    expect(CAROUSEL_COMPOSITION_ARCHETYPES).not.toContain("photo_story_v2");
  });
});

describe("compilePlanningIRToBaselineCompositionIR", () => {
  it("is deterministic and template agnostic", () => {
    const planningIR = planningFromBrief(cashDrainsRemake67CorrectedBrief());
    const first = compilePlanningIRToBaselineCompositionIR(planningIR);
    const second = compilePlanningIRToBaselineCompositionIR(planningIR);
    expect(first).toEqual(second);
    expect(JSON.stringify(first)).not.toMatch(
      /templateId|layoutId|carouselLayoutId|slide_0|fontSize|imageUrl|gptPrompt/
    );
    const leaked = FORBIDDEN_CAROUSEL_COMPOSITION_IR_KEYS.filter((key) =>
      Object.prototype.hasOwnProperty.call(first, key)
    );
    expect(leaked).toEqual([]);
    expect("mode" in first).toBe(false);
    expect(validateCarouselCompositionIR(first, planningIR)).toEqual([]);
  });

  it("maps remake 67 into eight composition slides with sequence only on list items", () => {
    const { planningIR, compositionIR } = compileValid(
      cashDrainsRemake67CorrectedBrief()
    );
    expect(compositionIR.version).toBe(1);
    expect(compositionIR.planningVersion).toBe(1);
    expect(compositionIR.slides).toHaveLength(8);
    expect(compositionIR.slides.map((slide) => slide.beatId)).toEqual(
      planningIR.beats.map((beat) => beat.id)
    );
    expect(compositionIR.slides.map((slide) => slide.position)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
    expect(compositionIR.slides.map((slide) => slide.semanticRole)).toEqual([
      "cover",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "closing",
    ]);

    const sequenced = compositionIR.slides.filter((slide) =>
      regionRoles(slide).includes("sequence")
    );
    expect(sequenced).toHaveLength(6);
    expect(regionRoles(compositionIR.slides[0]!)).not.toContain("sequence");
    expect(regionRoles(compositionIR.slides[7]!)).not.toContain("sequence");
    expect(regionRoles(compositionIR.slides[3]!)).toEqual([
      "sequence",
      "headline",
      "body",
    ]);
    expect(JSON.stringify(compositionIR)).not.toMatch(/"03"/);
    expect(compositionIR.slides[3]?.textRegions.some((region) => "text" in region)).toBe(
      false
    );

    const archetypes = compositionIR.slides.map((slide) => slide.archetype);
    expect(archetypes).toEqual([
      "text_focus",
      "comparison_split",
      "number_focus",
      "diagram_focus",
      "timeline_flow",
      "number_focus",
      "number_focus",
      "closing_focus",
    ]);
    expect(new Set(archetypes.slice(1, 7)).size).toBeGreaterThan(1);
    expect(compositionIR.slides[0]?.density).toBe("low");
    expect(compositionIR.slides[0]?.visualRegions).toEqual([]);
    expect(compositionIR.slides[2]?.visualRegions).toEqual([]);
    expect(compositionIR.slides[3]?.visualRegions).toEqual([
      { role: "primary", kind: "diagram", placement: "center" },
    ]);
    expect(compositionIR.slides[7]?.emphasis).toBe("cta");
    expect(compositionIR.slides[7]?.visualRegions).toEqual([]);
    expect(validateCarouselCompositionIR(compositionIR, planningIR)).toEqual([]);
  });

  it("preserves remake 64 problem/solution beats instead of flattening to a list", () => {
    const { planningIR, compositionIR } = compileValid(validFiveLeakFiveFixBrief());
    expect(compositionIR.slides).toHaveLength(12);
    expect(compositionIR.slides.map((slide) => slide.semanticRole)).toEqual([
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
      compositionIR.slides.filter((slide) => slide.semanticRole === "list_item")
    ).toHaveLength(0);
    expect(
      compositionIR.slides.filter((slide) => slide.archetype === "number_focus")
    ).toHaveLength(0);

    const sequenced = compositionIR.slides.filter((slide) =>
      regionRoles(slide).includes("sequence")
    );
    expect(sequenced).toHaveLength(10);
    expect(regionRoles(compositionIR.slides[0]!)).not.toContain("sequence");
    expect(regionRoles(compositionIR.slides[11]!)).not.toContain("sequence");
    expect(compositionIR.slides[0]?.visualRegions).toEqual([]);
    expect(compositionIR.slides[1]?.archetype).toBe("timeline_flow");
    expect(compositionIR.slides[1]?.visualRegions).toEqual([
      { role: "primary", kind: "timeline", placement: "center" },
    ]);
    expect(compositionIR.slides[2]?.archetype).toBe("checklist_stack");
    expect(compositionIR.slides[3]?.archetype).toBe("diagram_focus");
    expect(compositionIR.slides[4]?.archetype).toBe("data_focus");
    expect(JSON.stringify(compositionIR)).not.toMatch(/Leak 1|Fix 1/);
    expect(validateCarouselCompositionIR(compositionIR, planningIR)).toEqual([]);
  });

  it("maps an open breakdown without inventing list sequence regions", () => {
    const { planningIR, compositionIR } = compileValid(sampleBrief());
    expect(planningIR.contract.kind).toBe("open");
    expect(compositionIR.slides.map((slide) => slide.semanticRole)).toEqual([
      "cover",
      "problem",
      "insight",
      "example",
      "closing",
    ]);
    expect(
      compositionIR.slides.every((slide) => !regionRoles(slide).includes("sequence"))
    ).toBe(true);
    expect(compositionIR.slides[0]?.archetype).toBe("text_focus");
    expect(compositionIR.slides[4]?.archetype).toBe("closing_focus");
    expect(validateCarouselCompositionIR(compositionIR, planningIR)).toEqual([]);
  });

  it("maps a comparison carousel without a promised count", () => {
    const { planningIR, compositionIR } = compileValid(
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
    expect(planningIR.contract.count).toBeNull();
    expect(planningIR.beats.every((beat) => beat.sequence == null)).toBe(true);
    expect(compositionIR.slides.map((slide) => slide.semanticRole)).toEqual([
      "cover",
      "comparison",
      "insight",
      "comparison",
      "closing",
    ]);
    expect(compositionIR.slides[1]?.archetype).toBe("comparison_split");
    expect(compositionIR.slides[3]?.archetype).toBe("comparison_split");
    expect(compositionIR.slides[1]?.visualRegions[0]?.placement).toBe("split");
    expect(
      compositionIR.slides.every((slide) => !regionRoles(slide).includes("sequence"))
    ).toBe(true);
    expect(validateCarouselCompositionIR(compositionIR, planningIR)).toEqual([]);
  });

  it("maps a story carousel to story scenes without numbering", () => {
    const { planningIR, compositionIR } = compileValid(storyBrief());
    expect(planningIR.strategy.preferredFamily).toBe("story");
    expect(planningIR.beats.every((beat) => beat.sequence == null)).toBe(true);
    expect(compositionIR.slides[0]?.archetype).toBe("text_visual_split");
    expect(compositionIR.slides[0]?.visualRegions[0]?.placement).toBe("right");
    expect(compositionIR.slides[4]?.archetype).toBe("text_visual_split");
    expect(compositionIR.slides[5]?.archetype).toBe("closing_focus");
    expect(
      compositionIR.slides.every((slide) => !regionRoles(slide).includes("sequence"))
    ).toBe(true);
    expect(validateCarouselCompositionIR(compositionIR, planningIR)).toEqual([]);
  });

  it("maps a framework carousel onto framework_grid without a list contract", () => {
    const { planningIR, compositionIR } = compileValid(
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
    expect(planningIR.contract.kind).toBe("open");
    expect(compositionIR.slides.map((slide) => slide.semanticRole)).toEqual([
      "cover",
      "framework_step",
      "insight",
      "framework_step",
      "closing",
    ]);
    expect(compositionIR.slides[1]?.archetype).toBe("framework_grid");
    expect(compositionIR.slides[3]?.archetype).toBe("framework_grid");
    expect(compositionIR.slides[1]?.density).toBe("high");
    expect(
      compositionIR.slides.every((slide) => !regionRoles(slide).includes("sequence"))
    ).toBe(true);
    expect(validateCarouselCompositionIR(compositionIR, planningIR)).toEqual([]);
  });

  it("maps a roadmap carousel using timeline intent without inventing item numbers", () => {
    const { planningIR, compositionIR } = compileValid(
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
    expect(planningIR.strategy.preferredFamily).toBe("roadmap");
    expect(planningIR.contract.itemType).toBeNull();
    expect(compositionIR.slides[1]?.archetype).toBe("timeline_flow");
    expect(compositionIR.slides[2]?.archetype).toBe("timeline_flow");
    expect(compositionIR.slides[2]?.visualRegions[0]?.placement).toBe("center");
    expect(compositionIR.slides[3]?.archetype).toBe("data_focus");
    expect(
      compositionIR.slides.every((slide) => !regionRoles(slide).includes("sequence"))
    ).toBe(true);
    expect(validateCarouselCompositionIR(compositionIR, planningIR)).toEqual([]);
  });

  it("uses the same Composition IR contract for original and remix sources", () => {
    const original = compileValid(cashDrainsRemake67CorrectedBrief()).compositionIR;
    const remixShaped = compilePlanningIRToBaselineCompositionIR(
      planningFromBrief(cashDrainsRemake67CorrectedBrief(), "remix source notes")
    );
    expect(Object.keys(original)).toEqual(Object.keys(remixShaped));
    expect(original.slides[0]).toEqual(
      expect.objectContaining({
        beatId: expect.any(String),
        archetype: expect.any(String),
        textRegions: expect.any(Array),
      })
    );
    expect("mode" in original).toBe(false);
    expect("mode" in remixShaped).toBe(false);
  });
});

describe("validateCarouselCompositionIR", () => {
  it("rejects renderer, template, copy, and asset leakage", () => {
    const { planningIR, compositionIR } = compileValid(sampleBrief());
    const leaked = {
      ...compositionIR,
      templateId: "photo_story_v2",
      slides: compositionIR.slides.map((slide, index) =>
        index === 0
          ? {
              ...slide,
              layoutId: "hook_bold_center",
              slide_01: { headline: "Hi" },
              textRegions: slide.textRegions.map((region, regionIndex) =>
                regionIndex === 0
                  ? { ...region, text: "03", color: "#ff00aa" }
                  : region
              ),
            }
          : slide
      ),
    } as CarouselCompositionIR & { templateId: string };
    const issues = validateCarouselCompositionIR(leaked, planningIR);
    expect(issues.some((issue) => /templateId/.test(issue))).toBe(true);
    expect(issues.some((issue) => /layoutId/.test(issue))).toBe(true);
    expect(issues.some((issue) => /slide_01/.test(issue))).toBe(true);
    expect(issues.some((issue) => /headline/.test(issue))).toBe(true);
    expect(issues.some((issue) => /text/.test(issue))).toBe(true);
    expect(issues.some((issue) => /hex color/.test(issue))).toBe(true);
  });

  it("rejects a changed semantic role, missing beat, and reordered positions", () => {
    const { planningIR, compositionIR } = compileValid(
      cashDrainsRemake67CorrectedBrief()
    );
    const mutated: CarouselCompositionIR = {
      ...compositionIR,
      slides: compositionIR.slides.map((slide, index) =>
        index === 3
          ? { ...slide, semanticRole: "insight", position: 9, beatId: "beat_99" }
          : slide
      ),
    };
    const issues = validateCarouselCompositionIR(mutated, planningIR);
    expect(issues).toContain("Slide 4 semanticRole must remain list_item");
    expect(issues).toContain("Slide 4 beatId must be beat_04");
    expect(issues).toContain("Slide 4 position must be 4");
    expect(issues).toContain(
      "Composition slide positions must be contiguous starting at 1"
    );
  });

  it("rejects a sequence region on cover and a missing sequence on a list item", () => {
    const { planningIR, compositionIR } = compileValid(
      cashDrainsRemake67CorrectedBrief()
    );
    const mutated: CarouselCompositionIR = {
      ...compositionIR,
      slides: compositionIR.slides.map((slide, index) => {
        if (index === 0) {
          return {
            ...slide,
            textRegions: [
              { role: "sequence", priority: "primary" },
              ...slide.textRegions,
            ],
          };
        }
        if (index === 2) {
          return {
            ...slide,
            textRegions: slide.textRegions.filter((region) => region.role !== "sequence"),
          };
        }
        return slide;
      }),
    };
    const issues = validateCarouselCompositionIR(mutated, planningIR);
    expect(issues).toContain("Cover slide must not include a sequence text region");
    expect(issues).toContain(
      "list_item beat beat_03 must include a sequence text region"
    );
  });

  it("rejects visual and archetype mismatches", () => {
    const { planningIR, compositionIR } = compileValid(
      cashDrainsRemake67CorrectedBrief()
    );
    const mutated: CarouselCompositionIR = {
      ...compositionIR,
      slides: compositionIR.slides.map((slide, index) => {
        if (index === 0) {
          return {
            ...slide,
            visualRegions: [
              {
                role: "primary",
                kind: "photo",
                placement: "right",
              },
            ],
          };
        }
        if (index === 3) {
          return {
            ...slide,
            visualRegions: [
              {
                role: "primary",
                kind: "photo",
                placement: "right",
              },
            ],
          };
        }
        return slide;
      }),
    };
    const issues = validateCarouselCompositionIR(mutated, planningIR);
    expect(issues).toContain(
      "Slide 1 archetype text_focus must not include visual regions"
    );
    expect(issues).toContain(
      "Slide 4 archetype diagram_focus requires kind diagram; got photo"
    );
  });

  it("allows text_focus slides with an empty visualRegions array", () => {
    const { planningIR, compositionIR } = compileValid(sampleBrief());
    expect(compositionIR.slides[0]?.archetype).toBe("text_focus");
    expect(compositionIR.slides[0]?.visualRegions).toEqual([]);
    expect(validateCarouselCompositionIR(compositionIR, planningIR)).toEqual([]);
  });

  it("allows text_visual_split slides with one primary or supporting photo region", () => {
    const { planningIR, compositionIR } = compileValid(storyBrief());
    const cover = compositionIR.slides[0]!;
    expect(cover.archetype).toBe("text_visual_split");
    expect(cover.visualRegions).toEqual([
      { role: "supporting", kind: "photo", placement: "right" },
    ]);
    const withPrimary: CarouselCompositionIR = {
      ...compositionIR,
      slides: compositionIR.slides.map((slide, index) =>
        index === 0
          ? {
              ...slide,
              visualRegions: [
                { role: "primary", kind: "photo", placement: "left" },
              ],
            }
          : slide
      ),
    };
    expect(validateCarouselCompositionIR(compositionIR, planningIR)).toEqual([]);
    expect(validateCarouselCompositionIR(withPrimary, planningIR)).toEqual([]);
  });

  it("accepts multiple semantic visual regions on a compatible slide", () => {
    const { planningIR, compositionIR } = compileValid(storyBrief());
    const mutated: CarouselCompositionIR = {
      ...compositionIR,
      slides: compositionIR.slides.map((slide, index) =>
        index === 0
          ? {
              ...slide,
              visualRegions: [
                { role: "primary", kind: "photo", placement: "right" },
                { role: "supporting", kind: "illustration", placement: "left" },
                { role: "annotation", kind: "icon_scene", placement: "split" },
              ],
            }
          : slide
      ),
    };
    expect(mutated.slides[0]?.visualRegions).toHaveLength(3);
    expect(validateCarouselCompositionIR(mutated, planningIR)).toEqual([]);
  });

  it("rejects invalid visual kinds and placements", () => {
    const { planningIR, compositionIR } = compileValid(
      cashDrainsRemake67CorrectedBrief()
    );
    const mutated: CarouselCompositionIR = {
      ...compositionIR,
      slides: compositionIR.slides.map((slide, index) => {
        if (index === 1) {
          return {
            ...slide,
            visualRegions: [
              {
                role: "primary",
                kind: "not_a_kind",
                placement: "not_a_placement",
              } as CarouselCompositionVisualRegion,
            ],
          };
        }
        if (index === 3) {
          return {
            ...slide,
            visualRegions: [
              { role: "primary", kind: "photo", placement: "right" },
            ],
          };
        }
        return slide;
      }),
    };
    const issues = validateCarouselCompositionIR(mutated, planningIR);
    expect(issues).toContain("Slide 2 has unknown visual kind");
    expect(issues).toContain("Slide 2 has unknown visual placement");
    expect(issues).toContain(
      "Slide 4 archetype diagram_focus requires kind diagram; got photo"
    );
    expect(issues).toContain(
      "Slide 4 archetype diagram_focus requires placement center; got right"
    );
  });

  it("rejects a missing cover or closing composition", () => {
    const { planningIR, compositionIR } = compileValid(sampleBrief());
    const mutated: CarouselCompositionIR = {
      ...compositionIR,
      slides: compositionIR.slides.map((slide, index) => {
        if (index === 0) return { ...slide, semanticRole: "insight" };
        if (index === compositionIR.slides.length - 1) {
          return { ...slide, semanticRole: "summary" };
        }
        return slide;
      }),
    };
    const issues = validateCarouselCompositionIR(mutated, planningIR);
    expect(issues).toContain("Composition IR must contain exactly one cover");
    expect(issues).toContain("Composition IR must contain exactly one closing");
    expect(issues).toContain("Slide 1 semanticRole must remain cover");
  });
});

describe("validateCarouselArchetypeVisualRegions", () => {
  it("is the shared compatibility helper used by Composition IR messages", () => {
    expect(
      validateCarouselArchetypeVisualRegions({
        archetype: "full_bleed_visual",
        visualRegions: [
          { role: "primary", kind: "photo", placement: "background" },
        ],
        subjectLabel: "Beat beat_01",
      })
    ).toEqual([
      "Beat beat_01 archetype full_bleed_visual requires placement full_bleed; got background",
    ]);
    expect(
      validateCarouselArchetypeVisualRegions({
        archetype: "checklist_stack",
        visualRegions: [],
        subjectLabel: "Beat beat_02",
      })
    ).toEqual([
      "Beat beat_02 archetype checklist_stack requires at least one visual region with kind checklist and placement center or bottom",
    ]);
  });

  it("generates the Visual Director prompt contract from the same rules", () => {
    const contract = describeCarouselArchetypeVisualContract();
    expect(contract).toContain("- text_focus -> no visual region");
    expect(contract).toContain("- number_focus -> no visual region");
    expect(contract).toContain("- closing_focus -> no visual region");
    expect(contract).toContain(
      "- text_visual_split -> photo / illustration / icon_scene -> left / right / split"
    );
    expect(contract).toContain(
      "- full_bleed_visual -> photo / illustration -> full_bleed"
    );
    expect(contract).toContain(
      "- comparison_split -> comparison -> split / left / right"
    );
    expect(contract).toContain(
      "- checklist_stack -> checklist -> center / bottom"
    );
    expect(contract).toContain("- timeline_flow -> timeline -> center");
    expect(contract).toContain("- diagram_focus -> diagram -> center");
    expect(contract).toContain("- data_focus -> data -> center");
    expect(contract).not.toMatch(/templateId|layoutId|fontSize|imagePrompt/);
    expect(CAROUSEL_COMPOSITION_ARCHETYPES.every((archetype) =>
      contract.includes(`- ${archetype} ->`)
    )).toBe(true);
  });
});
