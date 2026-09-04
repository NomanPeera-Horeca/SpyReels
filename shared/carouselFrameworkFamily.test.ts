import { describe, expect, it } from "vitest";
import { compilePlanningIRToBaselineCompositionIR } from "./carouselCompositionIR";
import {
  compileCreativeBriefToPlanningIR,
  type CarouselPlanningIR,
} from "./carouselPlanningIR";
import { canUseBreakdownListicleFamily } from "./carouselBreakdownFamily";
import { canUseComparisonFamily } from "./carouselComparisonFamily";
import { canUseStoryNarrativeFamily } from "./carouselStoryFamily";
import {
  buildFrameworkFamilySlides,
  canUseFrameworkFamily,
  frameworkStepCount,
  hasStrongFrameworkSemantics,
  isFrameworkFamilySlide,
  resolveFrameworkRenderTreatment,
  resolveFrameworkTreatment,
  resolveFrameworkTreatments,
} from "./carouselFrameworkFamily";
import { CAROUSEL_TEMPLATES_BY_ID } from "./carouselTemplates";
import {
  CAROUSEL_STUDIO_TEMPLATE_ID,
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  type CarouselCreativeBrief,
} from "./carouselStudio";

function frameworkPlanningIR(
  overrides?: Partial<CarouselPlanningIR>
): CarouselPlanningIR {
  return {
    version: 1,
    topic: "A 4-part framework for adding a menu item",
    audience: "restaurant owners",
    goal: "authority",
    contract: {
      source: "none",
      kind: "open",
      count: null,
      itemType: null,
      locked: false,
    },
    strategy: {
      angleType: "how_to",
      hook: "Use this before you add another plate",
      corePromise: "Decide whether a new menu item deserves the line",
      centralInsight: "A new item is a systems decision, not a recipe idea",
      preferredFamily: "framework",
      ctaDirection: "Run the four checks before you print the menu",
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
        role: "context",
        objective: "Show the four parts together",
        visualIntent: "diagram",
        sequence: null,
      },
      {
        id: "beat_03",
        position: 3,
        role: "framework_step",
        objective: "Demand check",
        visualIntent: "diagram",
        sequence: null,
      },
      {
        id: "beat_04",
        position: 4,
        role: "framework_step",
        objective: "Margin check",
        visualIntent: "diagram",
        sequence: null,
      },
      {
        id: "beat_05",
        position: 5,
        role: "framework_step",
        objective: "Ops check",
        visualIntent: "diagram",
        sequence: null,
      },
      {
        id: "beat_06",
        position: 6,
        role: "example",
        objective: "Apply the model to one item",
        visualIntent: "text",
        sequence: null,
      },
      {
        id: "beat_07",
        position: 7,
        role: "closing",
        objective: "Close on the decision",
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
  return frameworkPlanningIR({
    topic: "I almost killed my business by chasing growth too early",
    strategy: {
      angleType: "story",
      hook: "Growth nearly broke the business",
      corePromise: "The moment I realized growth was the wrong goal",
      centralInsight: "Growth without readiness compounds fragility",
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
        objective: "Set up the chase",
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
  return frameworkPlanningIR({
    topic: "Cheap restaurant equipment vs buying right first",
    strategy: {
      angleType: "contrarian",
      hook: "Cheap equipment costs more than it saves",
      corePromise: "Show the real trade-off",
      centralInsight: "The cheaper buy often becomes the second buy",
      preferredFamily: "comparison",
      ctaDirection: "Buy it once",
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
        objective: "Define cheap equipment",
        visualIntent: "comparison",
        sequence: null,
      },
      {
        id: "beat_03",
        position: 3,
        role: "comparison",
        objective: "Define buying right",
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

function enumeratedListicleBrief(): CarouselCreativeBrief {
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: "brief_user_menu_mistakes",
    kicker: "Mistakes",
    title: "5 restaurant menu mistakes",
    description: "Name five menu mistakes owners can stop repeating.",
    estimatedSlideCount: 7,
    topic: "restaurant menus",
    inferredAudience: "restaurant owners",
    audienceReasoning: "The source names this audience.",
    contentGoal: "education",
    contentFormat: "framework",
    angleType: "mistakes",
    hook: "5 restaurant menu mistakes that quietly cost you.",
    corePromise: "Name five menu mistakes owners can stop repeating.",
    centralInsight: "Menu bloat hides operating cost.",
    keyPoints: [
      { title: "Mistake 1", purpose: "Name it", explanation: "Too many items." },
      { title: "Mistake 2", purpose: "Name it", explanation: "No signatures." },
      { title: "Mistake 3", purpose: "Name it", explanation: "Weak costing." },
      { title: "Mistake 4", purpose: "Name it", explanation: "Slow tickets." },
      { title: "Mistake 5", purpose: "Name it", explanation: "No cuts." },
    ],
    slideOutline: [
      { position: 1, role: "hook", objective: "Open the five mistakes", recommendedVisual: "text", listItemIndex: null },
      { position: 2, role: "problem", objective: "Mistake 1: too many items", recommendedVisual: "text", listItemIndex: 1 },
      { position: 3, role: "problem", objective: "Mistake 2: no signatures", recommendedVisual: "text", listItemIndex: 2 },
      { position: 4, role: "problem", objective: "Mistake 3: weak costing", recommendedVisual: "text", listItemIndex: 3 },
      { position: 5, role: "problem", objective: "Mistake 4: slow tickets", recommendedVisual: "text", listItemIndex: 4 },
      { position: 6, role: "problem", objective: "Mistake 5: no cuts", recommendedVisual: "text", listItemIndex: 5 },
      { position: 7, role: "cta", objective: "Close the list", recommendedVisual: "text", listItemIndex: null },
    ],
    layoutFamily: "framework",
    visualDirection: "Simple numbered cards.",
    imageDirection: "Neutral kitchen photos.",
    claimRisk: "low",
    researchMode: "none",
    evidenceRequirements: [],
    prohibitedClaims: [],
    ctaDirection: "Fix the first mistake",
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

describe("Framework eligibility", () => {
  it("accepts an open preferred Framework plan", () => {
    const ir = frameworkPlanningIR();
    expect(ir.contract.kind).toBe("open");
    expect(ir.strategy.preferredFamily).toBe("framework");
    expect(canUseFrameworkFamily(ir)).toBe(true);
    expect(canUseStoryNarrativeFamily(ir)).toBe(false);
    expect(canUseComparisonFamily(ir)).toBe(false);
    expect(canUseBreakdownListicleFamily(ir)).toBe(false);
  });

  it("does not steal Story", () => {
    expect(canUseFrameworkFamily(storyPlanningIR())).toBe(false);
    expect(canUseStoryNarrativeFamily(storyPlanningIR())).toBe(true);
  });

  it("does not steal Comparison", () => {
    expect(canUseFrameworkFamily(comparisonPlanningIR())).toBe(false);
    expect(canUseComparisonFamily(comparisonPlanningIR())).toBe(true);
  });

  it("does not steal an explicit enumerated Breakdown even when labeled Framework", () => {
    const planningIR = compileCreativeBriefToPlanningIR({
      brief: enumeratedListicleBrief(),
      sourceContent: "5 restaurant menu mistakes",
    });
    expect(planningIR.contract.source).toBe("user");
    expect(planningIR.contract.kind).toBe("enumerated");
    expect(planningIR.strategy.preferredFamily).toBe("framework");
    expect(canUseFrameworkFamily(planningIR)).toBe(false);
    expect(canUseBreakdownListicleFamily(planningIR)).toBe(true);
  });

  it("uses 2+ framework_step beats as a structural fallback", () => {
    const ir = frameworkPlanningIR({
      strategy: {
        ...frameworkPlanningIR().strategy,
        preferredFamily: "roadmap",
        angleType: "how_to",
      },
    });
    expect(ir.strategy.preferredFamily).toBe("roadmap");
    expect(frameworkStepCount(ir)).toBe(3);
    expect(hasStrongFrameworkSemantics(ir)).toBe(true);
    expect(canUseFrameworkFamily(ir)).toBe(true);
  });

  it("does not treat list sequences alone as Framework", () => {
    const ir = frameworkPlanningIR({
      strategy: {
        ...frameworkPlanningIR().strategy,
        preferredFamily: "roadmap",
        angleType: "checklist",
      },
      beats: [
        {
          id: "beat_01",
          position: 1,
          role: "cover",
          objective: "Open the checklist",
          visualIntent: "text",
          sequence: null,
        },
        {
          id: "beat_02",
          position: 2,
          role: "list_item",
          objective: "First ordered beat",
          visualIntent: "text",
          sequence: { kind: "list", index: 1 },
        },
        {
          id: "beat_03",
          position: 3,
          role: "list_item",
          objective: "Second ordered beat",
          visualIntent: "text",
          sequence: { kind: "list", index: 2 },
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
    expect(canUseFrameworkFamily(ir)).toBe(false);
  });

  it("rejects missing plans", () => {
    expect(canUseFrameworkFamily(null)).toBe(false);
    expect(canUseFrameworkFamily(undefined)).toBe(false);
  });

  it("recognizes Framework render metadata", () => {
    expect(
      isFrameworkFamilySlide({ composition: { family: "framework" } })
    ).toBe(true);
    expect(
      isFrameworkFamilySlide({ composition: { family: "comparison" } })
    ).toBe(false);
    expect(
      isFrameworkFamilySlide({ composition: { family: "story_narrative" } })
    ).toBe(false);
    expect(
      isFrameworkFamilySlide({ composition: { family: "breakdown_listicle" } })
    ).toBe(false);
  });
});

describe("Framework treatments", () => {
  it("maps cover, model, steps, application, and closing", () => {
    expect(
      resolveFrameworkTreatment({
        archetype: "diagram_focus",
        semanticRole: "cover",
        position: 1,
        totalSlides: 7,
        frameworkStepCount: 3,
        frameworkStepIndex: null,
        comparisonRoleCount: 0,
        hasExample: true,
      })
    ).toBe("framework_cover");
    expect(
      resolveFrameworkTreatment({
        archetype: "diagram_focus",
        semanticRole: "context",
        position: 2,
        totalSlides: 7,
        frameworkStepCount: 3,
        frameworkStepIndex: null,
        comparisonRoleCount: 0,
        hasExample: true,
      })
    ).toBe("layered_model");
    expect(
      resolveFrameworkTreatment({
        archetype: "framework_grid",
        semanticRole: "framework_step",
        position: 4,
        totalSlides: 7,
        frameworkStepCount: 3,
        frameworkStepIndex: 2,
        comparisonRoleCount: 0,
        hasExample: true,
      })
    ).toBe("pillar_system");
    expect(
      resolveFrameworkTreatment({
        archetype: "timeline_flow",
        semanticRole: "framework_step",
        position: 4,
        totalSlides: 7,
        sequence: { kind: "list", index: 2 },
        frameworkStepCount: 3,
        frameworkStepIndex: 2,
        comparisonRoleCount: 0,
        hasExample: true,
      })
    ).toBe("step_system");
    expect(
      resolveFrameworkTreatment({
        archetype: "text_focus",
        semanticRole: "example",
        position: 6,
        totalSlides: 7,
        frameworkStepCount: 3,
        frameworkStepIndex: null,
        comparisonRoleCount: 0,
        hasExample: true,
      })
    ).toBe("example_application");
    expect(
      resolveFrameworkTreatment({
        archetype: "closing_focus",
        semanticRole: "closing",
        position: 7,
        totalSlides: 7,
        frameworkStepCount: 3,
        frameworkStepIndex: null,
        comparisonRoleCount: 0,
        hasExample: true,
      })
    ).toBe("framework_closing");
  });

  it("uses decision treatments only when the plan actually compares", () => {
    expect(
      resolveFrameworkTreatment({
        archetype: "comparison_split",
        semanticRole: "comparison",
        position: 3,
        totalSlides: 6,
        frameworkStepCount: 0,
        frameworkStepIndex: null,
        comparisonRoleCount: 2,
        hasExample: false,
      })
    ).toBe("matrix_framework");
    expect(
      resolveFrameworkTreatment({
        archetype: "text_focus",
        semanticRole: "insight",
        position: 4,
        totalSlides: 6,
        sequence: { kind: "problem_solution", index: 1, side: "solution" },
        frameworkStepCount: 2,
        frameworkStepIndex: null,
        comparisonRoleCount: 0,
        hasExample: false,
      })
    ).toBe("decision_tree");
    expect(
      resolveFrameworkTreatment({
        archetype: "text_focus",
        semanticRole: "insight",
        position: 4,
        totalSlides: 6,
        frameworkStepCount: 2,
        frameworkStepIndex: null,
        comparisonRoleCount: 0,
        hasExample: false,
      })
    ).toBe("principle_focus");
  });

  it("rematches adjacent duplicate treatments deterministically", () => {
    const treatments = resolveFrameworkTreatments([
      {
        archetype: "framework_grid",
        semanticRole: "framework_step",
        position: 3,
        totalSlides: 6,
        frameworkStepCount: 3,
        frameworkStepIndex: 1,
        comparisonRoleCount: 0,
        hasExample: false,
      },
      {
        archetype: "framework_grid",
        semanticRole: "framework_step",
        position: 4,
        totalSlides: 6,
        frameworkStepCount: 3,
        frameworkStepIndex: 2,
        comparisonRoleCount: 0,
        hasExample: false,
      },
    ]);
    expect(treatments[0]).toBe("pillar_system");
    expect(treatments[1]).not.toBe(treatments[0]);
  });

  it("keeps render treatment type-led when an image is missing", () => {
    expect(
      resolveFrameworkRenderTreatment({
        treatment: "example_application",
      })
    ).toBe("example_application");
    expect(
      resolveFrameworkRenderTreatment({
        treatment: "framework_cover",
        imageUrl: "https://images.example.com/cover.jpg",
      })
    ).toBe("framework_cover");
  });

  it("builds Framework slides without forcing photography", () => {
    const planningIR = frameworkPlanningIR();
    const compositionIR = compilePlanningIRToBaselineCompositionIR(planningIR);
    const template = CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID)!;
    const slides = buildFrameworkFamilySlides({
      template,
      planningIR,
      compositionIR,
    });

    expect(slides.length).toBeGreaterThan(4);
    expect(slides.every(isFrameworkFamilySlide)).toBe(true);
    expect(slides[0]?.composition).toMatchObject({
      family: "framework",
      treatment: "framework_cover",
      listItemIndex: null,
    });
    expect(slides.at(-1)?.composition).toMatchObject({
      treatment: "framework_closing",
    });
    expect(
      slides.filter((slide) => (slide.imageSlots?.length ?? 0) > 0)
    ).toHaveLength(0);
    expect(
      slides.every((slide) => slide.composition?.listItemIndex === null)
    ).toBe(true);
  });

  it("adds an image slot only when Composition IR asks for a picture", () => {
    const planningIR = frameworkPlanningIR();
    const compositionIR = compilePlanningIRToBaselineCompositionIR(planningIR);
    compositionIR.slides[5] = {
      ...compositionIR.slides[5]!,
      visualRegions: [
        { role: "primary", kind: "photo", placement: "center" },
      ],
    };
    const template = CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID)!;
    const slides = buildFrameworkFamilySlides({
      template,
      planningIR,
      compositionIR,
    });
    expect(slides[5]?.imageSlots?.map((slot) => slot.id)).toEqual(["photo"]);
    expect(slides[0]?.imageSlots).toBeUndefined();
  });
});
