import { describe, expect, it } from "vitest";
import {
  applyCarouselImageFrame,
  defaultCarouselImageFrame,
  normalizeCarouselImageFrameMap,
  upsertCarouselImageFrameMap,
} from "./carouselImageFrame";

describe("carousel image frames", () => {
  it("treats missing metadata as layout defaults", () => {
    expect(normalizeCarouselImageFrameMap(null)).toEqual({});
    expect(applyCarouselImageFrame({ backgroundImage: "url(x)" }, null)).toMatchObject({
      backgroundPosition: "center",
      backgroundSize: "cover",
    });
  });

  it("clamps zoom and position", () => {
    const map = normalizeCarouselImageFrameMap({
      slide_01: { photo: { posX: 140, posY: -10, zoom: 4 } },
    });
    expect(map.slide_01?.photo).toEqual({ posX: 100, posY: 0, zoom: 2 });
  });

  it("upserts one slot without touching another", () => {
    const next = upsertCarouselImageFrameMap(
      { slide_01: { photo: defaultCarouselImageFrame(), photo_b: { posX: 20, posY: 20, zoom: 1.2 } } },
      "slide_01",
      "photo",
      { zoom: 1.5 }
    );
    expect(next.slide_01?.photo?.zoom).toBe(1.5);
    expect(next.slide_01?.photo_b).toEqual({ posX: 20, posY: 20, zoom: 1.2 });
  });
});
