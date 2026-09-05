import { describe, expect, it } from "vitest";
import { compilePlanningIRToBaselineCompositionIR } from "./carouselCompositionIR";
import {
  compileCreativeBriefToPlanningIR,
  type CarouselPlanningIR,
} from "./carouselPlanningIR";
import { canUseBreakdownListicleFamily } from "./carouselBreakdownFamily";
import { canUseComparisonFamily } from "./carouselComparisonFamily";
import { canUseFrameworkFamily } from "./carouselFrameworkFamily";
import { canUseStoryNarrativeFamily } from "./carouselStoryFamily";
import {
  buildRoadmapFamilySlides,
  canUseRoadmapFamily,
  isRoadmapFamilySlide,
  labelRoadmapSteps,
  resolveRoadmapRenderTreatment,
  resolveRoadmapStepStructure,
  resolveRoadmapTreatment,
  resolveRoadmapTreatments,
  roadmapTreatmentEyebrow,
  type RoadmapTreatment,
} from "./carouselRoadmapFamily";
import { resolveRoadmapPremiumVariants } from "./carouselRoadmapPremiumDesignSystem";
import { CAROUSEL_TEMPLATES_BY_ID } from "./carouselTemplates";
import {
  CAROUSEL_STUDIO_TEMPLATE_ID,
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  type CarouselCreativeBrief,
} from "./carouselStudio";

function roadmapPlanningIR(
  overrides?: Partial<CarouselPlanningIR>
): CarouselPlanningIR {
  return {
    version: 1,
    topic: "How to simplify a restaurant menu without hurting revenue",
    audience: "restaurant owners",
    goal: "education",
    contract: {
      source: "none",
      kind: "open",
      count: null,
      itemType: null,
      locked: false,
    },
    strategy: {
      angleType: "how_to",
      hook: "Cut the menu without cutting the sales",
      corePromise: "A path to simplify the menu and keep the revenue",
      centralInsight: "The sell-through path matters more than the item count",
      preferredFamily: "roadmap",
      ctaDirection: "Start with the items that never get reordered",
    },
    beats: [
      {
        id: "beat_01",
        position: 1,
        role: "cover",
        objective: "Name the path",
        visualIntent: "text",
        sequence: null,
      },
      {
        id: "beat_02",
        position: 2,
        role: "context",
        objective: "Show the route",
        visualIntent: "diagram",
        sequence: null,
      },
      {
        id: "beat_03",
        position: 3,
        role: "list_item",
        objective: "Cut the dead weight",
        visualIntent: "checklist",
        sequence: { kind: "list", index: 1 },
      },
      {
        id: "beat_04",
        position: 4,
        role: "list_item",
        objective: "Protect the signatures",
        visualIntent: "text",
        sequence: { kind: "list", index: 2 },
      },
      {
        id: "beat_05",
        position: 5,
        role: "list_item",
        objective: "Rebuild the ticket path",
        visualIntent: "text",
        sequence: { kind: "list", index: 3 },
      },
      {
        id: "beat_06",
        position: 6,
        role: "list_item",
        objective: "Watch the reorder rate",
        visualIntent: "text",
        sequence: { kind: "list", index: 4 },
      },
      {
        id: "beat_07",
        position: 7,
        role: "closing",
        objective: "Close on the first cut",
        visualIntent: "text",
        sequence: null,
      },
    ],
    research: {
      mode: "none",
      claimRisk: "low",
      evidenceRequirements: [],
      prohibitedClaims: [],
    },
    ...overrides,
  };
}

function storyPlanningIR(): CarouselPlanningIR {
  return roadmapPlanningIR({
    topic: "Why I switched from Android to iPhone after 10 years",
    strategy: {
      angleType: "story",
      hook: "Ten years later I switched",
      corePromise: "Walk through the switch",
      centralInsight: "The switch was about the work, not the brand",
      preferredFamily: "story",
      ctaDirection: "Share the lesson",
    },
    beats: [
      {
        id: "beat_01",
        position: 1,
        role: "cover",
        objective: "Open the loop",
        visualIntent: "photo",
        sequence: null,
      },
      {
        id: "beat_02",
        position: 2,
        role: "context",
        objective: "Set the years",
        visualIntent: "photo",
        sequence: null,
      },
      {
        id: "beat_03",
        position: 3,
        role: "problem",
        objective: "Show the cost",
        visualIntent: "text",
        sequence: null,
      },
      {
        id: "beat_04",
        position: 4,
        role: "insight",
        objective: "Reveal the turning point",
        visualIntent: "photo",
        sequence: null,
      },
      {
        id: "beat_05",
        position: 5,
        role: "closing",
        objective: "Close the lesson",
        visualIntent: "text",
        sequence: null,
      },
    ],
  });
}

