import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAROUSEL_STUDIO_TEMPLATE_ID } from "@shared/carouselStudio";
import {
  CASH_DRAINS_REMAKE_67_BRIEF,
  OPEN_CASH_FLOW_USER_PROMPT,
} from "./fixtures/cashDrainsRemake67";

const persistUpdates: Record<string, unknown>[] = [];

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

import { invokeLLM } from "../../_core/llm";
import { generateCarouselRemake } from "../generateCarouselRemake";

const mockedInvokeLLM = vi.mocked(invokeLLM);

describe("generateCarouselRemake planning IR gate", () => {
  beforeEach(() => {
    persistUpdates.length = 0;
    mockedInvokeLLM.mockReset();
  });

  it("fails invalid IR before the copy LLM call", async () => {
    await generateCarouselRemake(6701, CAROUSEL_STUDIO_TEMPLATE_ID, "infer from source", {
      sourceContent: OPEN_CASH_FLOW_USER_PROMPT,
      creativeBrief: CASH_DRAINS_REMAKE_67_BRIEF,
    });

    expect(mockedInvokeLLM).not.toHaveBeenCalled();
    expect(
      persistUpdates.some(
        (fields) =>
          fields.status === "failed" &&
          typeof fields.errorMessage === "string" &&
          fields.errorMessage.includes("Planning IR invalid")
      )
    ).toBe(true);
  });
});
