import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAROUSEL_STUDIO_TEMPLATE_ID } from "@shared/carouselStudio";
import { isBreakdownListicleSlide } from "@shared/carouselBreakdownFamily";
import {
  CASH_DRAINS_REMAKE_67_CORRECTED_VALUES,
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
