import { describe, expect, it } from "vitest";
import { CAROUSEL_STOCK_PREVIEW } from "./carouselTemplates";
import {
  ROADMAP_PREMIUM_DESIGN_FOUNDATION,
  resolvePreviousRoadmapVariants,
  resolveRoadmapPremiumVariant,
  resolveRoadmapPremiumVariants,
} from "./carouselRoadmapPremiumDesignSystem";

describe("premium Roadmap design system", () => {
  it("keeps Roadmap variant selection deterministic", () => {
    const input = {
      treatment: "step_focus" as const,
      position: 3,
      totalSlides: 7,
      roadmapStepCount: 4,
      roadmapStepIndex: 1,
    };
    expect(resolveRoadmapPremiumVariant(input)).toBe(
      resolveRoadmapPremiumVariant(input)
    );
  });

  it("uses a path cover only when steps are grounded", () => {
    expect(
      resolveRoadmapPremiumVariant({
        treatment: "howto_cover",
        position: 1,
        totalSlides: 7,
        roadmapStepCount: 4,
      })
    ).toBe("cover_path");
    expect(
      resolveRoadmapPremiumVariant({
        treatment: "howto_cover",
        position: 1,
        totalSlides: 7,
        roadmapStepCount: 0,
      })
    ).toBe("cover_editorial");
  });

  it("does not draw numbered journey geometry without grounded steps", () => {
    expect(
      resolveRoadmapPremiumVariant({
        treatment: "route_overview",
        position: 2,
        totalSlides: 7,
        roadmapStepCount: 0,
      })
    ).toBe("recap");
    expect(
      resolveRoadmapPremiumVariant({
        treatment: "step_focus",
        position: 3,
        totalSlides: 7,
        roadmapStepCount: 0,
      })
    ).toBe("checkpoint");
    expect(
      resolveRoadmapPremiumVariant({
        treatment: "route_overview",
        position: 2,
        totalSlides: 7,
        roadmapStepCount: 0,
      })
    ).not.toBe("route_map");
    expect(
      resolveRoadmapPremiumVariant({
        treatment: "step_focus",
        position: 3,
        totalSlides: 7,
        roadmapStepCount: 0,
      })
    ).not.toBe("step_focus");
  });

  it("keeps a grounded multi-step carousel as one journey", () => {
    const variants = resolveRoadmapPremiumVariants([
      {
        treatment: "howto_cover",
        position: 1,
        totalSlides: 7,
        roadmapStepCount: 4,
        roadmapStepIndex: null,
      },
      {
        treatment: "route_overview",
        position: 2,
        totalSlides: 7,
        roadmapStepCount: 4,
        roadmapStepIndex: null,
      },
      {
        treatment: "step_focus",
        position: 3,
        totalSlides: 7,
        roadmapStepCount: 4,
        roadmapStepIndex: 1,
      },
      {
        treatment: "step_focus",
        position: 4,
        totalSlides: 7,
        roadmapStepCount: 4,
        roadmapStepIndex: 2,
      },
      {
        treatment: "step_focus",
        position: 5,
        totalSlides: 7,
        roadmapStepCount: 4,
        roadmapStepIndex: 3,
      },
      {
        treatment: "step_focus",
        position: 6,
        totalSlides: 7,
        roadmapStepCount: 4,
        roadmapStepIndex: 4,
      },
      {
        treatment: "howto_closing",
        position: 7,
        totalSlides: 7,
        roadmapStepCount: 4,
        roadmapStepIndex: null,
      },
    ]);
    expect(variants[0]).toBe("cover_path");
    expect(variants[1]).toBe("route_map");
    expect(variants.slice(2, 6)).toEqual([
      "step_focus",
      "progress_path",
      "step_focus",
      "progress_path",
    ]);
    expect(variants[6]).toBe("decision_close");
  });

  it("closes on decision_close regardless of slide-count parity", () => {
    expect(
      resolveRoadmapPremiumVariant({
        treatment: "howto_closing",
        position: 7,
        totalSlides: 7,
        roadmapStepCount: 4,
      })
    ).toBe("decision_close");
    expect(
      resolveRoadmapPremiumVariant({
        treatment: "howto_closing",
        position: 6,
        totalSlides: 6,
        roadmapStepCount: 0,
      })
    ).toBe("decision_close");
  });

  it("passes the rendered photo-split variant as the next slide previousVariant", () => {
    const previous = resolvePreviousRoadmapVariants([
      {
        treatment: "step_focus",
        position: 3,
        totalSlides: 5,
        archetype: "text_visual_split",
        roadmapStepCount: 4,
        roadmapStepIndex: 1,
        imageUrl: CAROUSEL_STOCK_PREVIEW.cafeCreator,
      },
      {
        treatment: "step_focus",
        position: 4,
        totalSlides: 5,
        archetype: "text_focus",
        roadmapStepCount: 4,
        roadmapStepIndex: 2,
      },
    ]);
    expect(previous[0]).toBeNull();
    expect(previous[1]).toBe("step_photo_split");
  });

  it("gives non-step Roadmap editorial action rhythm", () => {
    const variants = resolveRoadmapPremiumVariants([
      { treatment: "howto_cover", position: 1, totalSlides: 7, roadmapStepCount: 0 },
      { treatment: "route_overview", position: 2, totalSlides: 7, roadmapStepCount: 0 },
      { treatment: "obstacle_fix", position: 3, totalSlides: 7, roadmapStepCount: 0 },
      { treatment: "action_checklist", position: 4, totalSlides: 7, roadmapStepCount: 0 },
      { treatment: "worked_example", position: 5, totalSlides: 7, roadmapStepCount: 0 },
      { treatment: "progress_checkpoint", position: 6, totalSlides: 7, roadmapStepCount: 0 },
      { treatment: "howto_closing", position: 7, totalSlides: 7, roadmapStepCount: 0 },
    ]);
    expect(variants).toEqual([
      "cover_editorial",
      "recap",
      "checkpoint",
      "action_checklist",
      "worked_example",
      "checkpoint",
      "decision_close",
    ]);
    expect(variants).not.toContain("cover_path");
    expect(variants).not.toContain("route_map");
    expect(variants).not.toContain("step_focus");
    expect(variants).not.toContain("progress_path");
  });

  it("uses large path stations instead of tiny pagination dots", () => {
    const { stationSize, stationSizeActive } =
      ROADMAP_PREMIUM_DESIGN_FOUNDATION.geometry;
    expect(Number.parseFloat(stationSize)).toBeGreaterThanOrEqual(1.7);
    expect(Number.parseFloat(stationSizeActive)).toBeGreaterThan(
      Number.parseFloat(stationSize)
    );
  });

  it("reuses the premium design foundation without cloning it", () => {
    expect(ROADMAP_PREMIUM_DESIGN_FOUNDATION.version).toBe(1);
    expect(ROADMAP_PREMIUM_DESIGN_FOUNDATION.roadmapVersion).toBe(1);
    expect(ROADMAP_PREMIUM_DESIGN_FOUNDATION.spacing.edge).toBeTruthy();
    expect(ROADMAP_PREMIUM_DESIGN_FOUNDATION.radius.media).toBeTruthy();
  });
});
