import { describe, expect, it } from "vitest";
import { compilePlanningIRToBaselineCompositionIR } from "./carouselCompositionIR";
import type { CarouselPlanningIR } from "./carouselPlanningIR";
import { canUseBreakdownListicleFamily } from "./carouselBreakdownFamily";
import {
  buildComparisonFamilySlides,
  canUseComparisonFamily,
  isComparisonFamilySlide,
  resolveComparisonRenderTreatment,
  resolveComparisonSideIdentity,
  resolveComparisonSideLabels,
  resolveComparisonTradeoffDensity,
  resolveComparisonTreatment,
  resolveComparisonTreatments,
  textContextForComparisonImageSlot,
} from "./carouselComparisonFamily";
import { canUseStoryNarrativeFamily } from "./carouselStoryFamily";
import { CAROUSEL_TEMPLATES_BY_ID } from "./carouselTemplates";
import { CAROUSEL_STUDIO_TEMPLATE_ID } from "./carouselStudio";

function comparisonPlanningIR(
  overrides?: Partial<CarouselPlanningIR>
): CarouselPlanningIR {
  return {
    version: 1,
    topic: "Cheap restaurant equipment vs buying the right equipment first",
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
      angleType: "contrarian",
      hook: "Cheap equipment costs more than it saves",
      corePromise: "Show the real trade-off between cheap and right-first",
      centralInsight: "The cheaper buy often becomes the second buy",
      preferredFamily: "comparison",
      ctaDirection: "Choose the equipment you will not replace",
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
        objective: "Define buying right the first time",
        visualIntent: "comparison",
        sequence: null,
      },
      {
        id: "beat_04",
        position: 4,
        role: "insight",
        objective: "Name the operating cost difference",
        visualIntent: "text",
        sequence: null,
      },
      {
        id: "beat_05",
        position: 5,
        role: "summary",
        objective: "Recommend the better choice",
        visualIntent: "text",
        sequence: null,
      },
      {
        id: "beat_06",
        position: 6,
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
  return comparisonPlanningIR({
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
        role: "summary",
        objective: "Land the lesson",
        visualIntent: "text",
        sequence: null,
      },
      {
        id: "beat_06",
        position: 6,
        role: "closing",
        objective: "Resolve and close",
        visualIntent: "text",
        sequence: null,
      },
    ],
  });
}

function listiclePlanningIR(): CarouselPlanningIR {
  return comparisonPlanningIR({
    topic: "5 mistakes that waste restaurant cash",
    contract: {
      source: "user",
      kind: "enumerated",
      count: 5,
      itemType: "mistakes",
      locked: true,
    },
    strategy: {
      angleType: "mistakes",
      hook: "Five cash mistakes",
      corePromise: "Name the five leaks",
      centralInsight: "Cash dies from structure",
      preferredFamily: "breakdown",
      ctaDirection: "Fix the first leak",
    },
    beats: [
      {
        id: "beat_01",
        position: 1,
        role: "cover",
        objective: "Open the list",
        visualIntent: "text",
        sequence: null,
      },
      {
        id: "beat_02",
        position: 2,
        role: "list_item",
        objective: "Mistake one",
        visualIntent: "text",
        sequence: { kind: "list", index: 1 },
      },
      {
        id: "beat_03",
        position: 3,
        role: "list_item",
        objective: "Mistake two compares two vendors",
        visualIntent: "comparison",
        sequence: { kind: "list", index: 2 },
      },
      {
        id: "beat_04",
        position: 4,
        role: "list_item",
        objective: "Mistake three",
        visualIntent: "text",
        sequence: { kind: "list", index: 3 },
      },
      {
        id: "beat_05",
        position: 5,
        role: "list_item",
        objective: "Mistake four",
        visualIntent: "text",
        sequence: { kind: "list", index: 4 },
      },
      {
        id: "beat_06",
        position: 6,
        role: "list_item",
        objective: "Mistake five",
        visualIntent: "text",
        sequence: { kind: "list", index: 5 },
      },
      {
        id: "beat_07",
        position: 7,
        role: "closing",
        objective: "Close the list",
        visualIntent: "text",
        sequence: null,
      },
    ],
  });
}

