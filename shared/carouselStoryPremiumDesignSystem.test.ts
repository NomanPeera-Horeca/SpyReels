import { describe, expect, it } from "vitest";
import {
  STORY_PREMIUM_DESIGN_FOUNDATION,
  resolveStoryPremiumVariant,
} from "./carouselStoryPremiumDesignSystem";

describe("premium Story design system", () => {
  it("keeps Story variant selection deterministic", () => {
    const input = {
      treatment: "story_scene" as const,
      position: 3,
      totalSlides: 8,
      imageUrl: "https://images.example.com/scene.jpg",
    };
    expect(resolveStoryPremiumVariant(input)).toBe(
      resolveStoryPremiumVariant(input)
    );
  });

  it("uses cinematic image cover and safe type fallback", () => {
    expect(
      resolveStoryPremiumVariant({
        treatment: "cinematic_cover",
        position: 1,
        totalSlides: 8,
        imageUrl: "https://images.example.com/cover.jpg",
      })
    ).toBe("cover_full_bleed");
    expect(
      resolveStoryPremiumVariant({
        treatment: "cinematic_cover",
        position: 1,
        totalSlides: 8,
      })
    ).toBe("cover_type");
  });

  it("alternates image split direction by narrative position", () => {
    expect(
      resolveStoryPremiumVariant({
        treatment: "image_text_split",
        position: 2,
        totalSlides: 8,
        imageUrl: "https://images.example.com/scene.jpg",
      })
    ).toBe("split_image_left");
    expect(
      resolveStoryPremiumVariant({
        treatment: "image_text_split",
        position: 3,
        totalSlides: 8,
        imageUrl: "https://images.example.com/scene.jpg",
      })
    ).toBe("split_image_right");
  });

  it("keeps a missing-image scene as a caption still", () => {
    expect(
      resolveStoryPremiumVariant({
        treatment: "story_scene",
        position: 2,
        totalSlides: 7,
      })
    ).toBe("scene_caption_bottom");
  });

  it("varies image scenes without randomness", () => {
    expect(
      resolveStoryPremiumVariant({
        treatment: "story_scene",
        position: 2,
        totalSlides: 8,
        imageUrl: "https://images.example.com/scene.jpg",
      })
    ).toBe("scene_framed");
    expect(
      resolveStoryPremiumVariant({
        treatment: "story_scene",
        position: 3,
        totalSlides: 8,
        imageUrl: "https://images.example.com/scene.jpg",
      })
    ).toBe("scene_caption_bottom");
    expect(
      resolveStoryPremiumVariant({
        treatment: "story_scene",
        position: 5,
        totalSlides: 8,
        imageUrl: "https://images.example.com/scene.jpg",
      })
    ).toBe("scene_full_bleed");
  });

  it("keeps closing resolution-led and deterministic", () => {
    expect(
      resolveStoryPremiumVariant({
        treatment: "story_closing",
        position: 8,
        totalSlides: 8,
      })
    ).toBe("closing_resolution");
  });

  it("reuses the premium design foundation without cloning it", () => {
    expect(STORY_PREMIUM_DESIGN_FOUNDATION.version).toBe(1);
    expect(STORY_PREMIUM_DESIGN_FOUNDATION.storyVersion).toBe(1);
    expect(STORY_PREMIUM_DESIGN_FOUNDATION.spacing.edge).toBeTruthy();
    expect(STORY_PREMIUM_DESIGN_FOUNDATION.radius.media).toBeTruthy();
  });
});