function comparisonPlanningIR(): CarouselPlanningIR {
  return roadmapPlanningIR({
    topic: "Android vs iPhone: which is better for creators?",
    strategy: {
      angleType: "contrarian",
      hook: "The creator phone choice is a tradeoff",
      corePromise: "Show the real trade-off",
      centralInsight: "The better phone is the one that matches the work",
      preferredFamily: "comparison",
      ctaDirection: "Pick for the work",
    },
    beats: [
      {
        id: "beat_01",
        position: 1,
        role: "cover",
        objective: "Open the contrast",
        visualIntent: "comparison",
        sequence: null,
      },
      {
        id: "beat_02",
        position: 2,
        role: "comparison",
        objective: "Define Android",
        visualIntent: "comparison",
        sequence: null,
      },
      {
        id: "beat_03",
        position: 3,
        role: "comparison",
        objective: "Define iPhone",
        visualIntent: "comparison",
        sequence: null,
      },
      {
        id: "beat_04",
        position: 4,
        role: "closing",
        objective: "Close the decision",
        visualIntent: "text",
        sequence: null,
      },
    ],
  });
}

function frameworkPlanningIR(): CarouselPlanningIR {
  return roadmapPlanningIR({
    topic: "The framework I use to decide repair or replace",
    strategy: {
      angleType: "how_to",
      hook: "Repair or replace is a model",
      corePromise: "Give owners a decision model",
      centralInsight: "The call depends on downtime and remaining life",
      preferredFamily: "framework",
      ctaDirection: "Use the model",
    },
    beats: [
      {
        id: "beat_01",
        position: 1,
        role: "cover",
        objective: "Name the model",
        visualIntent: "diagram",
        sequence: null,
      },
      {
        id: "beat_02",
        position: 2,
        role: "framework_step",
        objective: "Failure mode",
        visualIntent: "diagram",
        sequence: null,
      },
      {
        id: "beat_03",
        position: 3,
        role: "framework_step",
        objective: "Remaining life",
        visualIntent: "diagram",
        sequence: null,
      },
      {
        id: "beat_04",
        position: 4,
        role: "closing",
        objective: "Close on the decision",
        visualIntent: "text",
        sequence: null,
      },
    ],
  });
}

function enumeratedListicleBrief(): CarouselCreativeBrief {
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: "brief_user_five_reasons",
    kicker: "Reasons",
    title: "5 reasons Android is better than iPhone",
    description: "Name five reasons, not a how-to path.",
    estimatedSlideCount: 7,
    topic: "phones",
    inferredAudience: "creators",
    audienceReasoning: "The source names this audience.",
    contentGoal: "education",
    contentFormat: "breakdown",
    angleType: "mistakes",
    hook: "5 reasons Android is better than iPhone.",
    corePromise: "Name five reasons creators can use.",
    centralInsight: "The reasons are independent, not a sequence.",
    keyPoints: [
      { title: "Reason 1", purpose: "Name it", explanation: "Files." },
      { title: "Reason 2", purpose: "Name it", explanation: "Battery." },
      { title: "Reason 3", purpose: "Name it", explanation: "Cost." },
      { title: "Reason 4", purpose: "Name it", explanation: "Apps." },
      { title: "Reason 5", purpose: "Name it", explanation: "Repair." },
    ],
    slideOutline: [
      { position: 1, role: "hook", objective: "Open the five reasons", recommendedVisual: "text", listItemIndex: null },
      { position: 2, role: "insight", objective: "Reason 1", recommendedVisual: "text", listItemIndex: 1 },
      { position: 3, role: "insight", objective: "Reason 2", recommendedVisual: "text", listItemIndex: 2 },
      { position: 4, role: "insight", objective: "Reason 3", recommendedVisual: "text", listItemIndex: 3 },
      { position: 5, role: "insight", objective: "Reason 4", recommendedVisual: "text", listItemIndex: 4 },
      { position: 6, role: "insight", objective: "Reason 5", recommendedVisual: "text", listItemIndex: 5 },
      { position: 7, role: "cta", objective: "Close the list", recommendedVisual: "text", listItemIndex: null },
    ],
    layoutFamily: "breakdown",
    visualDirection: "Simple numbered cards.",
    imageDirection: "Neutral product photos.",
    claimRisk: "low",
    researchMode: "none",
    evidenceRequirements: [],
    prohibitedClaims: [],
    ctaDirection: "Save the list",
    scores: {
      relevance: 80,
      usefulness: 80,
      specificity: 80,
      visualPotential: 80,
      factualSafety: 80,
      originality: 80,
      overall: 80,
    },
    confidence: 0.8,
  };
}

