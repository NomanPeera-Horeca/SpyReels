import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAROUSEL_STUDIO_TEMPLATE_ID,
  type CarouselCreativeBrief,
} from "@shared/carouselStudio";
import { isBreakdownListicleSlide } from "@shared/carouselBreakdownFamily";
import { isComparisonFamilySlide } from "@shared/carouselComparisonFamily";
import { isStoryNarrativeSlide } from "@shared/carouselStoryFamily";
import { compilePlanningIRToBaselineCompositionIR } from "@shared/carouselCompositionIR";
import { compileCreativeBriefToPlanningIR } from "@shared/carouselPlanningIR";
import { CAROUSEL_CREATIVE_BRIEF_VERSION } from "@shared/carouselStudio";
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
import { resolveSlideImage } from "../resolveSlideImage";
import { normalizeSlideImages } from "@shared/carouselTemplates";

const mockedInvokeLLM = vi.mocked(invokeLLM);
const mockedResolveSlideImage = vi.mocked(resolveSlideImage);

const REMAKE_103_DUMP = JSON.parse(
  readFileSync(
    resolve("docs/qa/carousel-comparison-family-v1/remake-103-brief.json"),
    "utf8"
  )
) as {
  sourceContent: string;
  brief: CarouselCreativeBrief;
};

function comparisonBrief(): CarouselCreativeBrief {
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: "brief_comparison_remake",
    kicker: "Comparison",
    title: "Cheap equipment vs buying right the first time",
    description: "A contrast between cheap restaurant equipment and buying once.",
    estimatedSlideCount: 6,
    topic: "restaurant equipment",
    inferredAudience: "restaurant owners",
    audienceReasoning: "The source names this audience.",
    contentGoal: "authority",
    contentFormat: "comparison",
    angleType: "contrarian",
    hook: "Cheap equipment costs more than it saves.",
    corePromise: "Show the real trade-off between cheap and right-first.",
    centralInsight: "The cheaper buy often becomes the second buy.",
    keyPoints: [
      { title: "Cheap now", purpose: "Define A", explanation: "Low ticket, high replacement." },
      { title: "Right first", purpose: "Define B", explanation: "Higher ticket, fewer replacements." },
      { title: "Trade-off", purpose: "Name the cost", explanation: "Downtime and second purchases." },
    ],
    slideOutline: [
      { position: 1, role: "hook", objective: "Open the contrast", recommendedVisual: "comparison", listItemIndex: null },
      { position: 2, role: "comparison", objective: "Define cheap equipment", recommendedVisual: "comparison", listItemIndex: null },
      { position: 3, role: "comparison", objective: "Define buying right first", recommendedVisual: "comparison", listItemIndex: null },
      { position: 4, role: "insight", objective: "Name the operating cost difference", recommendedVisual: "text", listItemIndex: null },
      { position: 5, role: "takeaway", objective: "Recommend the better choice", recommendedVisual: "text", listItemIndex: null },
      { position: 6, role: "cta", objective: "Close on the decision", recommendedVisual: "text", listItemIndex: null },
    ],
    layoutFamily: "comparison",
    visualDirection: "Editorial contrast, not two cards.",
    imageDirection: "Equipment and kitchen stills.",
    claimRisk: "low",
    researchMode: "none",
    evidenceRequirements: [],
    prohibitedClaims: ["Guaranteed savings"],
    ctaDirection: "Choose the equipment you will not replace",
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
      kicker: index === 0 ? "COMPARE" : "",
      headline: `Headline for ${id} that is long enough`,
      body: `Body copy for ${id} that stays inside the budget for a mobile slide.`,
      left: "Cheap equipment",
      right: "Buy it once",
      support: `Support line for ${id} that fills the extra Comparison slot.`,
      cta_label: "Save this",
      slideIntent: index === slideIds.length - 1 ? "closing" : "content",
      ...(index === slideIds.length - 1 ? { closingType: "follow" } : {}),
    };
  });
  return slides;
}

