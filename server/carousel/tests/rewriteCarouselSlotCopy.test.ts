import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CarouselSlotRewriteContext } from "@shared/carouselSlotRewrite";

const invokeLLM = vi.fn();

vi.mock("../../_core/llm", () => ({
  invokeLLM: (...args: unknown[]) => invokeLLM(...args),
}));

import {
  CAROUSEL_SLOT_REWRITE_MODEL,
  CarouselSlotRewriteError,
  rewriteCarouselSlotCopy,
} from "../rewriteCarouselSlotCopy";

const context: CarouselSlotRewriteContext = {
  niche: "restaurant owners",
  sourceUrl: null,
  brief: {
    topic: "5 pricing mistakes restaurant owners make",
    title: "5 pricing mistakes restaurant owners make",
    hook: "Your menu price is costing you profit",
    corePromise: "Spot the pricing leaks.",
    centralInsight: "Cheap prices can still lose money.",
    ctaDirection: "Save this before you reprint menus",
    prohibitedClaims: ["Do not invent revenue numbers"],
  },
  slide: {
    id: "slide_01",
    role: "hook",
    viralWhy: "Stop the scroll with the pricing mistake.",
    semanticRole: "hook",
    family: "story_narrative",
    index: 0,
    total: 6,
  },
  slot: {
    id: "headline",
    role: "headline",
    label: "Headline",
    budget: { min: 8, max: 42 },
    currentText: "Your menu price is costing you profit",
  },
  nearby: {
    sameSlide: [{ slotId: "kicker", role: "kicker", label: "Kicker", text: "PRICING" }],
    prevHeadline: null,
    nextHeadline: "Guessing instead of costing",
  },
  factsToPreserve: [],
};

function llmJson(payload: unknown) {
  return {
    choices: [{ message: { content: JSON.stringify(payload) } }],
  };
}

describe("rewriteCarouselSlotCopy", () => {
  beforeEach(() => {
    invokeLLM.mockReset();
  });

  it("uses Haiku for this small rewrite and returns validated text", async () => {
    invokeLLM.mockResolvedValueOnce(
      llmJson({ text: "Your menu price is quietly eating profit" })
    );
    const result = await rewriteCarouselSlotCopy("make_punchier", context);
    expect(result).toEqual({
      text: "Your menu price is quietly eating profit",
    });
    expect(invokeLLM).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: "slot_text_rewrite",
        model: CAROUSEL_SLOT_REWRITE_MODEL,
      })
    );
    expect(CAROUSEL_SLOT_REWRITE_MODEL).toBe("claude-haiku-4-5-20251001");
  });

  it("retries once when the first result overflows the slot budget", async () => {
    invokeLLM
      .mockResolvedValueOnce(
        llmJson({
          text: "Your restaurant menu price is quietly destroying profit every night",
        })
      )
      .mockResolvedValueOnce(llmJson({ text: "Menu prices are eating profit" }));
    const result = await rewriteCarouselSlotCopy("make_clearer", context);
    expect(result).toEqual({ text: "Menu prices are eating profit" });
    expect(invokeLLM).toHaveBeenCalledTimes(2);
  });

  it("rejects copy that drops a required number after retry", async () => {
    const numbered = {
      ...context,
      slot: {
        ...context.slot,
        currentText: "Owners lose 12% on underpriced specials",
      },
      factsToPreserve: ["12%"],
    };
    invokeLLM
      .mockResolvedValueOnce(llmJson({ text: "Owners lose money on specials" }))
      .mockResolvedValueOnce(llmJson({ text: "Specials are underpriced" }));
    await expect(rewriteCarouselSlotCopy("rewrite", numbered)).rejects.toBeInstanceOf(
      CarouselSlotRewriteError
    );
  });

  it("returns exactly 3 alternatives and does not invent extra options", async () => {
    invokeLLM.mockResolvedValueOnce(
      llmJson({
        alternatives: [
          "Menu prices are leaking profit",
          "Stop guessing your menu prices",
          "Your prices are costing profit",
        ],
      })
    );
    const result = await rewriteCarouselSlotCopy("alternatives", context);
    expect(result).toEqual({
      alternatives: [
        "Menu prices are leaking profit",
        "Stop guessing your menu prices",
        "Your prices are costing profit",
      ],
    });
  });

  it("requires make_shorter to actually shorten the selected line", async () => {
    invokeLLM
      .mockResolvedValueOnce(
        llmJson({ text: "Your menu price is costing you profit tonight" })
      )
      .mockResolvedValueOnce(llmJson({ text: "Menu prices cost you" }));
    const result = await rewriteCarouselSlotCopy("make_shorter", context);
    expect(result).toEqual({ text: "Menu prices cost you" });
    expect("text" in result && result.text.length < context.slot.currentText.length).toBe(
      true
    );
  });
});