function slideCountOnlyPlanningIR(slideCount: 5 | 7): CarouselPlanningIR {
  const roles =
    slideCount === 7
      ? ([
          "cover",
          "context",
          "insight",
          "insight",
          "insight",
          "example",
          "closing",
        ] as const)
      : (["cover", "context", "insight", "example", "closing"] as const);
  return roadmapPlanningIR({
    beats: roles.map((role, index) => ({
      id: `beat_${String(index + 1).padStart(2, "0")}`,
      position: index + 1,
      role,
      objective: role,
      visualIntent: "text" as const,
      sequence: null,
    })),
  });
}

function template() {
  return CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID)!;
}

describe("Roadmap eligibility", () => {
  it("routes preferredFamily roadmap to Roadmap", () => {
    const ir = roadmapPlanningIR();
    expect(ir.strategy.preferredFamily).toBe("roadmap");
    expect(canUseRoadmapFamily(ir)).toBe(true);
    expect(canUseFrameworkFamily(ir)).toBe(false);
    expect(canUseStoryNarrativeFamily(ir)).toBe(false);
    expect(canUseComparisonFamily(ir)).toBe(false);
    expect(canUseBreakdownListicleFamily(ir)).toBe(false);
  });

  it("does not route other preferred families to Roadmap", () => {
    expect(canUseRoadmapFamily(storyPlanningIR())).toBe(false);
    expect(canUseRoadmapFamily(comparisonPlanningIR())).toBe(false);
    expect(canUseRoadmapFamily(frameworkPlanningIR())).toBe(false);
    const breakdown = compileCreativeBriefToPlanningIR({
      brief: enumeratedListicleBrief(),
      sourceContent: "5 reasons Android is better than iPhone",
    });
    expect(canUseRoadmapFamily(breakdown)).toBe(false);
  });

  it("keeps Framework as Framework even when angleType is how_to", () => {
    const ir = frameworkPlanningIR();
    expect(ir.strategy.angleType).toBe("how_to");
    expect(ir.strategy.preferredFamily).toBe("framework");
    expect(canUseFrameworkFamily(ir)).toBe(true);
    expect(canUseRoadmapFamily(ir)).toBe(false);
  });

  it("keeps Comparison as Comparison", () => {
    expect(canUseComparisonFamily(comparisonPlanningIR())).toBe(true);
    expect(canUseRoadmapFamily(comparisonPlanningIR())).toBe(false);
  });

  it("keeps Story as Story", () => {
    expect(canUseStoryNarrativeFamily(storyPlanningIR())).toBe(true);
    expect(canUseRoadmapFamily(storyPlanningIR())).toBe(false);
  });

  it("keeps Breakdown as Breakdown", () => {
    const planningIR = compileCreativeBriefToPlanningIR({
      brief: enumeratedListicleBrief(),
      sourceContent: "5 reasons Android is better than iPhone",
    });
    expect(canUseBreakdownListicleFamily(planningIR)).toBe(true);
    expect(canUseRoadmapFamily(planningIR)).toBe(false);
  });

  it("does not steal Roadmap from angleType how_to alone", () => {
    const ir = roadmapPlanningIR({
      strategy: {
        ...roadmapPlanningIR().strategy,
        preferredFamily: "framework",
        angleType: "how_to",
      },
      beats: slideCountOnlyPlanningIR(5).beats,
    });
    expect(ir.strategy.angleType).toBe("how_to");
    expect(canUseRoadmapFamily(ir)).toBe(false);
  });

  it("rejects missing plans", () => {
    expect(canUseRoadmapFamily(null)).toBe(false);
    expect(canUseRoadmapFamily(undefined)).toBe(false);
  });

  it("recognizes Roadmap render metadata", () => {
    expect(isRoadmapFamilySlide({ composition: { family: "roadmap" } })).toBe(
      true
    );
    expect(
      isRoadmapFamilySlide({ composition: { family: "framework" } })
    ).toBe(false);
    expect(
      isRoadmapFamilySlide({ composition: { family: "breakdown_listicle" } })
    ).toBe(false);
    expect(
      isRoadmapFamilySlide({ composition: { family: "story_narrative" } })
    ).toBe(false);
    expect(
      isRoadmapFamilySlide({ composition: { family: "comparison" } })
    ).toBe(false);
  });
});

