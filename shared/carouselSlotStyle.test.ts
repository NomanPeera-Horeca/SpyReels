import { describe, expect, it } from "vitest";
import {
  applyCarouselSlotStyleOverride,
  inferCarouselSlotRole,
  normalizeCarouselSlotStyle,
  normalizeCarouselSlotStyleMap,
  upsertCarouselSlotStyleMap,
} from "./carouselSlotStyle";

describe("carousel slot style", () => {
  it("maps common slot ids to editor roles", () => {
    expect(inferCarouselSlotRole("headline")).toBe("headline");
    expect(inferCarouselSlotRole("kicker")).toBe("kicker");
    expect(inferCarouselSlotRole("body")).toBe("body");
    expect(inferCarouselSlotRole("cta_label")).toBe("cta");
    expect(inferCarouselSlotRole("quote")).toBe("quote");
    expect(inferCarouselSlotRole("left_title")).toBe("headline");
  });

  it("drops unknown or unsafe typography values", () => {
    expect(
      normalizeCarouselSlotStyle({
        fontFamily: "Comic Sans",
        fontSizePx: 8,
        fontWeight: 123,
        textAlign: "justify",
        color: "red",
      })
    ).toBeNull();
  });

  it("keeps allowlisted typography", () => {
    const style = normalizeCarouselSlotStyle({
      fontFamily: '"Fraunces", Georgia, serif',
      fontSizePx: 28,
      fontWeight: 700,
      textAlign: "left",
      color: "#F4F1EA",
    });
    expect(style).toEqual({
      fontFamily: '"Fraunces", Georgia, serif',
      fontSizePx: 28,
      fontWeight: 700,
      textAlign: "left",
      color: "#F4F1EA",
    });
  });

  it("treats missing maps as empty so old remakes stay unchanged", () => {
    expect(normalizeCarouselSlotStyleMap(null)).toEqual({});
    expect(normalizeCarouselSlotStyleMap(undefined)).toEqual({});
  });

  it("merges one slot without mutating other slides", () => {
    const next = upsertCarouselSlotStyleMap(
      { slide_01: { headline: { fontWeight: 700 } } },
      "slide_02",
      "body",
      { textAlign: "left" }
    );
    expect(next.slide_01.headline).toEqual({ fontWeight: 700 });
    expect(next.slide_02.body).toEqual({ textAlign: "left" });
  });

  it("applies overrides on top of layout styles", () => {
    expect(
      applyCarouselSlotStyleOverride(
        { fontSize: "2rem", color: "#111" },
        { fontSizePx: 32, color: "#fff" }
      )
    ).toMatchObject({ fontSize: 32, color: "#fff" });
  });
});
