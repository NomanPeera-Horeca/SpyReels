import { describe, expect, it } from "vitest";
import {
  VIRAL_POSTS_V1_DEFAULT_PLATFORM,
  VIRAL_POSTS_V1_PLATFORMS,
  isViralPostsV1Platform,
  normalizeViralPostsExplorePlatforms,
  normalizeViralPostsV1Platform,
  parseViralPostsYoutubeEnabled,
} from "@shared/viralPosts";
import { shouldSkipUnsupportedViralPostsPlatform } from "../poolRefresh";
import { filterViralPostsV1PoolSpecs } from "../poolRepository";

describe("Viral Posts platforms", () => {
  it("supports Instagram, TikTok, and YouTube", () => {
    expect([...VIRAL_POSTS_V1_PLATFORMS]).toEqual([
      "instagram",
      "tiktok",
      "youtube",
    ]);
    expect(isViralPostsV1Platform("instagram")).toBe(true);
    expect(isViralPostsV1Platform("tiktok")).toBe(true);
    expect(isViralPostsV1Platform("youtube")).toBe(true);
    expect(isViralPostsV1Platform("YOUTUBE")).toBe(true);
  });

  it("rejects only unknown platforms before provider spend", () => {
    expect(shouldSkipUnsupportedViralPostsPlatform("youtube")).toBe(false);
    expect(shouldSkipUnsupportedViralPostsPlatform("instagram")).toBe(false);
    expect(shouldSkipUnsupportedViralPostsPlatform("tiktok")).toBe(false);
    expect(shouldSkipUnsupportedViralPostsPlatform("unknown")).toBe(true);
  });

  it("keeps YouTube opt-in and gated by Viral Posts live mode", () => {
    expect(parseViralPostsYoutubeEnabled(undefined, true)).toBe(false);
    expect(parseViralPostsYoutubeEnabled("true", true)).toBe(true);
    expect(parseViralPostsYoutubeEnabled("false", true)).toBe(false);
    expect(parseViralPostsYoutubeEnabled("true", false)).toBe(false);
  });

  it("keeps YouTube pool specs when requested", () => {
    const filtered = filterViralPostsV1PoolSpecs([
      { niche: "n", pillar: "p", platform: "instagram" },
      { niche: "n", pillar: "p", platform: "tiktok" },
      { niche: "n", pillar: "p", platform: "youtube" },
    ]);
    expect(filtered.map((s) => s.platform)).toEqual([
      "instagram",
      "tiktok",
      "youtube",
    ]);
  });

  it("normalizes YouTube to itself and unknown state to the default", () => {
    expect(normalizeViralPostsV1Platform("youtube")).toBe("youtube");
    expect(normalizeViralPostsV1Platform("unknown")).toBe(
      VIRAL_POSTS_V1_DEFAULT_PLATFORM
    );
    expect(normalizeViralPostsV1Platform("tiktok")).toBe("tiktok");
    expect(normalizeViralPostsV1Platform("instagram")).toBe("instagram");
  });

  it("preserves supported UI platform filters", () => {
    expect(
      normalizeViralPostsExplorePlatforms({
        instagram: true,
        tiktok: true,
        youtube: true,
      })
    ).toEqual({
      instagram: true,
      tiktok: true,
      youtube: true,
    });
  });
});
