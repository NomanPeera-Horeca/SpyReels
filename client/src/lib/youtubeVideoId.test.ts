import { describe, expect, it } from "vitest";
import {
  resolveYouTubeVideoId,
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
  });
});
