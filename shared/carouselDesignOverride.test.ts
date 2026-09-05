import { describe, expect, it } from "vitest";
import {
  applyCarouselDesignPatch,
  carouselDesignContrastWarning,
  isAllowedCarouselDesignFont,
  mergeCarouselDesignTokens,
  normalizeCarouselDesignOverride,
  storedDesignToTokenOverride,
} from "./carouselDesignOverride";
import type { CarouselDesignTokens } from "./carouselTemplates";

const TEMPLATE: CarouselDesignTokens = {
  fontFamily: {
    display: '"Fraunces", Georgia, serif',
    body: '"DM Sans", system-ui, sans-serif',
  },
  colors: {
    background: "#0D1610",
    foreground: "#F4F1EA",
    accent: "#A8FF60",
    muted: "#7FA88F",
  },
  aspectRatio: "4:5",
  decoration: "dots",
  radiusPx: 12,
  backgroundPattern: "none",
};

describe("carousel design override", () => {
  it("treats missing overrides as template defaults", () => {
    expect(normalizeCarouselDesignOverride(null)).toBeNull();
    expect(normalizeCarouselDesignOverride(undefined)).toBeNull();
    expect(mergeCarouselDesignTokens(TEMPLATE, null)).toEqual(TEMPLATE);
    expect(storedDesignToTokenOverride(null, null)).toBeUndefined();
  });

  it("accepts only hex colors and proven editor fonts", () => {
    expect(
      normalizeCarouselDesignOverride({
        background: "#111111",
        foreground: "#FFFFFF",
        accent: "#2B6CFF",
        muted: "#AABBCC",
        fontDisplay: 'Georgia, "Times New Roman", serif',
        fontBody: "Inter, system-ui, sans-serif",
      })
    ).toEqual({
      background: "#111111",
      foreground: "#FFFFFF",
      accent: "#2B6CFF",
      muted: "#AABBCC",
      fontDisplay: 'Georgia, "Times New Roman", serif',
      fontBody: "Inter, system-ui, sans-serif",
    });
    expect(
      normalizeCarouselDesignOverride({
        background: "red",
        foreground: "#FFFFFF",
        accent: "#2B6CFF",
        muted: "#AABBCC",
      })
    ).toBeNull();
    expect(
      normalizeCarouselDesignOverride({
        background: "#111111",
        foreground: "#FFFFFF",
        accent: "#2B6CFF",
        muted: "#AABBCC",
        fontDisplay: "Comic Sans",
      })
    ).toBeNull();
    expect(isAllowedCarouselDesignFont("Inter, system-ui, sans-serif")).toBe(
      true
    );
    expect(isAllowedCarouselDesignFont("Papyrus")).toBe(false);
  });

  it("rejects CSS injection in color and font fields", () => {
    expect(
      normalizeCarouselDesignOverride({
        background: "url(https://evil.test)",
        foreground: "#FFFFFF",
        accent: "#2B6CFF",
        muted: "#AABBCC",
      })
    ).toBeNull();
    expect(
      normalizeCarouselDesignOverride({
        background: "#111111",
        foreground: "#FFFFFF",
        accent: "#2B6CFF",
        muted: "#AABBCC",
        fontBody: "Inter; background: url(x)",
      })
    ).toBeNull();
  });

  it("nests color and font merges so empty fonts keep the template", () => {
    const merged = mergeCarouselDesignTokens(TEMPLATE, {
      colors: { background: "#FFFFFF" } as CarouselDesignTokens["colors"],
      fontFamily: { display: "", body: "" },
    });
    expect(merged.colors.background).toBe("#FFFFFF");
    expect(merged.colors.foreground).toBe("#F4F1EA");
    expect(merged.fontFamily).toEqual(TEMPLATE.fontFamily);
    expect(merged.decoration).toBe("dots");
    expect(merged.radiusPx).toBe(12);
    expect(merged.backgroundPattern).toBe("none");
  });

  it("materializes template colors on first patch without copying fonts", () => {
    const next = applyCarouselDesignPatch(null, TEMPLATE, {
      background: "#101010",
    });
    expect(next).toEqual({
      background: "#101010",
      foreground: "#F4F1EA",
      accent: "#A8FF60",
      muted: "#7FA88F",
    });
  });

  it("clears a font key back to the layout default without dropping colors", () => {
    const next = applyCarouselDesignPatch(
      {
        background: "#101010",
        foreground: "#F4F1EA",
        accent: "#A8FF60",
        muted: "#7FA88F",
        fontDisplay: 'Georgia, "Times New Roman", serif',
      },
      TEMPLATE,
      { fontDisplay: null }
    );
    expect(next).toEqual({
      background: "#101010",
      foreground: "#F4F1EA",
      accent: "#A8FF60",
      muted: "#7FA88F",
    });
  });

  it("warns only when text and background contrast is obviously poor", () => {
    expect(carouselDesignContrastWarning("#FFFFFF", "#111111")).toBe(false);
    expect(carouselDesignContrastWarning("#111111", "#161616")).toBe(true);
  });
});
