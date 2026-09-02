import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CAROUSEL_STUDIO_TEMPLATE_ID,
  scoreCarouselCreativeBrief,
  type CarouselCreativeBrief,
} from "@shared/carouselStudio";
import { isBreakdownListicleSlide } from "@shared/carouselBreakdownFamily";
import {
  CASH_DRAINS_REMAKE_67_CORRECTED_VALUES,
  OPEN_CASH_FLOW_USER_PROMPT,
  cashDrainsRemake67CorrectedBrief,
} from "./fixtures/cashDrainsRemake67";
import { compilePlanningIRToBaselineCompositionIR } from "@shared/carouselCompositionIR";
import { compileCreativeBriefToPlanningIR } from "@shared/carouselPlanningIR";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";

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

function cashDrainsCopyPayload() {
  return {
    ...CASH_DRAINS_REMAKE_67_CORRECTED_VALUES,
    slide_02: {
      ...CASH_DRAINS_REMAKE_67_CORRECTED_VALUES.slide_02,
      left: "Profit",
      right: "Cash",
      support: "On paper vs in the bank",
    },
    slide_04: {
      ...CASH_DRAINS_REMAKE_67_CORRECTED_VALUES.slide_04,
      support: "Buy stock\nSits unsold\nCash stays trapped",
    },
    slide_05: {
      ...CASH_DRAINS_REMAKE_67_CORRECTED_VALUES.slide_05,
      support: "Invoice sent\nCustomer pays\nSuppliers get paid first",
    },
    slide_08: {
      ...CASH_DRAINS_REMAKE_67_CORRECTED_VALUES.slide_08,
      cta_label: "Comment your drain",
      body: CASH_DRAINS_REMAKE_67_CORRECTED_VALUES.slide_08?.body ?? "",
    },
  };
}

function genericCopyPayload(slideIds: string[]) {
  const slides: Record<string, Record<string, string>> = {};
  slideIds.forEach((id, index) => {
    slides[id] = {
      kicker: index === 0 ? "OWNERS" : String(index).padStart(2, "0"),
      headline: `Headline for ${id} that is long enough`,
      body: `Body copy for ${id} that stays inside the budget for a mobile slide.`,
      subhead: "A supporting line that is long enough for this template.",
      cta_label: "Follow for more",
      slideIntent: index === slideIds.length - 1 ? "closing" : "content",
      ...(index === slideIds.length - 1 ? { closingType: "follow" } : {}),
    };
  });
  return slides;
}

