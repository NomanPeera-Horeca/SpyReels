import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  CAROUSEL_STUDIO_TEMPLATE_ID,
  type CarouselCreativeBrief,
} from "@shared/carouselStudio";
import { isBreakdownListicleSlide } from "@shared/carouselBreakdownFamily";
import { isComparisonFamilySlide } from "@shared/carouselComparisonFamily";
import { isFrameworkFamilySlide } from "@shared/carouselFrameworkFamily";
import { isStoryNarrativeSlide } from "@shared/carouselStoryFamily";
import { compilePlanningIRToBaselineCompositionIR } from "@shared/carouselCompositionIR";
import { compileCreativeBriefToPlanningIR } from "@shared/carouselPlanningIR";
import { OPEN_CASH_FLOW_USER_PROMPT } from "./fixtures/cashDrainsRemake67";

const persistUpdates: Record<string, unknown>[] = [];
const visualDirectionMock = vi.fn();

vi.mock("../../db", () => ({
  getDb: vi.fn(async () => ({
    update: () => ({
      set: (fields: Record<string, unknown>) => {
        persistUpdates.push(fields);
        return { where: async () => undefined };
      },
    }),
  })),
}));

vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

vi.mock("../generateCarouselVisualDirection", () => ({
  generateCarouselVisualDirection: (...args: unknown[]) =>
    visualDirectionMock(...args),
}));

vi.mock("../resolveSlideImage", () => ({
  resolveSlideImage: vi.fn(async () => null),
}));

import { invokeLLM } from "../../_core/llm";
import { generateCarouselRemake } from "../generateCarouselRemake";

const mockedInvokeLLM = vi.mocked(invokeLLM);

