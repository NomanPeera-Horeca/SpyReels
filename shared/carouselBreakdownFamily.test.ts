import { describe, expect, it } from "vitest";
import { compilePlanningIRToBaselineCompositionIR } from "./carouselCompositionIR";
import { compileCreativeBriefToPlanningIR } from "./carouselPlanningIR";
import {
  CAROUSEL_STUDIO_TEMPLATE_ID,
  scoreCarouselCreativeBrief,
  type CarouselCreativeBrief,
} from "./carouselStudio";
import { CAROUSEL_TEMPLATES_BY_ID } from "./carouselTemplates";
import {
  applyPlanningSequenceToCopy,
  breakdownSequenceLabel,
  buildBreakdownListicleSlides,
  canUseBreakdownListicleFamily,
  isBreakdownListicleSlide,
  isSupportedBreakdownArchetype,
  resolveBreakdownListicleTreatment,
  shouldUseBreakdownListicleFamily,
} from "./carouselBreakdownFamily";
import {
  OPEN_CASH_FLOW_USER_PROMPT,
  cashDrainsRemake67CorrectedBrief,
} from "../server/carousel/tests/fixtures/cashDrainsRemake67";
import { buildCashDrainsBreakdownSlice } from "./carouselBreakdownSliceFixture";
import { effectiveSlidesForCreativeBrief } from "../server/carousel/generateCarouselRemake";

function sampleBrief(): CarouselCreativeBrief {
  return {
    schemaVersion: 2,
    isLegacy: false,
    id: "brief_family",
    kicker: "Diagnostic",
    title: "The 6 Silent Cash Drains Killing Small Businesses",
    description: "A breakdown that names cash drains.",
    estimatedSlideCount: 5,
    topic: "Cash drains",
    inferredAudience: "Owners",
    audienceReasoning: "Direct.",
    contentGoal: "saves",
    contentFormat: "breakdown",
    angleType: "diagnostic",
    hook: "Profitable on paper, empty at the bank.",
    corePromise: "Name the drain.",
    centralInsight: "Cash dies from structure, not sales.",
    keyPoints: [
      { title: "A", purpose: "a", explanation: "a" },
      { title: "B", purpose: "b", explanation: "b" },
      { title: "C", purpose: "c", explanation: "c" },
    ],
    slideOutline: [
      {
        position: 1,
        role: "hook",
        objective: "Open on the cash warning.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      {
        position: 2,
        role: "problem",
        objective: "Name drain one.",
        recommendedVisual: "text",
        listItemIndex: 1,
      },
      {
        position: 3,
        role: "problem",
        objective: "Name drain two.",
        recommendedVisual: "text",
        listItemIndex: 2,
      },
      {
        position: 4,
        role: "cta",
        objective: "Ask which drain hits.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
    ],
    layoutFamily: "breakdown",
    visualDirection: "Numbered cards.",
    imageDirection: "Typography first.",
    claimRisk: "medium",
    researchMode: "none",
    evidenceRequirements: [],
    prohibitedClaims: [],
    ctaDirection: "Comment the drain.",
    scores: scoreCarouselCreativeBrief({
      relevance: 80,
      usefulness: 80,
      specificity: 80,
      visualPotential: 80,
      factualSafety: 80,
      originality: 80,
    }),
    confidence: 0.8,
  };
}

describe("breakdown listicle family treatments", () => {
  it("selects the matching treatment for each supported archetype", () => {
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "text_focus",
        semanticRole: "cover",
      })
    ).toBe("strong_cover");
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "text_visual_split",
        semanticRole: "cover",
      })
    ).toBe("text_visual_split");
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "number_focus",
        semanticRole: "list_item",
      })
    ).toBe("number_focus");
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "comparison_split",
        semanticRole: "list_item",
      })
    ).toBe("comparison_split");
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "diagram_focus",
        semanticRole: "list_item",
      })
    ).toBe("diagram_focus");
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "timeline_flow",
        semanticRole: "list_item",
      })
    ).toBe("timeline_flow");
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "text_visual_split",
        semanticRole: "list_item",
      })
    ).toBe("text_visual_split");
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "closing_focus",
        semanticRole: "closing",
      })
    ).toBe("closing_focus");
  });

  it("renders comparison differently from number_focus", () => {
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "comparison_split",
        semanticRole: "list_item",
      })
    ).not.toBe(
      resolveBreakdownListicleTreatment({
        archetype: "number_focus",
        semanticRole: "list_item",
      })
    );
  });

  it("renders timeline differently from diagram_focus", () => {
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "timeline_flow",
        semanticRole: "list_item",
      })
    ).not.toBe(
      resolveBreakdownListicleTreatment({
        archetype: "diagram_focus",
        semanticRole: "list_item",
      })
    );
  });

  it("falls back safely for unsupported archetypes", () => {
    expect(isSupportedBreakdownArchetype("quote_focus")).toBe(false);
    expect(isSupportedBreakdownArchetype("framework_grid")).toBe(false);
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "quote_focus",
        semanticRole: "list_item",
      })
    ).toBe("number_focus");
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "full_bleed_visual",
        semanticRole: "cover",
      })
    ).toBe("strong_cover");
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "data_focus",
        semanticRole: "insight",
      })
    ).toBe("text_focus");
    expect(
      resolveBreakdownListicleTreatment({
        archetype: "story_scene",
        semanticRole: "closing",
      })
    ).toBe("closing_focus");
  });

  it("keeps cover as cover and closing as closing", () => {
    const { slides } = buildCashDrainsBreakdownSlice();
    expect(slides[0]?.composition?.semanticRole).toBe("cover");
    expect(slides[0]?.composition?.treatment).toBe("strong_cover");
    expect(slides[0]?.composition?.listItemIndex).toBeNull();
    expect(slides.at(-1)?.composition?.semanticRole).toBe("closing");
    expect(slides.at(-1)?.composition?.treatment).toBe("closing_focus");
    expect(slides.at(-1)?.composition?.listItemIndex).toBeNull();
  });

  it("keeps semantic numbering from Planning IR, not slide position", () => {
    expect(breakdownSequenceLabel(3)).toBe("03");
    const { planningIR, slides, values } = buildCashDrainsBreakdownSlice();
    const thirdItem = slides[3];
    expect(thirdItem?.id).toBe("slide_04");
    expect(thirdItem?.composition?.listItemIndex).toBe(3);
    expect(breakdownSequenceLabel(thirdItem?.composition?.listItemIndex)).toBe(
      "03"
    );
    expect(planningIR.beats[3]?.position).toBe(4);
    expect(values.slide_04?.kicker).toBe("03");
    expect(values.slide_04?.kicker).not.toBe("04");
  });

  it("overwrites a wrong kicker with the planning list index", () => {
    const { slides } = buildCashDrainsBreakdownSlice();
    const fixed = applyPlanningSequenceToCopy(slides, {
      slide_04: { kicker: "07", headline: "Dead stock" },
    });
    expect(fixed.slide_04?.kicker).toBe("03");
  });
});