function pairedComparisonPlanningIR(): CarouselPlanningIR {
  return comparisonPlanningIR({
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
        role: "problem",
        objective: "Show the cheap-equipment path",
        visualIntent: "text",
        sequence: { kind: "problem_solution", index: 1, side: "problem" },
      },
      {
        id: "beat_03",
        position: 3,
        role: "solution",
        objective: "Show buying right the first time",
        visualIntent: "text",
        sequence: { kind: "problem_solution", index: 1, side: "solution" },
      },
      {
        id: "beat_04",
        position: 4,
        role: "problem",
        objective: "Show downtime cost",
        visualIntent: "photo",
        sequence: { kind: "problem_solution", index: 2, side: "problem" },
      },
      {
        id: "beat_05",
        position: 5,
        role: "solution",
        objective: "Show the durable choice",
        visualIntent: "text",
        sequence: { kind: "problem_solution", index: 2, side: "solution" },
      },
      {
        id: "beat_06",
        position: 6,
        role: "closing",
        objective: "Close on the decision",
        visualIntent: "text",
        sequence: null,
      },
    ],
  });
}

describe("Comparison family routing", () => {
  it("routes open Comparison strategy into Comparison family", () => {
    expect(canUseComparisonFamily(comparisonPlanningIR())).toBe(true);
  });

  it("routes strong comparison semantics without preferredFamily comparison", () => {
    const ir = comparisonPlanningIR({
      strategy: {
        ...comparisonPlanningIR().strategy,
        preferredFamily: "framework",
        angleType: "contrarian",
      },
    });
    expect(canUseComparisonFamily(ir)).toBe(true);
  });

  it("does not steal enumerated listicles even when one item compares", () => {
    expect(canUseComparisonFamily(listiclePlanningIR())).toBe(false);
    expect(canUseBreakdownListicleFamily(listiclePlanningIR())).toBe(true);
  });

  it("does not steal Story plans", () => {
    expect(canUseComparisonFamily(storyPlanningIR())).toBe(false);
    expect(canUseStoryNarrativeFamily(storyPlanningIR())).toBe(true);
  });

  it("does not accidentally route Comparison into Story or Breakdown", () => {
    const ir = comparisonPlanningIR();
    expect(canUseComparisonFamily(ir)).toBe(true);
    expect(canUseStoryNarrativeFamily(ir)).toBe(false);
    expect(canUseBreakdownListicleFamily(ir)).toBe(false);
  });

  it("stays out of open Story-labeled plans that are not comparison", () => {
    expect(canUseComparisonFamily(storyPlanningIR())).toBe(false);
  });

  it("recognizes Comparison render metadata", () => {
    expect(
      isComparisonFamilySlide({ composition: { family: "comparison" } })
    ).toBe(true);
    expect(
      isComparisonFamilySlide({ composition: { family: "story_narrative" } })
    ).toBe(false);
    expect(
      isComparisonFamilySlide({ composition: { family: "breakdown_listicle" } })
    ).toBe(false);
  });
});

