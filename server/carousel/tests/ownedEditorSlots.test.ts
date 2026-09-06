import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { CAROUSEL_TEMPLATES_BY_ID } from "@shared/carouselTemplates";
import type { CarouselSlideSpec } from "@shared/carouselTemplates";
import {
  assertOwnedEditorImageSlot,
  assertOwnedEditorTextSlot,
  resolveOwnedEditorSlides,
  slidesForRemake,
} from "../ownedEditorSlots";

const storyTemplate = CAROUSEL_TEMPLATES_BY_ID.get("photo_story_test")!;

const comparisonSlide: CarouselSlideSpec = {
  id: "slide_01",
  role: "hook",
  viralWhy: "Contrast hook",
  layoutId: "photo_caption_bubble",
  slots: [
    {
      id: "headline",
      role: "headline",
      label: "Headline",
      budget: { min: 8, max: 48 },
      defaultText: "Cheap fridge vs total cost",
    },
  ],
  imageSlots: [
    { id: "photo", label: "Left", searchQueryHint: "cheap fridge" },
    { id: "photo_b", label: "Right", searchQueryHint: "right fridge" },
  ],
  composition: {
    family: "comparison",
    archetype: "comparison_split",
    treatment: "side_by_side",
    semanticRole: "comparison",
  },
};

describe("ownedEditorSlots", () => {
  it("prefers stored remake structure over the template", () => {
    const slides = slidesForRemake(storyTemplate.slides, [comparisonSlide]);
    expect(slides).toHaveLength(1);
    expect(slides[0]?.imageSlots?.map((slot) => slot.id)).toEqual([
      "photo",
      "photo_b",
    ]);
  });

  it("falls back to the Story template when stored structure is empty", () => {
    const slides = resolveOwnedEditorSlides("photo_story_test", null);
    expect(slides[0]?.id).toBe("slide_01");
    expect(slides[0]?.slots.some((slot) => slot.id === "headline")).toBe(true);
    expect(slides[0]?.imageSlots?.some((slot) => slot.id === "photo")).toBe(
      true
    );
  });

  it("accepts a real Story text slot and rejects unknown slide or text slot ids", () => {
    const slides = resolveOwnedEditorSlides("photo_story_test", null);
    expect(() =>
      assertOwnedEditorTextSlot(slides, "slide_01", "headline")
    ).not.toThrow();
    expect(() =>
      assertOwnedEditorTextSlot(slides, "slide_99", "headline")
    ).toThrow(TRPCError);
    expect(() =>
      assertOwnedEditorTextSlot(slides, "slide_01", "body")
    ).toThrow(TRPCError);
    expect(() =>
      assertOwnedEditorTextSlot(slides, "slide_01", "photo")
    ).toThrow(TRPCError);
  });

  it("accepts Comparison photo and photo_b and rejects an unknown image slot", () => {
    const slides = slidesForRemake(undefined, [comparisonSlide]);
    expect(() =>
      assertOwnedEditorImageSlot(slides, "slide_01", "photo")
    ).not.toThrow();
    expect(() =>
      assertOwnedEditorImageSlot(slides, "slide_01", "photo_b")
    ).not.toThrow();
    expect(() =>
      assertOwnedEditorImageSlot(slides, "slide_01", "photo_c")
    ).toThrow(TRPCError);
    expect(() =>
      assertOwnedEditorImageSlot(slides, "slide_99", "photo")
    ).toThrow(TRPCError);
  });

  it("allows a legacy image URL without slotId only when the slide has an image slot", () => {
    const slides = resolveOwnedEditorSlides("photo_story_test", null);
    expect(() =>
      assertOwnedEditorImageSlot(slides, "slide_01")
    ).not.toThrow();
    expect(() =>
      assertOwnedEditorImageSlot(slides, "slide_02")
    ).toThrow(TRPCError);
  });
});