describe("breakdown listicle slide build", () => {
  it("attaches family metadata from Composition IR archetypes", () => {
    const { slides, compositionIR } = buildCashDrainsBreakdownSlice();
    expect(slides).toHaveLength(8);
    expect(slides.every(isBreakdownListicleSlide)).toBe(true);
    expect(slides.map((slide) => slide.composition?.archetype)).toEqual(
      compositionIR.slides.map((slide) => slide.archetype)
    );
    expect(slides.map((slide) => slide.composition?.treatment)).toEqual([
      "strong_cover",
      "comparison_split",
      "number_focus",
      "diagram_focus",
      "timeline_flow",
      "text_visual_split",
      "number_focus",
      "closing_focus",
    ]);
    expect(slides[5]?.imageSlots?.[0]?.id).toBe("photo");
    expect(slides[2]?.imageSlots).toBeUndefined();
    expect(slides[3]?.slots.some((slot) => slot.id === "support")).toBe(true);
    expect(slides[4]?.slots.some((slot) => slot.id === "support")).toBe(true);
    expect(slides[3]?.slots.find((slot) => slot.id === "kicker")?.budget).toEqual({
      min: 1,
      max: 3,
    });
  });

  it("uses the studio template only as a design host, not as slide clones", () => {
    const template = CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID);
    const { slides } = buildCashDrainsBreakdownSlice();
    expect(template?.slides).toHaveLength(4);
    expect(slides).toHaveLength(8);
    expect(template?.slides.every((slide) => !slide.composition)).toBe(true);
  });
});

