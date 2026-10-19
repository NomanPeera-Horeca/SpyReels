import { describe, expect, it } from "vitest";
import type { ViralPost } from "@shared/viralPosts";
import { resolveViralPostPlayback, safeHttpUrl } from "./viralPostPlayback";

function post(overrides: Partial<ViralPost> = {}): ViralPost {
  return {
    id: "1",
    sourceId: "ABC123xyz",
    platform: "instagram",
    creatorName: "Creator",
    sourceUrl: "https://www.instagram.com/reel/ABC123xyz/",
    thumbnailUrl: "https://cdn.example.com/thumb.jpg",
    videoUrl: "https://cdn.example.com/video.mp4",
    reelId: 42,
    trendStatus: "unknown",
    relevanceLabel: "Match",
    relevanceReason: "Niche",
    saved: false,
    dismissed: false,
    remade: false,
    ...overrides,
  };
}

describe("safeHttpUrl", () => {
  it("keeps http and https URLs", () => {
    expect(safeHttpUrl(" https://www.tiktok.com/@a/video/1 ")).toBe(
      "https://www.tiktok.com/@a/video/1"
    );
    expect(safeHttpUrl("http://example.com/v")).toBe("http://example.com/v");
  });

  it("rejects empty and non-http URLs", () => {
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("   ")).toBeNull();
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
});

describe("resolveViralPostPlayback", () => {
  it("plays an Instagram reel through the file player", () => {
    const playback = resolveViralPostPlayback(post());
    expect(playback).toMatchObject({
      kind: "file",
      platform: "instagram",
      shortcode: "ABC123xyz",
      reelId: 42,
      videoUrl: "https://cdn.example.com/video.mp4",
      videoPageUrl: null,
      external: {
        href: "https://www.instagram.com/reel/ABC123xyz/",
        label: "Watch on Instagram",
      },
    });
  });

  it("reads an Instagram shortcode from the reel URL when sourceId is not a code", () => {
    const playback = resolveViralPostPlayback(
      post({
        sourceId: "not a code",
        sourceUrl: "https://www.instagram.com/reel/C13BR_GvZVJ/?utm_source=ig",
        videoUrl: null,
        reelId: null,
      })
    );
    expect(playback).toMatchObject({
      kind: "file",
      platform: "instagram",
      shortcode: "C13BR_GvZVJ",
    });
  });

  it("plays a TikTok from the page URL and does not pass reels.id", () => {
    const playback = resolveViralPostPlayback(
      post({
        platform: "tiktok",
        sourceId: "7123456789",
        sourceUrl: "https://www.tiktok.com/@chef/video/7123456789",
        videoUrl: null,
        reelId: 99,
      })
    );
    expect(playback).toMatchObject({
      kind: "file",
      platform: "tiktok",
      videoPageUrl: "https://www.tiktok.com/@chef/video/7123456789",
      external: {
        href: "https://www.tiktok.com/@chef/video/7123456789",
        label: "Watch on TikTok",
      },
    });
    expect(playback).not.toHaveProperty("reelId");
  });

  it("plays a YouTube Short in the embed player", () => {
    const playback = resolveViralPostPlayback(
      post({
        platform: "youtube",
        sourceId: "uFXEyfa8YwQ",
        sourceUrl: "https://www.youtube.com/shorts/uFXEyfa8YwQ",
        videoUrl: null,
        reelId: null,
      })
    );
    expect(playback).toEqual({
      kind: "youtube",
      videoId: "uFXEyfa8YwQ",
      external: {
        href: "https://www.youtube.com/shorts/uFXEyfa8YwQ",
        label: "Watch on YouTube",
      },
    });
  });

  it("builds a YouTube watch link when the page URL is missing but the id is known", () => {
    const playback = resolveViralPostPlayback(
      post({
        platform: "youtube",
        sourceId: "uFXEyfa8YwQ",
        sourceUrl: "",
        videoUrl: null,
        reelId: null,
      })
    );
    expect(playback).toMatchObject({
      kind: "youtube",
      videoId: "uFXEyfa8YwQ",
      external: {
        href: "https://www.youtube.com/shorts/uFXEyfa8YwQ",
        label: "Watch on YouTube",
      },
    });
  });

  it("does not open a player when the video cannot be identified", () => {
    expect(
      resolveViralPostPlayback(
        post({
          platform: "youtube",
          sourceId: "nope",
          sourceUrl: "javascript:alert(1)",
          videoUrl: null,
          reelId: null,
        })
      )
    ).toEqual({ kind: "unavailable", external: null });

    expect(
      resolveViralPostPlayback(
        post({
          platform: "tiktok",
          sourceId: "1",
          sourceUrl: "",
          videoUrl: null,
          reelId: 5,
        })
      )
    ).toEqual({ kind: "unavailable", external: null });

    expect(
      resolveViralPostPlayback(
        post({
          platform: "instagram",
          sourceId: "",
          sourceUrl: "",
          videoUrl: "  ",
          reelId: null,
          thumbnailUrl: null,
        })
      )
    ).toEqual({ kind: "unavailable", external: null });
  });
});
