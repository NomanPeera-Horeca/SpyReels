import { describe, expect, it } from "vitest";
import { previousRoadmapVariantsForSlides } from "@/components/CarouselRenderer";
import { CAROUSEL_STOCK_PREVIEW, type CarouselSlideSpec } from "@shared/carouselTemplates";

function roadmapStepSlide(
  id: string,
  args: {
    position: number;
    archetype: string;
    stepIndex: number;
  }
): CarouselSlideSpec {
  return {
    id,
    role: "list_item",
    viralWhy: "Step",
    layoutId: "hook_bold_center",
    slots: [],
    composition: {
      family: "roadmap",
      archetype: args.archetype,
      treatment: "step_focus",
      semanticRole: "list_item",
      listItemIndex: null,
      sequence: { kind: "list", index: args.stepIndex },
      position: args.position,
      totalSlides: 4,
      roadmapStepCount: 4,
      roadmapStepIndex: args.stepIndex,
      roadmapStepSource: "ordered_steps",
    },
  } as unknown as CarouselSlideSpec;
}

describe("Roadmap renderer previousVariant history", () => {
  it("gives the next slide the photo-split variant the previous slide rendered", () => {
    const slides = [
      roadmapStepSlide("slide_03", {
        position: 3,
        archetype: "text_visual_split",
        stepIndex: 1,
      }),
      roadmapStepSlide("slide_04", {
        position: 4,
        archetype: "text_focus",
        stepIndex: 2,
      }),
    ];
    const previous = previousRoadmapVariantsForSlides(slides, {
      slide_03: CAROUSEL_STOCK_PREVIEW.cafeCreator,
    });
    expect(previous[0]).toBeNull();
    expect(previous[1]).toBe("step_photo_split");
  });
});
