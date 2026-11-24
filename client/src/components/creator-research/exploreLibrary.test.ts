import { describe, expect, it } from "vitest";
import { effectiveExplorePlatform, libraryCreatorStats, visibleExplorePlatforms } from "./ExploreLibrary";

describe("which platform logos show", () => {
  it("only platforms with creators (Instagram also while loading)", () => {
    expect(visibleExplorePlatforms({ instagram: { count: 4, loading: false }, tiktok: 3, youtube: 0 })).toEqual(["instagram", "tiktok"]);
    expect(visibleExplorePlatforms({ instagram: { count: 0, loading: true }, tiktok: 0, youtube: 2 })).toEqual(["instagram", "youtube"]);
    expect(visibleExplorePlatforms({ instagram: { count: 0, loading: false }, tiktok: 0, youtube: 0 })).toEqual([]);
  });
  it("falls back to the first shown platform when the chosen one is empty", () => {
    expect(effectiveExplorePlatform("tiktok", ["instagram", "tiktok"])).toBe("tiktok");
    expect(effectiveExplorePlatform("instagram", ["tiktok", "youtube"])).toBe("tiktok");
    expect(effectiveExplorePlatform("youtube", [])).toBe("instagram");
  });
});

describe("creator line", () => {
  it("says followers for TikTok, subscribers for YouTube, and skips zero", () => {
    expect(libraryCreatorStats({ platform: "tiktok", followerCount: 310_000, videoCount: 6 })).toBe("310K followers · 6 top videos from our library");
    expect(libraryCreatorStats({ platform: "youtube", followerCount: 1_200_000, videoCount: 1 })).toBe("1.2M subscribers · 1 top video from our library");
    expect(libraryCreatorStats({ platform: "tiktok", followerCount: 0, videoCount: 2 })).toBe("2 top videos from our library");
  });
});
