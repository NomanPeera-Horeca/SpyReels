import { describe, expect, it } from "vitest";
import type { CarouselSlideSpec } from "./carouselTemplates";
import {
  CAROUSEL_EDITOR_MAX_SLIDES,
  CAROUSEL_EDITOR_MIN_SLIDES,
  deleteCarouselSlide,
  duplicateCarouselSlide,
  moveSlideId,
  nextUniqueSlideId,
  reorderCarouselSlides,
  type CarouselEditorSlideState,
} from "./carouselSlideManagement";

function spec(
  id: string,
  extras?: Partial<CarouselSlideSpec> & {
    frameworkPartIndex?: number | null;
    roadmapStepIndex?: number | null;
    listItemIndex?: number | null;
  }
): CarouselSlideSpec {
  const {
    frameworkPartIndex,
    roadmapStepIndex,
    listItemIndex,
    composition,
    ...rest
  } = extras ?? {};
  return {
    id,
    role: "list_item",
    viralWhy: "test",
    layoutId: "hook_bold_center",
    slots: [
      {
        id: "headline",
        role: "headline",
        label: "Headline",
        budget: { min: 1, max: 80 },
        defaultText: "Title",
      },
    ],
    composition: composition ?? {
      family: "story_narrative",
      archetype: "story",
      treatment: "scene",
      semanticRole: "scene",
      listItemIndex: listItemIndex ?? null,
      position: 1,
      totalSlides: 3,
      ...(frameworkPartIndex !== undefined
        ? { frameworkPartIndex, frameworkPartCount: 2 }
        : {}),
      ...(roadmapStepIndex !== undefined
        ? { roadmapStepIndex, roadmapStepCount: 2 }
        : {}),
    },
    ...rest,
  };
}

function state(ids: string[]): CarouselEditorSlideState {
  return {
    slideStructure: ids.map((id, index) =>
      spec(id, {
        listItemIndex: index === 0 ? null : index,
      })
    ),
    slotValues: Object.fromEntries(
      ids.map((id, index) => [id, { headline: `Title ${index + 1}` }])
    ),
    slotStyles: Object.fromEntries(
      ids.map((id) => [id, { headline: { fontWeight: 700 } }])
    ),
    imageUrls: Object.fromEntries(
      ids.map((id, index) =>
        index === 1
          ? [id, { photo: `https://img.test/${id}-a.jpg`, photo_b: `https://img.test/${id}-b.jpg` }]
          : [id, `https://img.test/${id}.jpg`]
      )
    ),
    imageFrames: Object.fromEntries(
      ids.map((id) => [id, { photo: { posX: 40, posY: 60, zoom: 1.2 } }])
    ),
  };
}

