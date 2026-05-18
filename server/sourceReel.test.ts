import { describe, expect, it } from "vitest";
import { extractHashtagsFromCaption, toSourceReel } from "./sourceReel";

describe("extractHashtagsFromCaption", () => {
  it("parses unique hashtags without hash prefix", () => {
    const tags = extractHashtagsFromCaption(
      "Great reel #Fitness #growth #Fitness again"
    );
    expect(tags).toEqual(["Fitness", "growth"]);
  });

  it("returns empty array for empty caption", () => {
    expect(extractHashtagsFromCaption(null)).toEqual([]);
  });
});

describe("toSourceReel", () => {
  it("maps ownerUsername to ownerHandle", () => {
    const payload = toSourceReel({
      id: 9,
      jobId: 1,
      workspaceId: "w",
      shortcode: "SC",
      caption: "#tag",
      viewCount: 1,
      likeCount: 2,
      commentCount: 3,
      thumbnailUrl: null,
      videoUrl: null,
      reelUrl: "https://instagram.com/reel/SC/",
      duration: 10,
      postedAt: new Date("2025-01-01"),
      ownerUsername: "creator",
      createdAt: new Date(),
      viralFlag: false,
    } as any);
    expect(payload.ownerHandle).toBe("creator");
    expect(payload.hashtags).toEqual(["tag"]);
  });
});