describe("Roadmap step structure", () => {
  it("rejects two beats that share the same list index", () => {
    const ir = roadmapPlanningIR({
      beats: [
        {
          id: "beat_01",
          position: 1,
          role: "cover",
          objective: "Open",
          visualIntent: "text",
          sequence: null,
        },
        {
          id: "beat_02",
          position: 2,
          role: "list_item",
          objective: "First mention",
          visualIntent: "text",
          sequence: { kind: "list", index: 1 },
        },
        {
          id: "beat_03",
          position: 3,
          role: "list_item",
          objective: "Same index again",
          visualIntent: "text",
          sequence: { kind: "list", index: 1 },
        },
        {
          id: "beat_04",
          position: 4,
          role: "closing",
          objective: "Close",
          visualIntent: "text",
          sequence: null,
        },
      ],
    });
    const structure = resolveRoadmapStepStructure(ir);
    expect(structure.source).toBe("none");
    expect(structure.stepCount).toBe(0);
    expect(structure.indexByBeatId).toEqual({});
    const slides = buildRoadmapFamilySlides({
      template: template(),
      planningIR: ir,
      compositionIR: compilePlanningIRToBaselineCompositionIR(ir),
    });
    expect(
      slides.every((slide) => slide.composition?.roadmapStepCount === 0)
    ).toBe(true);
    expect(
      slides.every((slide) => slide.composition?.roadmapStepIndex == null)
    ).toBe(true);
    expect(
      slides.every((slide) => slide.composition?.roadmapStepSource === "none")
    ).toBe(true);
  });

  it("grounds 4 ordered list sequences as steps 1 through 4", () => {
    const ir = roadmapPlanningIR();
    const structure = resolveRoadmapStepStructure(ir);
    expect(structure.source).toBe("ordered_steps");
    expect(structure.stepCount).toBe(4);
    expect(structure.indexByBeatId).toEqual({
      beat_03: 1,
      beat_04: 2,
      beat_05: 3,
      beat_06: 4,
    });
  });

  it("writes grounded step indexes onto slides", () => {
    const planningIR = roadmapPlanningIR();
    const slides = buildRoadmapFamilySlides({
      template: template(),
      planningIR,
      compositionIR: compilePlanningIRToBaselineCompositionIR(planningIR),
    });
    expect(slides.every(isRoadmapFamilySlide)).toBe(true);
    expect(slides.map((slide) => slide.composition?.roadmapStepCount)).toEqual([
      4, 4, 4, 4, 4, 4, 4,
    ]);
    expect(slides.map((slide) => slide.composition?.roadmapStepIndex)).toEqual([
      null,
      null,
      1,
      2,
      3,
      4,
      null,
    ]);
    expect(slides[2]?.composition?.roadmapStepSource).toBe("ordered_steps");
    expect(slides.every((slide) => slide.composition?.listItemIndex === null)).toBe(
      true
    );
  });

  it("does not invent steps from totalSlides", () => {
    const seven = resolveRoadmapStepStructure(slideCountOnlyPlanningIR(7));
    const five = resolveRoadmapStepStructure(slideCountOnlyPlanningIR(5));
    expect(seven).toEqual({ source: "none", stepCount: 0, indexByBeatId: {} });
    expect(five).toEqual({ source: "none", stepCount: 0, indexByBeatId: {} });
  });

  it("does not invent steps from four lines of copy", () => {
    const labels = labelRoadmapSteps(
      0,
      "Cut the dead weight\nProtect signatures\nRebuild tickets\nWatch reorders"
    );
    expect(labels).toEqual([]);
    expect(
      resolveRoadmapStepStructure(slideCountOnlyPlanningIR(7)).stepCount
    ).toBe(0);
  });

  it("returns stepCount 0 when no ordered sequence exists", () => {
    const ir = slideCountOnlyPlanningIR(7);
    const structure = resolveRoadmapStepStructure(ir);
    expect(canUseRoadmapFamily(ir)).toBe(true);
    expect(structure.source).toBe("none");
    expect(structure.stepCount).toBe(0);
    const slides = buildRoadmapFamilySlides({
      template: template(),
      planningIR: ir,
      compositionIR: compilePlanningIRToBaselineCompositionIR(ir),
    });
    expect(
      slides.every((slide) => slide.composition?.roadmapStepCount === 0)
    ).toBe(true);
    expect(
      slides.every((slide) => slide.composition?.roadmapStepIndex == null)
    ).toBe(true);
  });

  it("does not treat problem_solution or framework_step beats as steps", () => {
    const ir = roadmapPlanningIR({
      beats: [
        {
          id: "beat_01",
          position: 1,
          role: "cover",
          objective: "Open",
          visualIntent: "text",
          sequence: null,
        },
        {
          id: "beat_02",
          position: 2,
          role: "problem",
          objective: "Name the problem",
          visualIntent: "text",
          sequence: { kind: "problem_solution", index: 1, side: "problem" },
        },
        {
          id: "beat_03",
          position: 3,
          role: "framework_step",
          objective: "A model part",
          visualIntent: "diagram",
          sequence: null,
        },
        {
          id: "beat_04",
          position: 4,
          role: "insight",
          objective: "A loose insight",
          visualIntent: "text",
          sequence: null,
        },
        {
          id: "beat_05",
          position: 5,
          role: "closing",
          objective: "Close",
          visualIntent: "text",
          sequence: null,
        },
      ],
    });
    const structure = resolveRoadmapStepStructure(ir);
    expect(structure.source).toBe("none");
    expect(structure.stepCount).toBe(0);
  });

  it("keeps grounded stepCount when labels are missing", () => {
    const labels = labelRoadmapSteps(4, "Cut\nProtect");
    expect(labels).toHaveLength(4);
    expect(labels).toEqual(["Cut", "Protect", null, null]);
    expect(resolveRoadmapStepStructure(roadmapPlanningIR()).stepCount).toBe(4);
  });

  it("does not change step metadata when resolving visual variants", () => {
    const planningIR = roadmapPlanningIR();
    const slides = buildRoadmapFamilySlides({
      template: template(),
      planningIR,
      compositionIR: compilePlanningIRToBaselineCompositionIR(planningIR),
    });
    const before = slides.map((slide) => ({
      count: slide.composition?.roadmapStepCount,
      index: slide.composition?.roadmapStepIndex ?? null,
    }));
    resolveRoadmapPremiumVariants(
      slides.map((slide) => ({
        treatment: slide.composition!.treatment as RoadmapTreatment,
        position: slide.composition!.position ?? 1,
        totalSlides: slide.composition!.totalSlides ?? slides.length,
        roadmapStepCount: slide.composition!.roadmapStepCount,
        roadmapStepIndex: slide.composition!.roadmapStepIndex,
      }))
    );
    expect(
      slides.map((slide) => ({
        count: slide.composition?.roadmapStepCount,
        index: slide.composition?.roadmapStepIndex ?? null,
      }))
    ).toEqual(before);
    expect(before.map((item) => item.count)).toEqual([4, 4, 4, 4, 4, 4, 4]);
    expect(before.map((item) => item.index)).toEqual([
      null,
      null,
      1,
      2,
      3,
      4,
      null,
    ]);
  });
});