describe("carousel slide management", () => {
  it("allocates the next unused slide_XX id without renaming existing ids", () => {
    expect(nextUniqueSlideId(["slide_01", "slide_02", "slide_04"])).toBe("slide_03");
    expect(nextUniqueSlideId(["slide_01", "slide_02", "slide_03"])).toBe("slide_04");
  });

  it("reorders by stable ids and keeps every map keyed to those ids", () => {
    const start = state(["slide_01", "slide_02", "slide_03"]);
    const next = reorderCarouselSlides(start, [
      "slide_03",
      "slide_01",
      "slide_02",
    ]);
    expect(next.slideStructure.map((slide) => slide.id)).toEqual([
      "slide_03",
      "slide_01",
      "slide_02",
    ]);
    expect(next.slotValues.slide_03?.headline).toBe("Title 3");
    expect(next.imageUrls.slide_02).toEqual({
      photo: "https://img.test/slide_02-a.jpg",
      photo_b: "https://img.test/slide_02-b.jpg",
    });
    expect(next.imageFrames.slide_01?.photo?.zoom).toBe(1.2);
    expect(next.slideStructure[0]?.composition?.position).toBe(1);
    expect(next.slideStructure[2]?.composition?.position).toBe(3);
  });

  it("rejects reorder payloads that are not a permutation", () => {
    expect(() =>
      reorderCarouselSlides(state(["slide_01", "slide_02", "slide_03"]), [
        "slide_01",
        "slide_02",
        "slide_99",
      ])
    ).toThrow(/exactly once/);
  });

  it("duplicates immediately after the source with a new id and cloned maps", () => {
    const start = state(["slide_01", "slide_02", "slide_03"]);
    const { state: next, newSlideId } = duplicateCarouselSlide(start, "slide_02");
    expect(newSlideId).toBe("slide_04");
    expect(next.slideStructure.map((slide) => slide.id)).toEqual([
      "slide_01",
      "slide_02",
      "slide_04",
      "slide_03",
    ]);
    expect(next.slotValues.slide_04).toEqual({ headline: "Title 2" });
    expect(next.slotValues.slide_02).toEqual({ headline: "Title 2" });
    expect(next.imageUrls.slide_04).toEqual({
      photo: "https://img.test/slide_02-a.jpg",
      photo_b: "https://img.test/slide_02-b.jpg",
    });
    expect(next.imageFrames.slide_04?.photo).toEqual({
      posX: 40,
      posY: 60,
      zoom: 1.2,
    });
    next.slotValues.slide_04!.headline = "Copy only";
    expect(start.slotValues.slide_02?.headline).toBe("Title 2");
    expect(next.slotValues.slide_02?.headline).toBe("Title 2");
  });

  it("recomputes roadmap chrome after duplicate without rewriting slot text", () => {
    const start: CarouselEditorSlideState = {
      slideStructure: [
        spec("slide_01", { roadmapStepIndex: null }),
        spec("slide_02", { roadmapStepIndex: 1 }),
        spec("slide_03", { roadmapStepIndex: 2 }),
      ],
      slotValues: {
        slide_01: { headline: "Cover" },
        slide_02: { headline: "Step one", kicker: "02" },
        slide_03: { headline: "Step two" },
      },
      slotStyles: {},
      imageUrls: {},
      imageFrames: {},
    };
    const { state: next } = duplicateCarouselSlide(start, "slide_02");
    expect(next.slideStructure.map((slide) => slide.composition?.roadmapStepIndex)).toEqual([
      null,
      1,
      2,
      3,
    ]);
    expect(next.slideStructure[2]?.composition?.roadmapStepCount).toBe(3);
    expect(next.slotValues.slide_02?.kicker).toBe("02");
    expect(next.slotValues.slide_04?.kicker).toBe("02");
  });

  it("deletes structure plus every map entry for that slide", () => {
    const start = state(["slide_01", "slide_02", "slide_03"]);
    const next = deleteCarouselSlide(start, "slide_02");
    expect(next.slideStructure.map((slide) => slide.id)).toEqual([
      "slide_01",
      "slide_03",
    ]);
    expect(next.slotValues.slide_02).toBeUndefined();
    expect(next.slotStyles.slide_02).toBeUndefined();
    expect(next.imageUrls.slide_02).toBeUndefined();
    expect(next.imageFrames.slide_02).toBeUndefined();
    expect(next.imageUrls.slide_03).toBe("https://img.test/slide_03.jpg");
  });

  it("enforces min and max slide counts", () => {
    expect(() => deleteCarouselSlide(state(["slide_01", "slide_02"]), "slide_01")).toThrow(
      new RegExp(String(CAROUSEL_EDITOR_MIN_SLIDES))
    );
    const many = state(
      Array.from({ length: CAROUSEL_EDITOR_MAX_SLIDES }, (_, i) =>
        `slide_${String(i + 1).padStart(2, "0")}`
      )
    );
    expect(() => duplicateCarouselSlide(many, "slide_01")).toThrow(
      new RegExp(String(CAROUSEL_EDITOR_MAX_SLIDES))
    );
  });

  it("rejects unknown slide ids", () => {
    expect(() => duplicateCarouselSlide(state(["slide_01", "slide_02"]), "slide_99")).toThrow(
      /Unknown slide/
    );
    expect(() => deleteCarouselSlide(state(["slide_01", "slide_02", "slide_03"]), "slide_99")).toThrow(
      /Unknown slide/
    );
  });

  it("moves an id before another id for native drag", () => {
    expect(moveSlideId(["a", "b", "c"], "c", "a")).toEqual(["c", "a", "b"]);
    expect(moveSlideId(["a", "b", "c"], "a", null)).toEqual(["b", "c", "a"]);
    expect(moveSlideId(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
  });
});