describe("generateCarouselRemake breakdown family wiring", () => {
  beforeEach(() => {
    persistUpdates.length = 0;
    mockedInvokeLLM.mockReset();
    visualDirectionMock.mockReset();
  });

  it("wires Visual Director into the modern breakdown path", async () => {
    const brief = cashDrainsRemake67CorrectedBrief();
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
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
            content: JSON.stringify(cashDrainsCopyPayload()),
          },
        },
      ],
    });

    await generateCarouselRemake(6702, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
      creativeBrief: brief,
    });

    expect(visualDirectionMock).toHaveBeenCalledTimes(1);
    const completed = persistUpdates.find((fields) => fields.status === "completed");
    expect(completed).toBeTruthy();
    const slides = completed?.slideStructureJson as Array<{
      composition?: { family?: string; listItemIndex?: number | null };
      id: string;
    }>;
    expect(slides.every(isBreakdownListicleSlide)).toBe(true);
    expect(slides[3]?.composition?.listItemIndex).toBe(3);
    const values = completed?.slotValuesJson as Record<
      string,
      Record<string, string>
    >;
    expect(values.slide_04?.kicker).toBe("03");
  });

  it("keeps Visual Director checklist_stack and data_focus treatments", async () => {
    const brief = cashDrainsRemake67CorrectedBrief();
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
    });
    const baseline = compilePlanningIRToBaselineCompositionIR(planningIR);
    const compositionIR = {
      ...baseline,
      slides: baseline.slides.map((slide, index) => {
        if (index === 1) {
          return {
            ...slide,
            archetype: "checklist_stack" as const,
            visualRegions: [
              {
                role: "supporting" as const,
                kind: "checklist" as const,
                placement: "center" as const,
              },
            ],
          };
        }
        if (index === 3) {
          return {
            ...slide,
            archetype: "data_focus" as const,
            visualRegions: [
              {
                role: "primary" as const,
                kind: "data" as const,
                placement: "center" as const,
              },
            ],
          };
        }
        return slide;
      }),
    };
    visualDirectionMock.mockResolvedValue({
      compositionIR,
      source: "ai",
      attempts: 1,
      issues: [],
    });
    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              ...cashDrainsCopyPayload(),
              slide_02: {
                ...cashDrainsCopyPayload().slide_02,
                support: "Pull charges\nMark unused\nCancel idle",
              },
              slide_04: {
                ...cashDrainsCopyPayload().slide_04,
                support: "Over 30 days",
              },
            }),
          },
        },
      ],
    });

    await generateCarouselRemake(6708, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
      creativeBrief: brief,
    });

    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: { treatment?: string; archetype?: string };
      slots?: Array<{ id: string; label?: string }>;
    }>;
    expect(slides[1]?.composition?.archetype).toBe("checklist_stack");
    expect(slides[1]?.composition?.treatment).toBe("checklist_stack");
    expect(slides[1]?.slots?.some((slot) => slot.label === "Checklist lines")).toBe(
      true
    );
    expect(slides[3]?.composition?.archetype).toBe("data_focus");
    expect(slides[3]?.composition?.treatment).toBe("data_focus");
    expect(slides[3]?.slots?.some((slot) => slot.label === "Data point")).toBe(true);
    const values = completed?.slotValuesJson as Record<
      string,
      Record<string, string>
    >;
    expect(values.slide_04?.support).toBe("Over 30 days");
    expect(values.slide_04?.support).not.toBe("82%");
  });

  it("falls back to baseline composition when Visual Director fails", async () => {
    const brief = cashDrainsRemake67CorrectedBrief();
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
    });
    visualDirectionMock.mockResolvedValue({
      compositionIR: compilePlanningIRToBaselineCompositionIR(planningIR),
      source: "baseline_fallback",
      attempts: 2,
      issues: ["Visual Director returned no slide decisions"],
    });
    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(cashDrainsCopyPayload()),
          },
        },
      ],
    });

    await generateCarouselRemake(6703, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
      creativeBrief: brief,
    });

    const completed = persistUpdates.find((fields) => fields.status === "completed");
    expect(completed?.status).toBe("completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: { family?: string };
    }>;
    expect(slides.every(isBreakdownListicleSlide)).toBe(true);
  });

  it("wires Visual Director for a framework-labeled enumerated list plan", async () => {
    const base = cashDrainsRemake67CorrectedBrief();
    const brief: CarouselCreativeBrief = {
      ...base,
      contentFormat: "framework",
      layoutFamily: "framework",
      slideOutline: base.slideOutline.map((slide, index) => {
        if (index === 0 || index === base.slideOutline.length - 1) return slide;
        return { ...slide, role: "framework" };
      }),
    };
    const planningIR = compileCreativeBriefToPlanningIR({
      brief,
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
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
            content: JSON.stringify(cashDrainsCopyPayload()),
          },
        },
      ],
    });

    await generateCarouselRemake(6705, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
      creativeBrief: brief,
    });

    expect(visualDirectionMock).toHaveBeenCalledTimes(1);
    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: { family?: string; listItemIndex?: number | null };
    }>;
    expect(slides.every(isBreakdownListicleSlide)).toBe(true);
    expect(slides[3]?.composition?.listItemIndex).toBe(3);
    const values = completed?.slotValuesJson as Record<
      string,
      Record<string, string>
    >;
    expect(values.slide_04?.kicker).toBe("03");
  });

  it("leaves a story plan with no list sequence on the old path", async () => {
    const brief: CarouselCreativeBrief = {
      ...cashDrainsRemake67CorrectedBrief(),
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
      scores: scoreCarouselCreativeBrief({
        relevance: 80,
        usefulness: 80,
        specificity: 80,
        visualPotential: 80,
        factualSafety: 80,
        originality: 80,
      }),
    };
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

    await generateCarouselRemake(6706, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
      creativeBrief: brief,
    });

    expect(visualDirectionMock).not.toHaveBeenCalled();
    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: unknown;
    }>;
    expect(slides.some(isBreakdownListicleSlide)).toBe(false);
  });

  it("does not auto-route an open framework with framework_step beats", async () => {
    const brief: CarouselCreativeBrief = {
      ...cashDrainsRemake67CorrectedBrief(),
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

    await generateCarouselRemake(6707, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
      creativeBrief: brief,
    });

    expect(visualDirectionMock).not.toHaveBeenCalled();
    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: unknown;
    }>;
    expect(slides.some(isBreakdownListicleSlide)).toBe(false);
  });

  it("leaves the legacy template path unchanged when there is no modern brief", async () => {
    const template = CAROUSEL_TEMPLATES_BY_ID.get(CAROUSEL_STUDIO_TEMPLATE_ID);
    mockedInvokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify(
              genericCopyPayload(template!.slides.map((slide) => slide.id))
            ),
          },
        },
      ],
    });

    await generateCarouselRemake(6704, CAROUSEL_STUDIO_TEMPLATE_ID, "restaurant owners");

    expect(visualDirectionMock).not.toHaveBeenCalled();
    const completed = persistUpdates.find((fields) => fields.status === "completed");
    const slides = completed?.slideStructureJson as Array<{
      composition?: unknown;
      layoutId: string;
    }>;
    expect(slides.some(isBreakdownListicleSlide)).toBe(false);
    expect(slides.map((slide) => slide.layoutId)).toEqual(
      template!.slides.map((slide) => slide.layoutId)
    );
  });
});
