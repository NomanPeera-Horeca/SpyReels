import { describe, expect, it } from "vitest";
import { buildHookTeaserPartial, formatHookPatternLabel } from "@shared/hookGenerator";

describe("hookGenerator shared", () => {
  it("buildHookTeaserPartial truncates to four words", () => {
    expect(buildHookTeaserPartial("I worked 9 to 5 for 3 years before my first 1K")).toBe(
      "I worked 9 to..."
    );
  });

  it("formatHookPatternLabel replaces underscores", () => {
    expect(formatHookPatternLabel("mistake_callout")).toBe("Mistake Callout");
  });
});
