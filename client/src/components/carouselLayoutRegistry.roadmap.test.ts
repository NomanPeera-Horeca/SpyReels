import { describe, expect, it } from "vitest";
import { CarouselRoadmapPremiumFamily } from "@/components/CarouselRoadmapPremiumFamily";
import { resolveCarouselSlideComponent } from "@/components/carouselLayoutRegistry";
import { CAROUSEL_LAYOUT_REGISTRY } from "@/components/carouselLayoutRegistry";

describe("Roadmap registry routing", () => {
  it("uses the premium Roadmap renderer instead of a legacy layout", () => {
    const slide = {
      layoutId: "hook_bold_center" as const,
      composition: {
        family: "roadmap" as const,
        archetype: "text_focus",
        treatment: "howto_cover",
        semanticRole: "cover",
        listItemIndex: null,
      },
    };
    expect(resolveCarouselSlideComponent(slide)).toBe(
      CarouselRoadmapPremiumFamily
    );
    expect(resolveCarouselSlideComponent(slide)).not.toBe(
      CAROUSEL_LAYOUT_REGISTRY.hook_bold_center
    );
  });

  it("does not send a valid Roadmap slide to the legacy numbered list renderer", () => {
    const slide = {
      layoutId: "list_item_numbered" as const,
      composition: {
        family: "roadmap" as const,
        archetype: "text_focus",
        treatment: "step_focus",
        semanticRole: "list_item",
        listItemIndex: null,
        roadmapStepCount: 4,
        roadmapStepIndex: 1,
        roadmapStepSource: "ordered_steps" as const,
      },
    };
    expect(resolveCarouselSlideComponent(slide)).toBe(
      CarouselRoadmapPremiumFamily
    );
    expect(resolveCarouselSlideComponent(slide)).not.toBe(
      CAROUSEL_LAYOUT_REGISTRY.list_item_numbered
    );
  });
});