function frameworkBrief(): CarouselCreativeBrief {
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: "brief_framework_remake",
    kicker: "Framework",
    title: "The 4-part menu-item decision",
    description: "A model for deciding whether a restaurant should add a plate.",
    estimatedSlideCount: 7,
    topic: "restaurant menus",
    inferredAudience: "restaurant owners",
    audienceReasoning: "The source names this audience.",
    contentGoal: "authority",
    contentFormat: "framework",
    angleType: "how_to",
    hook: "Use this before you add another plate.",
    corePromise: "Decide whether a new menu item deserves the line.",
    centralInsight: "A new item is a systems decision, not a recipe idea.",
    keyPoints: [
      { title: "Demand", purpose: "Part 1", explanation: "Will guests reorder it?" },
      { title: "Margin", purpose: "Part 2", explanation: "Does the plate pay for the labor?" },
      { title: "Ops", purpose: "Part 3", explanation: "Can the line hold it on a Saturday?" },
    ],
    slideOutline: [
      { position: 1, role: "hook", objective: "Name the model", recommendedVisual: "diagram", listItemIndex: null },
      { position: 2, role: "context", objective: "Show the four parts together", recommendedVisual: "diagram", listItemIndex: null },
      { position: 3, role: "framework", objective: "Demand check", recommendedVisual: "diagram", listItemIndex: null },
      { position: 4, role: "framework", objective: "Margin check", recommendedVisual: "diagram", listItemIndex: null },
      { position: 5, role: "framework", objective: "Ops check", recommendedVisual: "diagram", listItemIndex: null },
      { position: 6, role: "example", objective: "Apply the model to one item", recommendedVisual: "text", listItemIndex: null },
      { position: 7, role: "cta", objective: "Close on the decision", recommendedVisual: "text", listItemIndex: null },
    ],
    layoutFamily: "framework",
    visualDirection: "A senior-designer model, not a 4-box grid.",
    imageDirection: "Diagram first. Photos only if a slide asks.",
    claimRisk: "low",
    researchMode: "none",
    evidenceRequirements: [],
    prohibitedClaims: ["Guaranteed sales"],
    ctaDirection: "Run the four checks before you print the menu",
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

function genericCopyPayload(slideIds: string[]) {
  const slides: Record<string, Record<string, string>> = {};
  slideIds.forEach((id, index) => {
    slides[id] = {
      kicker: index === 0 ? "FRAMEWORK" : "",
      headline: `Headline for ${id} that is long enough`,
      body: `Body copy for ${id} that stays inside the budget for a mobile slide.`,
      support: `Support line for ${id} that fills the extra Framework slot.`,
      left: "Repair it",
      right: "Replace it",
      cta_label: "Save this",
      slideIntent: index === slideIds.length - 1 ? "closing" : "content",
      ...(index === slideIds.length - 1 ? { closingType: "follow" } : {}),
    };
  });
  return slides;
}

describe("generateCarouselRemake Framework family wiring", () => {
  beforeEach(() => {
    persistUpdates.length = 0;
    mockedInvokeLLM.mockReset();
    visualDirectionMock.mockReset();
  });

  it("wires Visual Director into the Framework family path", async () => {
    const brief = frameworkBrief();
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "The 4-part framework I use to decide whether a restaurant should add a new menu item",
    });
    expect(planningIR.strategy.preferredFamily).toBe("framework");
    visualDirectionMock.mockResolvedValue({
      compositionIR: compilePlanningIRToBaselineCompositionIR(planningIR),
      source: "ai",
      attempts: 1,
      issues: [],
    });
    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(
              genericCopyPayload(
                brief.slideOutline.map((_, index) =>
                  `slide_${String(index + 1).padStart(2, "0")}`
                )
              )
            ),
          },
        },
      ],
    });

    await generateCarouselRemake(6901, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent:
        "The 4-part framework I use to decide whether a restaurant should add a new menu item",
      creativeBrief: brief,
    });

    expect(visualDirectionMock).toHaveBeenCalledTimes(1);
    const completed = persistUpdates.find((fields) => fields.status === "completed");
    expect(completed).toBeTruthy();
    const slides = completed?.slideStructureJson as Array<{
      composition?: {
        family?: string;
        treatment?: string;
        listItemIndex?: number | null;
      };
    }>;
    expect(slides.every(isFrameworkFamilySlide)).toBe(true);
    expect(slides.some(isStoryNarrativeSlide)).toBe(false);
    expect(slides.some(isComparisonFamilySlide)).toBe(false);
    expect(slides.some(isBreakdownListicleSlide)).toBe(false);
    expect(slides[0]?.composition?.treatment).toBe("framework_cover");
    expect(slides.at(-1)?.composition?.treatment).toBe("framework_closing");
    expect(slides.every((slide) => slide.composition?.listItemIndex === null)).toBe(
      true
    );
  });

  it("routes the repair-or-replace Framework prompt without inventing parts", async () => {
    const brief: CarouselCreativeBrief = {
      ...frameworkBrief(),
      id: "brief_framework_repair_or_replace",
      title: "Repair or Replace? A Simple Framework for Restaurant Equipment",
      description: "A model for deciding whether to repair or replace equipment.",
      angleType: "diagnostic",
      hook: "Repair or replace is a model, not a guess.",
      corePromise: "Give owners a simple model for the next equipment call.",
      keyPoints: [
        { title: "Failure mode", purpose: "Name the failure", explanation: "Part or system?" },
      ],
      slideOutline: [
        { position: 1, role: "hook", objective: "Open on equipment failure", recommendedVisual: "photo", listItemIndex: null },
        { position: 2, role: "problem", objective: "Name gut-feel cost", recommendedVisual: "text", listItemIndex: null },
        { position: 3, role: "framework", objective: "Introduce the decision model", recommendedVisual: "diagram", listItemIndex: null },
        { position: 4, role: "insight", objective: "Financial filters", recommendedVisual: "text", listItemIndex: null },
        { position: 5, role: "insight", objective: "Operational filters", recommendedVisual: "text", listItemIndex: null },
        { position: 6, role: "example", objective: "Apply the model", recommendedVisual: "text", listItemIndex: null },
        { position: 7, role: "cta", objective: "Close on the decision", recommendedVisual: "text", listItemIndex: null },
      ],
    };
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent:
        "A simple framework for deciding whether to repair or replace restaurant equipment",
    });
    expect(planningIR.strategy.preferredFamily).toBe("framework");
    visualDirectionMock.mockResolvedValue({
      compositionIR: compilePlanningIRToBaselineCompositionIR(planningIR),
      source: "ai",
      attempts: 1,
      issues: [],
    });
    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(
              genericCopyPayload(
                brief.slideOutline.map((_, index) =>
                  `slide_${String(index + 1).padStart(2, "0")}`
                )
              )
            ),
          },
        },
      ],
    });

    await generateCarouselRemake(6904, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent:
        "A simple framework for deciding whether to repair or replace restaurant equipment",
      creativeBrief: brief,
    });

    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: {
        family?: string;
        frameworkPartCount?: number;
        frameworkPartIndex?: number | null;
      };
    }>;
    expect(slides.every(isFrameworkFamilySlide)).toBe(true);
    expect(slides.some(isStoryNarrativeSlide)).toBe(false);
    expect(slides.some(isComparisonFamilySlide)).toBe(false);
    expect(slides.some(isBreakdownListicleSlide)).toBe(false);
    expect(
      slides.every((slide) => slide.composition?.frameworkPartCount === 0)
    ).toBe(true);
    expect(
      slides.every((slide) => slide.composition?.frameworkPartIndex == null)
    ).toBe(true);
  });

  it("does not steal an open Story plan", async () => {
    const brief: CarouselCreativeBrief = {
      ...frameworkBrief(),
      id: "brief_story_not_framework",
      title: "The night the till went quiet",
      contentFormat: "story",
      layoutFamily: "story",
      angleType: "story",
      hook: "The night the till went quiet.",
      corePromise: "Walk owners through one cash-crisis night.",
      slideOutline: [
        { position: 1, role: "hook", objective: "Open on the quiet till", recommendedVisual: "photo", listItemIndex: null },
        { position: 2, role: "context", objective: "Set the night", recommendedVisual: "text", listItemIndex: null },
        { position: 3, role: "problem", objective: "Show the cost", recommendedVisual: "text", listItemIndex: null },
        { position: 4, role: "insight", objective: "Reveal the turning point", recommendedVisual: "photo", listItemIndex: null },
        { position: 5, role: "cta", objective: "Close the lesson", recommendedVisual: "text", listItemIndex: null },
      ],
    };
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
    });
    visualDirectionMock.mockResolvedValue({
      compositionIR: compilePlanningIRToBaselineCompositionIR(planningIR),
      source: "ai",
      attempts: 1,
      issues: [],
    });
    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(
              genericCopyPayload(
                brief.slideOutline.map((_, index) =>
                  `slide_${String(index + 1).padStart(2, "0")}`
                )
              )
            ),
          },
        },
      ],
    });

    await generateCarouselRemake(6902, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
      creativeBrief: brief,
    });

    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: { family?: string };
    }>;
    expect(slides.every(isStoryNarrativeSlide)).toBe(true);
    expect(slides.some(isFrameworkFamilySlide)).toBe(false);
  });

  it("does not steal an open Comparison plan", async () => {
    const brief: CarouselCreativeBrief = {
      ...frameworkBrief(),
      id: "brief_comparison_not_framework",
      title: "Cheap equipment vs buying right first",
      contentFormat: "comparison",
      layoutFamily: "comparison",
      angleType: "contrarian",
      hook: "Cheap equipment costs more than it saves.",
      corePromise: "Show the real trade-off.",
      slideOutline: [
        { position: 1, role: "hook", objective: "Open the contrast", recommendedVisual: "comparison", listItemIndex: null },
        { position: 2, role: "comparison", objective: "Define cheap equipment", recommendedVisual: "comparison", listItemIndex: null },
        { position: 3, role: "comparison", objective: "Define buying right first", recommendedVisual: "comparison", listItemIndex: null },
        { position: 4, role: "insight", objective: "Name the operating cost", recommendedVisual: "text", listItemIndex: null },
        { position: 5, role: "cta", objective: "Close the decision", recommendedVisual: "text", listItemIndex: null },
      ],
    };
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "Cheap restaurant equipment vs buying the right equipment",
    });
    visualDirectionMock.mockResolvedValue({
      compositionIR: compilePlanningIRToBaselineCompositionIR(planningIR),
      source: "ai",
      attempts: 1,
      issues: [],
    });
    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(
              genericCopyPayload(
                brief.slideOutline.map((_, index) =>
                  `slide_${String(index + 1).padStart(2, "0")}`
                )
              )
            ),
          },
        },
      ],
    });

    await generateCarouselRemake(6903, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: "Cheap restaurant equipment vs buying the right equipment",
      creativeBrief: brief,
    });

    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: { family?: string };
    }>;
    expect(slides.every(isComparisonFamilySlide)).toBe(true);
    expect(slides.some(isFrameworkFamilySlide)).toBe(false);
  });
});
