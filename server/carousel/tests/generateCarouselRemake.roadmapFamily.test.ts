import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  CAROUSEL_STUDIO_TEMPLATE_ID,
  type CarouselCreativeBrief,
} from "@shared/carouselStudio";
import { isBreakdownListicleSlide } from "@shared/carouselBreakdownFamily";
import { isComparisonFamilySlide } from "@shared/carouselComparisonFamily";
import { isFrameworkFamilySlide } from "@shared/carouselFrameworkFamily";
import { isRoadmapFamilySlide } from "@shared/carouselRoadmapFamily";
import { isStoryNarrativeSlide } from "@shared/carouselStoryFamily";
import { compilePlanningIRToBaselineCompositionIR } from "@shared/carouselCompositionIR";
import { compileCreativeBriefToPlanningIR } from "@shared/carouselPlanningIR";

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

function roadmapBrief(): CarouselCreativeBrief {
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: "brief_roadmap_remake",
    kicker: "How to",
    title: "How to simplify a restaurant menu without hurting revenue",
    description: "A path to cut the menu and keep the sales.",
    estimatedSlideCount: 7,
    topic: "restaurant menus",
    inferredAudience: "restaurant owners",
    audienceReasoning: "The source names this audience.",
    contentGoal: "education",
    contentFormat: "roadmap",
    angleType: "how_to",
    hook: "Cut the menu without cutting the sales.",
    corePromise: "Give owners a path to simplify the menu.",
    centralInsight: "The sell-through path matters more than the item count.",
    keyPoints: [
      { title: "Cut the dead weight", purpose: "Step 1", explanation: "Remove items that never get reordered." },
      { title: "Protect signatures", purpose: "Step 2", explanation: "Keep the plates guests ask for." },
      { title: "Rebuild the ticket", purpose: "Step 3", explanation: "Make the remaining path easy to order." },
      { title: "Watch reorders", purpose: "Step 4", explanation: "Use reorder rate as the check." },
    ],
    slideOutline: [
      { position: 1, role: "hook", objective: "Name the path", recommendedVisual: "text", listItemIndex: null },
      { position: 2, role: "context", objective: "Show the route", recommendedVisual: "diagram", listItemIndex: null },
      { position: 3, role: "insight", objective: "Cut the dead weight", recommendedVisual: "checklist", listItemIndex: 1 },
      { position: 4, role: "insight", objective: "Protect the signatures", recommendedVisual: "text", listItemIndex: 2 },
      { position: 5, role: "insight", objective: "Rebuild the ticket path", recommendedVisual: "text", listItemIndex: 3 },
      { position: 6, role: "insight", objective: "Watch the reorder rate", recommendedVisual: "text", listItemIndex: 4 },
      { position: 7, role: "cta", objective: "Close on the first cut", recommendedVisual: "text", listItemIndex: null },
    ],
    layoutFamily: "roadmap",
    visualDirection: "A guided execution path, not a model and not a listicle.",
    imageDirection: "Photos only if a slide asks.",
    claimRisk: "low",
    researchMode: "none",
    evidenceRequirements: [],
    prohibitedClaims: ["Guaranteed sales"],
    ctaDirection: "Start with the items that never get reordered",
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
      kicker: index === 0 ? "HOW TO" : "",
      headline: `Headline for ${id} that is long enough`,
      body: `Body copy for ${id} that stays inside the budget for a mobile slide.`,
      support: `Support line for ${id} that fills the extra Roadmap slot.`,
      cta_label: "Start the first cut",
      slideIntent: index === slideIds.length - 1 ? "closing" : "content",
      ...(index === slideIds.length - 1 ? { closingType: "follow" } : {}),
    };
  });
  return slides;
}

describe("generateCarouselRemake Roadmap family wiring", () => {
  beforeEach(() => {
    persistUpdates.length = 0;
    mockedInvokeLLM.mockReset();
    visualDirectionMock.mockReset();
  });

  it("wires Visual Director into the Roadmap family path", async () => {
    const brief = roadmapBrief();
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "How to simplify a restaurant menu without hurting revenue",
    });
    expect(planningIR.strategy.preferredFamily).toBe("roadmap");
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

    await generateCarouselRemake(7901, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: "How to simplify a restaurant menu without hurting revenue",
      creativeBrief: brief,
    });

    expect(visualDirectionMock).toHaveBeenCalledTimes(1);
    const completed = persistUpdates.find((fields) => fields.status === "completed");
    expect(completed).toBeTruthy();
    const slides = completed?.slideStructureJson as Array<{
      composition?: {
        family?: string;
        treatment?: string;
        roadmapStepCount?: number;
        roadmapStepIndex?: number | null;
        listItemIndex?: number | null;
      };
    }>;
    expect(slides.every(isRoadmapFamilySlide)).toBe(true);
    expect(slides.some(isFrameworkFamilySlide)).toBe(false);
    expect(slides.some(isStoryNarrativeSlide)).toBe(false);
    expect(slides.some(isComparisonFamilySlide)).toBe(false);
    expect(slides.some(isBreakdownListicleSlide)).toBe(false);
    expect(slides[0]?.composition?.treatment).toBe("howto_cover");
    expect(slides.at(-1)?.composition?.treatment).toBe("howto_closing");
    expect(slides.every((slide) => slide.composition?.listItemIndex === null)).toBe(
      true
    );
    expect(slides.map((slide) => slide.composition?.roadmapStepIndex)).toEqual([
      null,
      null,
      1,
      2,
      3,
      4,
      null,
    ]);
  });

  it("does not steal an open Framework plan with angleType how_to", async () => {
    const brief: CarouselCreativeBrief = {
      ...roadmapBrief(),
      id: "brief_framework_not_roadmap",
      title: "The framework I use to decide repair or replace",
      contentFormat: "framework",
      layoutFamily: "framework",
      angleType: "how_to",
      hook: "Repair or replace is a model.",
      slideOutline: [
        { position: 1, role: "hook", objective: "Name the model", recommendedVisual: "diagram", listItemIndex: null },
        { position: 2, role: "framework", objective: "Failure mode", recommendedVisual: "diagram", listItemIndex: null },
        { position: 3, role: "framework", objective: "Remaining life", recommendedVisual: "diagram", listItemIndex: null },
        { position: 4, role: "cta", objective: "Close on the decision", recommendedVisual: "text", listItemIndex: null },
      ],
    };
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "The framework I use to decide repair or replace",
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

    await generateCarouselRemake(7902, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: "The framework I use to decide repair or replace",
      creativeBrief: brief,
    });

    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: { family?: string };
    }>;
    expect(slides.every(isFrameworkFamilySlide)).toBe(true);
    expect(slides.some(isRoadmapFamilySlide)).toBe(false);
  });
});