describe("generateCarouselRemake Comparison family wiring", () => {
  beforeEach(() => {
    persistUpdates.length = 0;
    mockedInvokeLLM.mockReset();
    visualDirectionMock.mockReset();
    mockedResolveSlideImage.mockReset();
    mockedResolveSlideImage.mockImplementation(
      async (_hint, _niche, _uploaded, _text, options) =>
        `https://images.example.com/${options?.imageSlotId ?? "photo"}.jpg`
    );
  });

  it("wires Visual Director into the Comparison family path", async () => {
    const brief = comparisonBrief();
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "Cheap restaurant equipment vs buying the right equipment the first time",
    });
    expect(planningIR.strategy.preferredFamily).toBe("comparison");
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

    await generateCarouselRemake(6801, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: "Cheap restaurant equipment vs buying the right equipment the first time",
      creativeBrief: brief,
    });

    expect(visualDirectionMock).toHaveBeenCalledTimes(1);
    const completed = persistUpdates.find((fields) => fields.status === "completed");
    expect(completed).toBeTruthy();
    const slides = completed?.slideStructureJson as Array<{
      composition?: {
        family?: string;
        treatment?: string;
        sequence?: unknown;
        listItemIndex?: number | null;
      };
    }>;
    expect(slides.every(isComparisonFamilySlide)).toBe(true);
    expect(slides.some(isStoryNarrativeSlide)).toBe(false);
    expect(slides.some(isBreakdownListicleSlide)).toBe(false);
    expect(slides[0]?.composition?.treatment).toBe("contrast_cover");
    expect(slides.at(-1)?.composition?.treatment).toBe("comparison_closing");
    expect(slides.every((slide) => slide.composition?.listItemIndex === null)).toBe(
      true
    );
  });

  it("does not steal an open Story plan", async () => {
    const brief: CarouselCreativeBrief = {
      ...comparisonBrief(),
      id: "brief_story_not_comparison",
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

    await generateCarouselRemake(6802, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
      creativeBrief: brief,
    });

    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: { family?: string };
    }>;
    expect(slides.every(isStoryNarrativeSlide)).toBe(true);
    expect(slides.some(isComparisonFamilySlide)).toBe(false);
    expect(slides.some(isBreakdownListicleSlide)).toBe(false);

    const imageCalls = mockedResolveSlideImage.mock.calls;
    const slideIds = new Set(
      imageCalls.map((call) => call[4]?.slideId).filter(Boolean)
    );
    for (const slideId of slideIds) {
      const callsForSlide = imageCalls.filter(
        (call) => call[4]?.slideId === slideId
      );
      expect(callsForSlide).toHaveLength(1);
      expect(callsForSlide[0]?.[4]?.imageSlotId).not.toBe("photo_b");
    }
    const persisted = completed?.imageUrlsJson as
      | Record<string, string | Record<string, string>>
      | undefined;
    for (const entry of Object.values(persisted ?? {})) {
      expect(typeof entry).toBe("string");
    }
  });

  it("resolves both Comparison image slots with side-aware text context", async () => {
    const brief = comparisonBrief();
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent:
        "Cheap restaurant equipment vs buying the right equipment the first time",
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

    await generateCarouselRemake(6803, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent:
        "Cheap restaurant equipment vs buying the right equipment the first time",
      creativeBrief: brief,
    });

    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      id: string;
      imageSlots?: Array<{ id: string }>;
    }>;
    const twoSlot = slides.find((slide) => (slide.imageSlots?.length ?? 0) > 1);
    expect(twoSlot?.imageSlots?.map((slot) => slot.id)).toEqual([
      "photo",
      "photo_b",
    ]);

    const calls = mockedResolveSlideImage.mock.calls.filter(
      (call) => call[4]?.slideId === twoSlot?.id
    );
    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call[4]?.imageSlotId).sort()).toEqual([
      "photo",
      "photo_b",
    ]);

    const primary = calls.find((call) => call[4]?.imageSlotId === "photo");
    const secondary = calls.find((call) => call[4]?.imageSlotId === "photo_b");
    expect(primary?.[3]).toBe("Cheap equipment");
    expect(secondary?.[3]).toBe("Buy it once");
    expect(primary?.[3]).not.toBe(secondary?.[3]);

    const persisted = (
      completed?.imageUrlsJson as Record<string, Record<string, string>>
    )[twoSlot!.id];
    expect(persisted).toEqual({
      photo: "https://images.example.com/photo.jpg",
      photo_b: "https://images.example.com/photo_b.jpg",
    });

    const rendererShape = normalizeSlideImages(persisted);
    expect(rendererShape.imageUrl).toBe("https://images.example.com/photo.jpg");
    expect(rendererShape.imageUrlsBySlot).toEqual({
      photo: "https://images.example.com/photo.jpg",
      photo_b: "https://images.example.com/photo_b.jpg",
    });
  });

  it("routes remake 103 Comparison brief through Comparison despite list sequences", async () => {
    const brief = REMAKE_103_DUMP.brief;
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: REMAKE_103_DUMP.sourceContent,
    });
    expect(planningIR.contract.source).toBe("none");
    expect(planningIR.contract.kind).toBe("open");
    expect(planningIR.strategy.preferredFamily).toBe("comparison");
    expect(
      planningIR.beats.filter((beat) => beat.sequence?.kind === "list")
    ).toHaveLength(5);
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

    await generateCarouselRemake(6810, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: REMAKE_103_DUMP.sourceContent,
      creativeBrief: brief,
    });

    expect(visualDirectionMock).toHaveBeenCalledTimes(1);
    const completed = persistUpdates.find((fields) => fields.status === "completed");
    expect(completed).toBeTruthy();
    const slides = completed?.slideStructureJson as Array<{
      layoutId?: string;
      composition?: {
        family?: string;
        treatment?: string;
        sequence?: { kind?: string; index?: number } | null;
      };
    }>;
    expect(slides).toHaveLength(11);
    expect(slides.every(isComparisonFamilySlide)).toBe(true);
    expect(slides.some(isStoryNarrativeSlide)).toBe(false);
    expect(slides.some(isBreakdownListicleSlide)).toBe(false);
    expect(slides.every((slide) => slide.layoutId !== "list_item_numbered")).toBe(
      true
    );
    expect(slides.at(-1)?.composition?.treatment).toBe("comparison_closing");
    const listSequences = slides
      .map((slide) => slide.composition?.sequence)
      .filter((sequence) => sequence?.kind === "list");
    expect(listSequences).toEqual([
      { kind: "list", index: 1 },
      { kind: "list", index: 2 },
      { kind: "list", index: 3 },
      { kind: "list", index: 4 },
      { kind: "list", index: 5 },
    ]);
  });
});
