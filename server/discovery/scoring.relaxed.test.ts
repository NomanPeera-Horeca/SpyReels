import { describe, expect, it } from "vitest";
import { scoreReel, scoreReelRelaxed, type ParsedReel } from "./scoring";

function baseOwner(followers: number): ParsedReel["owner"] {
  return {
    username: "creator",
    fullName: "Creator",
    followers,
    isVerified: false,
    isPrivate: false,
    biography: "",
    profilePicUrl: "",
  };
}

function reel(views: number, followers: number): ParsedReel {
  return {
    shortcode: "abc123",
    caption: "restaurant labor tips",
    views,
    likes: 2_000,
    comments: 100,
    videoUrl: "",
    thumbnailUrl: "https://example.com/t.jpg",
    postedAt: new Date(),
    owner: baseOwner(followers),
  };
}

describe("scoreReelRelaxed", () => {
  it("drops hashtag reels under strict scoring when followers are missing", () => {
    expect(scoreReel(reel(50_000, 0))).toBeNull();
  });

  it("keeps hashtag reels with views when followers are missing", () => {
    const scored = scoreReelRelaxed(reel(50_000, 0));
    expect(scored).not.toBeNull();
    expect(scored!.tier).toBe(1);
    expect(scored!.reachMultiplier).toBe(0);
  });

  it("still uses strict thresholds when followers exist", () => {
    const scored = scoreReelRelaxed(reel(50_000, 5_000));
    expect(scored).not.toBeNull();
    expect(scored!.reachMultiplier).toBe(10);
  });
});