describe("legacy template path", () => {
  it("leaves catalog templates on their existing layouts", () => {
    const template = CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID);
    expect(template).toBeDefined();
    expect(template!.slides.map((slide) => slide.layoutId)).toEqual([
      "hook_photo_top",
      "list_item_numbered",
      "list_item_numbered",
      "cta_bold_center",
    ]);
    expect(template!.slides.some(isBreakdownListicleSlide)).toBe(false);
  });

  it("keeps effectiveSlidesForCreativeBrief on the cloned template path", () => {
    const template = CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID);
    const brief = sampleBrief();
    const slides = effectiveSlidesForCreativeBrief(
      template!,
      brief,
      OPEN_CASH_FLOW_USER_PROMPT
    );
    expect(slides.some(isBreakdownListicleSlide)).toBe(false);
    expect(slides[0]?.layoutId).toBe("hook_photo_top");
    expect(slides[1]?.layoutId).toBe("list_item_numbered");
    expect(slides.at(-1)?.layoutId).toBe("cta_bold_center");
  });

  it("does not activate the family without a planning IR", () => {
    expect(
      shouldUseBreakdownListicleFamily({
        layoutFamily: "breakdown",
        planningIR: null,
      })
    ).toBe(false);
    expect(canUseBreakdownListicleFamily(null)).toBe(false);
  });

  it("keeps baseline composition available when Visual Director is skipped", () => {
    const planningIR = compileCreativeBriefToPlanningIR({
      brief: sampleBrief(),
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    const baseline = compilePlanningIRToBaselineCompositionIR(planningIR);
    expect(baseline.slides[0]?.semanticRole).toBe("cover");
    expect(baseline.slides.at(-1)?.semanticRole).toBe("closing");
    expect(baseline.slides[0]?.archetype).toBe("text_focus");
  });
});

function frameworkLabeledCashDrainsBrief(): CarouselCreativeBrief {
  const brief = cashDrainsRemake67CorrectedBrief();
  return {
    ...brief,
    contentFormat: "framework",
    layoutFamily: "framework",
    slideOutline: brief.slideOutline.map((slide, index) => {
      if (index === 0 || index === brief.slideOutline.length - 1) return slide;
      return { ...slide, role: "framework" };
    }),
  };
}

function storyPlanBrief(): CarouselCreativeBrief {
  return {
    ...sampleBrief(),
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
        objective: "Ask what they would check first.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
    ],
  };
}

function openFrameworkBrief(): CarouselCreativeBrief {
  return {
    ...sampleBrief(),
    title: "A weekly cash check owners can repeat",
    hook: "A weekly cash check owners can repeat.",
    corePromise: "Give owners a weekly cash check they can run every Monday.",
    contentFormat: "framework",
    layoutFamily: "framework",
    estimatedSlideCount: 5,
    slideOutline: [
      {
        position: 1,
        role: "hook",
        objective: "Promise a weekly cash check.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      {
        position: 2,
        role: "framework",
        objective: "Show the first weekly check step.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      {
        position: 3,
        role: "insight",
        objective: "Name why the check works.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      {
        position: 4,
        role: "framework",
        objective: "Show the second weekly check step.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      {
        position: 5,
        role: "cta",
        objective: "Ask them to run it next Monday.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
    ],
  };
}

describe("canUseBreakdownListicleFamily", () => {
  it("is eligible when preferredFamily is breakdown", () => {
    const planningIR = compileCreativeBriefToPlanningIR({
      brief: cashDrainsRemake67CorrectedBrief(),
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
    });
    expect(planningIR.strategy.preferredFamily).toBe("breakdown");
    expect(canUseBreakdownListicleFamily(planningIR)).toBe(true);
  });

  it("is eligible for a framework-labeled cover plus list items plus closing", () => {
    const planningIR = compileCreativeBriefToPlanningIR({
      brief: frameworkLabeledCashDrainsBrief(),
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
    });
    expect(planningIR.strategy.preferredFamily).toBe("framework");
    expect(planningIR.contract.kind).toBe("enumerated");
    expect(planningIR.beats.map((beat) => beat.role)).toEqual([
      "cover",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "list_item",
      "closing",
    ]);
    expect(
      planningIR.beats
        .slice(1, -1)
        .every((beat) => beat.sequence?.kind === "list")
    ).toBe(true);
    expect(canUseBreakdownListicleFamily(planningIR)).toBe(true);
  });

  it("is not eligible for a story plan with no list sequence", () => {
    const planningIR = compileCreativeBriefToPlanningIR({
      brief: storyPlanBrief(),
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(planningIR.strategy.preferredFamily).toBe("story");
    expect(planningIR.beats.every((beat) => beat.sequence == null)).toBe(true);
    expect(canUseBreakdownListicleFamily(planningIR)).toBe(false);
  });

  it("does not treat an open framework with framework_step beats as a listicle", () => {
    const planningIR = compileCreativeBriefToPlanningIR({
      brief: openFrameworkBrief(),
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    expect(planningIR.strategy.preferredFamily).toBe("framework");
    expect(planningIR.contract.kind).toBe("open");
    expect(planningIR.beats.map((beat) => beat.role)).toEqual([
      "cover",
      "framework_step",
      "insight",
      "framework_step",
      "closing",
    ]);
    expect(planningIR.beats.every((beat) => beat.sequence == null)).toBe(true);
    expect(canUseBreakdownListicleFamily(planningIR)).toBe(false);
  });
});
