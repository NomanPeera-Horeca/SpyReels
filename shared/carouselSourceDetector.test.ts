import { describe, expect, it } from "vitest";
import {
  detectCarouselSource,
  looksLikeCarouselSourceUrl,
  normalizeCarouselSourceUrl,
} from "./carouselSourceDetector";

describe("carouselSourceDetector", () => {
  it("treats empty and freeform text as an idea", () => {
    expect(detectCarouselSource("").kind).toBe("idea");
    expect(detectCarouselSource("7 restaurant mistakes").kind).toBe("idea");
    expect(looksLikeCarouselSourceUrl("7 restaurant mistakes")).toBe(false);
  });

  it("does not treat mixed text and a URL as a source URL", () => {
    expect(
      looksLikeCarouselSourceUrl("see https://www.youtube.com/watch?v=abc")
    ).toBe(false);
    expect(
      detectCarouselSource("see https://www.youtube.com/watch?v=abc").kind
    ).toBe("idea");
  });

  it("detects YouTube, LinkedIn, Instagram, carousel, and article hosts", () => {
    expect(detectCarouselSource("https://www.youtube.com/watch?v=abc123")).toMatchObject({
      kind: "youtube",
      chipLabel: "YouTube video detected",
    });
    expect(detectCarouselSource("https://youtu.be/abc123").kind).toBe("youtube");
    expect(detectCarouselSource("https://www.linkedin.com/posts/example-post")).toMatchObject({
      kind: "linkedin",
      chipLabel: "LinkedIn post detected",
    });
    expect(detectCarouselSource("https://www.instagram.com/reel/abc123/")).toMatchObject({
      kind: "instagram",
      chipLabel: "Instagram post detected",
    });
    expect(detectCarouselSource("https://www.instagram.com/p/abc123/")).toMatchObject({
      kind: "carousel",
      chipLabel: "Existing carousel detected",
    });
    expect(detectCarouselSource("https://example.com/restaurant-pricing-guide")).toMatchObject({
      kind: "article",
      chipLabel: "Article or webpage detected",
    });
  });

  it("reuses the same URL-shape rules as looksLikeCarouselSourceUrl", () => {
    expect(looksLikeCarouselSourceUrl("www.example.com/post")).toBe(true);
    expect(normalizeCarouselSourceUrl("www.example.com/post")).toBe(
      "https://www.example.com/post"
    );
    expect(detectCarouselSource("www.example.com/post").kind).toBe("article");
  });
});
