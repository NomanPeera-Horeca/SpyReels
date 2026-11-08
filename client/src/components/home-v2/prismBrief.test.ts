import { describe, expect, it } from "vitest";
import { PRISM_FORMATS, prismBrief } from "./PrismRemakeDialog";

describe("prismBrief", () => {
  const post = {
    platform: "instagram" as const,
    caption: "Food cost control: the one number every restaurant owner ignores",
    sourceUrl: "https://www.instagram.com/reel/abc/",
    viralMultiple: 4.27,
  };
  it("asks for the chosen format, same topic and hook, and no invented facts", () => {
    const b = prismBrief(post, "myth");
    expect(b).toContain("Remake my own Instagram video that got 4.3x my usual views in a new format: Myth-bust");
    expect(b).toContain('My original video: "Food cost control');
    expect(b).toContain("https://www.instagram.com/reel/abc/");
    expect(b).toContain("same topic");
    expect(b).toContain("[add your real result here]");
  });
  it("has 10 Prism formats", () => {
    expect(PRISM_FORMATS).toHaveLength(10);
  });
});
