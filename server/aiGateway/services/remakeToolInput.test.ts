import { describe, expect, it } from "vitest";
import { normalizeRemakeToolInput } from "./remakeToolInput";

describe("normalizeRemakeToolInput", () => {
  it("leaves the new instruction shape untouched", () => {
    const input = {
      url: "https://www.instagram.com/reel/ABC123/",
      instruction: "keep the same topic",
      gradeLevel: "auto",
    };

    expect(normalizeRemakeToolInput(input)).toBe(input);
  });

  it("normalizes cached legacy same_topic calls", () => {
    expect(
      normalizeRemakeToolInput({
        url: "https://www.instagram.com/reel/ABC123/",
        mode: "same_topic",
        gradeLevel: "auto",
      })
    ).toEqual({
      url: "https://www.instagram.com/reel/ABC123/",
      mode: "same_topic",
      gradeLevel: "auto",
      instruction: "keep the same topic",
    });
  });

  it("normalizes cached legacy custom calls when an explicit angle exists", () => {
    expect(
      normalizeRemakeToolInput({
        url: "https://www.instagram.com/reel/ABC123/",
        mode: "custom",
        angle: "menu engineering",
      })
    ).toEqual({
      url: "https://www.instagram.com/reel/ABC123/",
      mode: "custom",
      angle: "menu engineering",
      instruction: "make this about menu engineering",
    });
  });

  it("does not trust a cached legacy niche guess", () => {
    expect(
      normalizeRemakeToolInput({
        url: "https://www.instagram.com/reel/ABC123/",
        mode: "niche",
      })
    ).toEqual({
      url: "https://www.instagram.com/reel/ABC123/",
      mode: "niche",
      instruction: "remake this",
    });
  });
});
