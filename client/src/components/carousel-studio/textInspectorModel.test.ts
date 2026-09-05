import { describe, expect, it } from "vitest";
import { buildTextSelection, selectionMatches, slotLabelForRole } from "./textInspectorModel";

describe("carousel text inspector helpers", () => {
  it("identifies selection by slide and slot id, not visible text", () => {
    const selection = buildTextSelection("slide_02", "headline");
    expect(selection.role).toBe("headline");
    expect(selectionMatches(selection, "slide_02", "headline")).toBe(true);
    expect(selectionMatches(selection, "slide_01", "headline")).toBe(false);
    expect(selectionMatches(selection, "slide_02", "body")).toBe(false);
  });

  it("labels common roles for the inspector", () => {
    expect(slotLabelForRole("headline")).toBe("Headline");
    expect(slotLabelForRole("body")).toBe("Body");
    expect(slotLabelForRole("cta")).toBe("CTA");
  });
});
