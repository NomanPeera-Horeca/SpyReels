import { describe, expect, it } from "vitest";
import { deriveCarouselLibraryMeta } from "./carouselStudio";

const structure = [
  { id: "hook" },
  { id: "point_1" },
  { id: "cta" },
];

describe("deriveCarouselLibraryMeta", () => {
  it("prefers the first slide headline, then title, then kicker", () => {
    expect(
      deriveCarouselLibraryMeta({
        slideStructure: structure,
        slotValues: {
          hook: { headline: "Check weekly numbers", title: "Ignored", kicker: "Ignored" },
        },
        niche: "Restaurants",
      }).title
    ).toBe("Check weekly numbers");

    expect(
      deriveCarouselLibraryMeta({
        slideStructure: structure,
        slotValues: {
          hook: { title: "The 4 numbers", kicker: "Framework" },
        },
      }).title
    ).toBe("The 4 numbers");

    expect(
      deriveCarouselLibraryMeta({
        slideStructure: structure,
        slotValues: {
          hook: { kicker: "Contrarian" },
        },
      }).title
    ).toBe("Contrarian");
  });

  it("uses slideStructure order, not slotValues insertion order", () => {
    const result = deriveCarouselLibraryMeta({
      slideStructure: structure,
      slotValues: {
        cta: { headline: "Save this" },
        hook: { headline: "First slide wins" },
      },
    });
    expect(result.title).toBe("First slide wins");
    expect(result.slideCount).toBe(3);
  });

  it("falls back to niche, then Untitled carousel", () => {
    expect(
      deriveCarouselLibraryMeta({
        slideStructure: structure,
        slotValues: { hook: { body: "No title slots" } },
        niche: "Independent restaurants",
      }).title
    ).toBe("Independent restaurants");

    expect(
      deriveCarouselLibraryMeta({
        slideStructure: [],
        slotValues: {},
      }).title
    ).toBe("Untitled carousel");
  });

  it("counts only slides with ids in slideStructureJson", () => {
    expect(
      deriveCarouselLibraryMeta({
        slideStructure: [{ id: "a" }, { label: "skip" }, { id: "b" }, null],
        slotValues: {},
      }).slideCount
    ).toBe(2);

    expect(
      deriveCarouselLibraryMeta({
        slideStructure: null,
        slotValues: { hook: { headline: "x" } },
      }).slideCount
    ).toBe(0);
  });
});
