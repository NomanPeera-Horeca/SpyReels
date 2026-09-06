import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CarouselSlideSpec } from "@shared/carouselTemplates";
import { buildTextOnlyImagePrompt } from "../resolveSlideImage";

const mockResolve = vi.fn();

vi.mock("../resolveSlideImage", async () => {
  const actual = await vi.importActual<typeof import("../resolveSlideImage")>(
    "../resolveSlideImage"
  );
  return {
    ...actual,
    resolveSlideImage: (...args: unknown[]) => mockResolve(...args),
  };
});

import {
  imageTextContextForOwnedSlot,
  ownedImageUrlForSlot,
  regenerateOwnedSlideImageCandidate,
  topicFromStoredBrief,
} from "../regenerateOwnedSlideImage";

const storySlide: CarouselSlideSpec = {
  id: "slide_01",
  role: "hook",
  viralWhy: "Stop the scroll with the pricing mistake.",
  layoutId: "story_cover_full_bleed",
  slots: [],
  imageSlots: [
    { id: "photo", label: "Photo", searchQueryHint: "owner reviewing a menu board" },
  ],
};

const comparisonSlide: CarouselSlideSpec = {
  id: "slide_03",
  role: "comparison",
  viralWhy: "Show cheap vs right.",
  layoutId: "comparison_side_by_side",
  slots: [],
  imageSlots: [
    { id: "photo", label: "Left photo", searchQueryHint: "cheap fridge" },
    { id: "photo_b", label: "Right photo", searchQueryHint: "reliable fridge" },
  ],
  composition: {
    family: "comparison",
    archetype: "side_by_side",
    treatment: "side_by_side",
    semanticRole: "comparison",
    listItemIndex: null,
  },
};

const textOnlySlide: CarouselSlideSpec = {
  id: "slide_02",
  role: "insight",
  viralWhy: "Explain the leak.",
  layoutId: "story_text_only",
  slots: [],
};

describe("owned image regenerate helpers", () => {
  beforeEach(() => {
    mockResolve.mockReset();
  });

  it("reads a multi-image slot by id, not by first URL", () => {
    const map = {
      slide_03: {
        photo: "https://a.example/a.jpg",
        photo_b: "https://b.example/b.jpg",
      },
    };
    expect(ownedImageUrlForSlot(map, "slide_03", "photo")).toBe(
      "https://a.example/a.jpg"
    );
    expect(ownedImageUrlForSlot(map, "slide_03", "photo_b")).toBe(
      "https://b.example/b.jpg"
    );
    expect(ownedImageUrlForSlot(map, "slide_03", "photo_c")).toBeNull();
  });

  it("keeps default text-only generation wording when topic fit is off", () => {
    expect(
      buildTextOnlyImagePrompt(
        "restaurant owners",
        "kitchen",
        "Your menu price is costing you profit"
      )
    ).toBe(
      "A high-quality, realistic photo for a social media carousel slide. Niche: restaurant owners. Slide message: Your menu price is costing you profit. Visual mood: kitchen. No text, no logos, no watermarks, no borders."
    );
  });

  it("uses stored brief topic when present", () => {
    expect(
      topicFromStoredBrief(
        [
          {
            schemaVersion: 2,
            topic: "5 pricing mistakes restaurant owners make",
            title: "Pricing mistakes",
          },
        ],
        0
      )
    ).toBe("5 pricing mistakes restaurant owners make");
  });

  it("rejects a text-only slide and an invalid slot", async () => {
    await expect(
      regenerateOwnedSlideImageCandidate({
        niche: "restaurant owners",
        topic: "5 pricing mistakes restaurant owners make",
        slides: [textOnlySlide],
        slideId: "slide_02",
        slotId: "photo",
        slotValues: { slide_02: { headline: "Just text" } },
        imageUrls: {},
      })
    ).rejects.toMatchObject({ code: "INVALID_SLOT" });
    await expect(
      regenerateOwnedSlideImageCandidate({
        niche: "restaurant owners",
        topic: "5 pricing mistakes restaurant owners make",
        slides: [storySlide],
        slideId: "slide_99",
        slotId: "photo",
        slotValues: {},
        imageUrls: {},
      })
    ).rejects.toMatchObject({ code: "INVALID_SLIDE" });
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("calls resolveSlideImage for only the selected slot and does not write a map", async () => {
    mockResolve.mockResolvedValue("https://local.example/candidate.png");
    const result = await regenerateOwnedSlideImageCandidate({
      niche: "restaurant owners",
      topic: "5 pricing mistakes restaurant owners make",
      slides: [comparisonSlide],
      slideId: "slide_03",
      slotId: "photo",
      slotValues: {
        slide_03: { left: "Cheap fridge", right: "Right fridge" },
      },
      imageUrls: {
        slide_03: {
          photo: "https://a.example/a.jpg",
          photo_b: "https://b.example/b.jpg",
        },
      },
    });
    expect(result).toEqual({ url: "https://local.example/candidate.png" });
    expect(mockResolve).toHaveBeenCalledTimes(1);
    expect(mockResolve.mock.calls[0]?.[4]).toMatchObject({
      slideId: "slide_03",
      imageSlotId: "photo",
      requireTopicFit: true,
      topic: "5 pricing mistakes restaurant owners make",
    });
  });

  it("throws a safe error when generation returns no URL", async () => {
    mockResolve.mockResolvedValue(null);
    await expect(
      regenerateOwnedSlideImageCandidate({
        niche: "restaurant owners",
        topic: "labor costs",
        slides: [storySlide],
        slideId: "slide_01",
        slotId: "photo",
        slotValues: { slide_01: { headline: "Labor costs keep rising" } },
        imageUrls: { slide_01: "https://old.example/a.jpg" },
      })
    ).rejects.toMatchObject({
      code: "NO_IMAGE",
      message: "Couldn't generate another image. Try again.",
    });
  });

  it("builds comparison side copy for the selected image slot", () => {
    const copy = imageTextContextForOwnedSlot(
      comparisonSlide,
      { left: "Cheap fridge", right: "Reliable fridge" },
      "photo"
    );
    expect(copy.toLowerCase()).toContain("cheap");
  });
});
