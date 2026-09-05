import { describe, expect, it } from "vitest";
import {
  fanOutCarouselCoverUrl,
  upsertCarouselImageUrlMap,
} from "./carouselImageUrls";

describe("carousel image URL map", () => {
  it("updates one multi-slot without touching the sibling slot", () => {
    const next = upsertCarouselImageUrlMap(
      { slide_03: { photo: "https://a.example/a.jpg", photo_b: "https://b.example/b.jpg" } },
      "slide_03",
      "https://a.example/replaced.jpg",
      "photo"
    );
    expect(next.slide_03).toEqual({
      photo: "https://a.example/replaced.jpg",
      photo_b: "https://b.example/b.jpg",
    });
  });

  it("fans a shared cover URL to every participating slide", () => {
    const next = fanOutCarouselCoverUrl(
      { slide_01: "https://old.example/cover.jpg", slide_02: "https://old.example/cover.jpg" },
      "https://new.example/cover.jpg",
      ["slide_01", "slide_02", "slide_03"]
    );
    expect(next).toEqual({
      slide_01: "https://new.example/cover.jpg",
      slide_02: "https://new.example/cover.jpg",
      slide_03: "https://new.example/cover.jpg",
    });
  });
});
