import { describe, expect, it } from "vitest";
import {
  MIN_REACH_MULTIPLIER,
  MIN_VIEWS,
  scoreReel,
  scoreReelRelaxed,
  scoreViralMetrics,
  type ParsedReel,
} from "./scoring";

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

  it("shares the same strict math for TikTok search without minting an Instagram URL", () => {
    const metrics = scoreViralMetrics({
      views: 24_000,
      likes: 1_200,
      comments: 80,
      followers: 4_000,
    });
    const instagram = scoreReel({
      ...reel(24_000, 4_000),
      likes: 1_200,
      comments: 80,
    });
    expect(metrics?.tier).toBe(instagram?.tier);
    expect(metrics?.viralScore).toBe(instagram?.viralScore);
    expect(instagram?.reelUrl).toContain("instagram.com/reel/");
    expect(MIN_VIEWS).toBe(5_000);
    expect(MIN_REACH_MULTIPLIER).toBe(3);
    expect(
      scoreViralMetrics({ views: 24_000, likes: 1_200, comments: 80, followers: 0 })
    ).toBeNull();
  });

  it("still uses strict thresholds when followers exist", () => {
    const scored = scoreReelRelaxed(reel(50_000, 5_000));
    expect(scored).not.toBeNull();
    expect(scored!.reachMultiplier).toBe(10);
  });
});
