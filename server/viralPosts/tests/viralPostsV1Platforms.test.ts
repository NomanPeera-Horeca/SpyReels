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

describe("Viral Posts V1 platforms", () => {
  it("supports only Instagram and TikTok", () => {
    expect([...VIRAL_POSTS_V1_PLATFORMS]).toEqual(["instagram", "tiktok"]);
    expect(isViralPostsV1Platform("instagram")).toBe(true);
    expect(isViralPostsV1Platform("tiktok")).toBe(true);
    expect(isViralPostsV1Platform("youtube")).toBe(false);
    expect(isViralPostsV1Platform("YOUTUBE")).toBe(false);
  });

  it("treats YouTube as unsupported only for Viral Posts V1", () => {
    expect(shouldSkipUnsupportedViralPostsPlatform("youtube")).toBe(true);
    expect(shouldSkipUnsupportedViralPostsPlatform("instagram")).toBe(false);
    expect(shouldSkipUnsupportedViralPostsPlatform("tiktok")).toBe(false);
  });

  it("forces Viral Posts YouTube flag off even when live is on", () => {
    expect(parseViralPostsYoutubeEnabled(undefined, true)).toBe(false);
    expect(parseViralPostsYoutubeEnabled("true", true)).toBe(false);
    expect(parseViralPostsYoutubeEnabled("false", true)).toBe(false);
  });

  it("drops YouTube from pool ensure specs so no new YouTube pools are created", () => {
    const filtered = filterViralPostsV1PoolSpecs([
      { niche: "n", pillar: "p", platform: "instagram" },
      { niche: "n", pillar: "p", platform: "tiktok" },
      { niche: "n", pillar: "seed", platform: "youtube" },
    ]);
    expect(filtered.map((s) => s.platform)).toEqual(["instagram", "tiktok"]);
  });

  it("skips historical YouTube pool refresh with zero provider calls", () => {
    // Pure guard used by refreshPoolById before any scrape / lock work.
    expect(shouldSkipUnsupportedViralPostsPlatform("youtube")).toBe(true);
  });

  it("normalizes stale youtube platform state to the V1 default", () => {
    expect(normalizeViralPostsV1Platform("youtube")).toBe(
      VIRAL_POSTS_V1_DEFAULT_PLATFORM
    );
    expect(normalizeViralPostsV1Platform("unknown")).toBe("instagram");
    expect(normalizeViralPostsV1Platform("tiktok")).toBe("tiktok");
    expect(normalizeViralPostsV1Platform("instagram")).toBe("instagram");
  });

  it("UI platform filters force YouTube off (no empty YouTube Explore state)", () => {
    expect(
      normalizeViralPostsExplorePlatforms({
        instagram: true,
        tiktok: true,
        youtube: true,
      })
    ).toEqual({
      instagram: true,
      tiktok: true,
      youtube: false,
    });
    expect(
      normalizeViralPostsExplorePlatforms({
        instagram: false,
        tiktok: false,
        youtube: true,
      }).youtube
    ).toBe(false);
  });
});