describe("Comparison treatments and sequence", () => {
  it("maps cover, contrast body, decision, and closing treatments", () => {
    expect(
      resolveComparisonTreatment({
        archetype: "comparison_split",
        semanticRole: "cover",
        position: 1,
        totalSlides: 6,
      })
    ).toBe("contrast_cover");
    expect(
      resolveComparisonTreatment({
        archetype: "comparison_split",
        semanticRole: "comparison",
        position: 2,
        totalSlides: 6,
      })
    ).toBe("side_by_side");
    expect(
      resolveComparisonTreatment({
        archetype: "text_focus",
        semanticRole: "summary",
        position: 5,
        totalSlides: 6,
      })
    ).toBe("winner_reveal");
    expect(
      resolveComparisonTreatment({
        archetype: "closing_focus",
        semanticRole: "closing",
        position: 6,
        totalSlides: 6,
      })
    ).toBe("comparison_closing");
    expect(
      resolveComparisonTreatment({
        archetype: "data_focus",
        semanticRole: "insight",
        position: 3,
        totalSlides: 7,
      })
    ).toBe("comparison_score");
    expect(
      resolveComparisonTreatment({
        archetype: "data_focus",
        semanticRole: "example",
        position: 6,
        totalSlides: 7,
      })
    ).toBe("winner_reveal");
  });

  it("preserves problem_solution sequence into slide metadata", () => {
    const planningIR = pairedComparisonPlanningIR();
    const compositionIR = compilePlanningIRToBaselineCompositionIR(planningIR);
    const template = CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID)!;
    const slides = buildComparisonFamilySlides({
      template,
      planningIR,
      compositionIR,
    });

    expect(slides).toHaveLength(6);
    expect(slides[1]?.composition).toMatchObject({
      family: "comparison",
      semanticRole: "problem",
      sequence: { kind: "problem_solution", index: 1, side: "problem" },
      listItemIndex: null,
    });
    expect(slides[2]?.composition).toMatchObject({
      semanticRole: "solution",
      sequence: { kind: "problem_solution", index: 1, side: "solution" },
    });
    expect(slides[3]?.composition).toMatchObject({
      sequence: { kind: "problem_solution", index: 2, side: "problem" },
    });
    expect(slides[4]?.composition).toMatchObject({
      sequence: { kind: "problem_solution", index: 2, side: "solution" },
    });
    expect(slides[1]?.slots.some((slot) => slot.id === "left")).toBe(true);
    expect(slides[1]?.slots.some((slot) => slot.id === "right")).toBe(true);
  });

  it("keeps side identity from structured sequence, not copy", () => {
    const problem = resolveComparisonSideIdentity({
      kind: "problem_solution",
      index: 1,
      side: "problem",
    });
    const solution = resolveComparisonSideIdentity({
      kind: "problem_solution",
      index: 1,
      side: "solution",
    });
    expect(problem).toEqual({
      leftKind: "problem",
      rightKind: "solution",
      focus: "problem",
      index: 1,
    });
    expect(solution.focus).toBe("solution");
    expect(solution.leftKind).toBe("problem");
    expect(solution.rightKind).toBe("solution");
    expect(resolveComparisonSideIdentity(null)).toEqual({
      leftKind: "option_a",
      rightKind: "option_b",
      focus: null,
      index: null,
    });
  });

  it("uses problem_solution sides for wrong vs right and winner treatments", () => {
    expect(
      resolveComparisonTreatment({
        archetype: "text_focus",
        semanticRole: "problem",
        position: 2,
        totalSlides: 6,
        sequence: { kind: "problem_solution", index: 1, side: "problem" },
      })
    ).toBe("wrong_vs_right");
    expect(
      resolveComparisonTreatment({
        archetype: "text_focus",
        semanticRole: "solution",
        position: 5,
        totalSlides: 6,
        sequence: { kind: "problem_solution", index: 2, side: "solution" },
      })
    ).toBe("winner_reveal");
  });

  it("degrades image-led before/after to a type treatment", () => {
    expect(
      resolveComparisonRenderTreatment({
        treatment: "before_after",
        semanticRole: "problem",
      })
    ).toBe("wrong_vs_right");
    expect(
      resolveComparisonRenderTreatment({
        treatment: "before_after",
        semanticRole: "comparison",
        imageUrl: "https://images.example.com/before.jpg",
      })
    ).toBe("before_after");
    expect(
      resolveComparisonRenderTreatment({
        treatment: "comparison_closing",
      })
    ).toBe("comparison_closing");
  });

  it("grounds two-sided images from structured left/right slots", () => {
    const values = {
      left: "Cheap equipment",
      right: "Buy it once",
      headline: "Headline should not win when sides exist",
    };
    expect(textContextForComparisonImageSlot(values, "photo")).toBe(
      "Cheap equipment"
    );
    expect(textContextForComparisonImageSlot(values, "photo_b")).toBe(
      "Buy it once"
    );
    expect(textContextForComparisonImageSlot({ headline: "Only headline" }, "photo")).toBe(
      null
    );
  });

  it("uses structured side labels and never invents generic A/B chrome", () => {
    expect(
      resolveComparisonSideLabels({
        treatment: "asymmetric_comparison",
        sequence: { kind: "problem_solution", index: 1, side: "problem" },
      })
    ).toEqual({ left: "Problem", right: "Better choice" });
    expect(
      resolveComparisonSideLabels({ treatment: "before_after" })
    ).toEqual({ left: "Before", right: "After" });
    expect(
      resolveComparisonSideLabels({ treatment: "myth_reality" })
    ).toEqual({ left: "The belief", right: "What actually matters" });
    expect(
      resolveComparisonSideLabels({
        treatment: "asymmetric_comparison",
        sequence: null,
      })
    ).toEqual({ left: null, right: null });
    expect(
      resolveComparisonSideLabels({ treatment: "side_by_side" })
    ).toEqual({ left: null, right: null });
    expect(
      resolveComparisonSideLabels({ treatment: "wrong_vs_right" })
    ).toEqual({ left: null, right: null });
  });

  it("compacts tradeoff density from content volume", () => {
    expect(resolveComparisonTradeoffDensity(0)).toBe("statement");
    expect(resolveComparisonTradeoffDensity(1)).toBe("statement");
    expect(resolveComparisonTradeoffDensity(2)).toBe("pair");
    expect(resolveComparisonTradeoffDensity(3)).toBe("matrix");
    expect(resolveComparisonTradeoffDensity(4)).toBe("matrix");
  });

  it("rematches adjacent duplicate treatments without inventing semantics", () => {
    const treatments = resolveComparisonTreatments([
      {
        archetype: "diagram_focus",
        semanticRole: "insight",
        position: 3,
        totalSlides: 7,
      },
      {
        archetype: "checklist_stack",
        semanticRole: "framework_step",
        position: 4,
        totalSlides: 7,
      },
      {
        archetype: "checklist_stack",
        semanticRole: "example",
        position: 5,
        totalSlides: 7,
      },
    ]);
    expect(treatments[0]).toBe("tradeoff_matrix");
    expect(treatments[1]).not.toBe("tradeoff_matrix");
    expect(treatments[2]).not.toBe(treatments[1]);
    expect(new Set(treatments).size).toBe(3);
  });

  it("rematches adjacent late winner reveals", () => {
    const treatments = resolveComparisonTreatments([
      {
        archetype: "data_focus",
        semanticRole: "insight",
        position: 5,
        totalSlides: 7,
      },
      {
        archetype: "checklist_stack",
        semanticRole: "framework_step",
        position: 6,
        totalSlides: 7,
      },
    ]);
    expect(treatments[0]).toBe("winner_reveal");
    expect(treatments[1]).not.toBe("winner_reveal");
  });

  it("varies comparison body treatments instead of repeating 50/50", () => {
    const treatments = [2, 3, 4].map((position) =>
      resolveComparisonTreatment({
        archetype: "comparison_split",
        semanticRole: "comparison",
        position,
        totalSlides: 6,
      })
    );
    expect(treatments[0]).toBe("side_by_side");
    expect(treatments[1]).toBe("asymmetric_comparison");
    expect(treatments[2]).toBe("before_after");
    expect(new Set(treatments).size).toBe(3);
  });
});