describe("Roadmap treatments", () => {
  it("maps cover, route, grounded steps, and closing", () => {
    expect(
      resolveRoadmapTreatment({
        archetype: "text_focus",
        semanticRole: "cover",
        position: 1,
        totalSlides: 7,
      })
    ).toBe("howto_cover");
    expect(
      resolveRoadmapTreatment({
        archetype: "diagram_focus",
        semanticRole: "context",
        position: 2,
        totalSlides: 7,
      })
    ).toBe("route_overview");
    expect(
      resolveRoadmapTreatment({
        archetype: "text_focus",
        semanticRole: "list_item",
        position: 3,
        totalSlides: 7,
        roadmapStepCount: 4,
        roadmapStepIndex: 1,
      })
    ).toBe("step_focus");
    expect(
      resolveRoadmapTreatment({
        archetype: "text_focus",
        semanticRole: "example",
        position: 6,
        totalSlides: 7,
      })
    ).toBe("worked_example");
    expect(
      resolveRoadmapTreatment({
        archetype: "closing_focus",
        semanticRole: "closing",
        position: 7,
        totalSlides: 7,
      })
    ).toBe("howto_closing");
  });

  it("keeps two context slides as route_overview", () => {
    expect(
      resolveRoadmapTreatments([
        {
          archetype: "text_focus",
          semanticRole: "context",
          position: 2,
          totalSlides: 6,
        },
        {
          archetype: "diagram_focus",
          semanticRole: "context",
          position: 3,
          totalSlides: 6,
        },
      ])
    ).toEqual(["route_overview", "route_overview"]);
  });

  it("keeps two insight slides as progress_checkpoint", () => {
    expect(
      resolveRoadmapTreatments([
        {
          archetype: "text_focus",
          semanticRole: "insight",
          position: 4,
          totalSlides: 7,
        },
        {
          archetype: "text_focus",
          semanticRole: "insight",
          position: 5,
          totalSlides: 7,
        },
      ])
    ).toEqual(["progress_checkpoint", "progress_checkpoint"]);
  });

  it("does not turn action_checklist into worked_example for adjacency", () => {
    expect(
      resolveRoadmapTreatments([
        {
          archetype: "checklist_stack",
          semanticRole: "insight",
          position: 3,
          totalSlides: 6,
        },
        {
          archetype: "checklist_stack",
          semanticRole: "insight",
          position: 4,
          totalSlides: 6,
        },
      ])
    ).toEqual(["action_checklist", "action_checklist"]);
  });

  it("labels reusable geometry from treatment semantics", () => {
    expect(roadmapTreatmentEyebrow("route_overview")).toBe("Route");
    expect(roadmapTreatmentEyebrow("progress_checkpoint")).toBe("Checkpoint");
    expect(roadmapTreatmentEyebrow("howto_summary")).toBe("Recap");
    expect(roadmapTreatmentEyebrow("howto_closing")).toBe("Next");
    expect(roadmapTreatmentEyebrow("worked_example")).toBe("In practice");
  });

  it("keeps grounded step_focus when rematching adjacent duplicates", () => {
    const treatments = resolveRoadmapTreatments([
      {
        archetype: "text_focus",
        semanticRole: "list_item",
        position: 3,
        totalSlides: 7,
        roadmapStepCount: 4,
        roadmapStepIndex: 1,
      },
      {
        archetype: "text_focus",
        semanticRole: "list_item",
        position: 4,
        totalSlides: 7,
        roadmapStepCount: 4,
        roadmapStepIndex: 2,
      },
    ]);
    expect(treatments[0]).toBe("step_focus");
    expect(treatments[1]).toBe("step_focus");
  });

  it("keeps render treatment type-led when an image is missing", () => {
    expect(
      resolveRoadmapRenderTreatment({ treatment: "worked_example" })
    ).toBe("worked_example");
    expect(
      resolveRoadmapRenderTreatment({
        treatment: "howto_cover",
        imageUrl: "https://images.example.com/cover.jpg",
      })
    ).toBe("howto_cover");
  });

  it("builds Roadmap slides without a legacy family renderer", () => {
    const planningIR = roadmapPlanningIR();
    const slides = buildRoadmapFamilySlides({
      template: template(),
      planningIR,
      compositionIR: compilePlanningIRToBaselineCompositionIR(planningIR),
    });
    expect(slides.length).toBe(7);
    expect(slides.every(isRoadmapFamilySlide)).toBe(true);
    expect(slides[0]?.composition).toMatchObject({
      family: "roadmap",
      treatment: "howto_cover",
      listItemIndex: null,
    });
    expect(slides.at(-1)?.composition).toMatchObject({
      treatment: "howto_closing",
    });
    expect(
      slides.every((slide) => slide.composition?.family === "roadmap")
    ).toBe(true);
  });

  it("adds an image slot only when Composition IR asks for a picture", () => {
    const planningIR = roadmapPlanningIR();
    const compositionIR = compilePlanningIRToBaselineCompositionIR(planningIR);
    compositionIR.slides[3] = {
      ...compositionIR.slides[3]!,
      visualRegions: [{ role: "primary", kind: "photo", placement: "center" }],
    };
    const slides = buildRoadmapFamilySlides({
      template: template(),
      planningIR,
      compositionIR,
    });
    expect(slides[3]?.imageSlots?.map((slot) => slot.id)).toEqual(["photo"]);
    expect(slides[0]?.imageSlots).toBeUndefined();
  });
});
