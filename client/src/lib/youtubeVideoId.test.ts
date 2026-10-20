import { describe, expect, it } from "vitest";
import {
  resolveYouTubeVideoId,
  youtubeAmbientEmbedSrc,
  youtubeEmbedSrc,
} from "./youtubeVideoId";

describe("resolveYouTubeVideoId", () => {
  it("uses Collected shortcode when it is already a video id", () => {
    expect(
      resolveYouTubeVideoId({
        shortcode: "uFXEyfa8YwQ",
        reelUrl: "https://www.youtube.com/shorts/uFXEyfa8YwQ",
      })
    ).toBe("uFXEyfa8YwQ");
  });

  it("parses shorts and watch URLs when shortcode is missing", () => {
    expect(
      resolveYouTubeVideoId({
        reelUrl: "https://www.youtube.com/shorts/cjs53i-o2yo",
      })
    ).toBe("cjs53i-o2yo");
    expect(
      resolveYouTubeVideoId({
        reelUrl: "https://www.youtube.com/watch?v=akvtYUNrn8w",
      })
    ).toBe("akvtYUNrn8w");
  });
});

describe("youtubeEmbedSrc", () => {
  it("builds an autoplay embed URL", () => {
    expect(youtubeEmbedSrc("uFXEyfa8YwQ")).toContain(
      "https://www.youtube.com/embed/uFXEyfa8YwQ?"
    );
    expect(youtubeEmbedSrc("uFXEyfa8YwQ")).toContain("autoplay=1");
    expect(youtubeEmbedSrc("uFXEyfa8YwQ")).not.toContain("mute=1");
  });

  it("builds a muted looping inline embed for the onboarding stack", () => {
    const src = youtubeAmbientEmbedSrc("uFXEyfa8YwQ", "http://127.0.0.1:3022");
    expect(src).toContain("mute=1");
    expect(src).toContain("autoplay=1");
    expect(src).toContain("loop=1");
    expect(src).toContain("playsinline=1");
    expect(src).toContain("playlist=uFXEyfa8YwQ");
    expect(src).toContain("enablejsapi=1");
    expect(src).toContain("origin=http%3A%2F%2F127.0.0.1%3A3022");
  });
});
