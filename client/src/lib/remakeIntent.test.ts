import { describe, expect, it } from "vitest";
import {
  buildRemakeIntentMedia,
  isValidRemakeIntent,
  remakeIntentToTopic,
} from "./remakeIntent";

describe("remakeIntent", () => {
  it("uses an empty topic when adapting to the creator niche", () => {
    expect(remakeIntentToTopic({ mode: "niche" })).toBe("");
  });

  it("uses SAME_TOPIC when keeping the source topic", () => {
    expect(remakeIntentToTopic({ mode: "same_topic" })).toBe("SAME_TOPIC");
  });

  it("preserves a creator supplied angle as ground truth", () => {
    expect(
      remakeIntentToTopic({
        mode: "custom",
        angle: "  Use this 4-box structure for how to write a restaurant menu  ",
      })
    ).toBe("Use this 4-box structure for how to write a restaurant menu");
  });

  it("rejects an empty custom angle", () => {
    expect(isValidRemakeIntent({ mode: "custom", angle: "   " })).toBe(false);
  });

  it("accepts the two one-click directions", () => {
    expect(isValidRemakeIntent({ mode: "niche" })).toBe(true);
    expect(isValidRemakeIntent({ mode: "same_topic" })).toBe(true);
  });

  it("normalizes source preview media from Viral Posts fields", () => {
    expect(
      buildRemakeIntentMedia({
        thumbnailUrl: " https://cdn.example/thumb.jpg ",
        videoUrl: "https://cdn.example/video.mp4",
        reelId: 42,
        platform: "tiktok",
        sourceUrl: "https://www.tiktok.com/@x/video/1",
      })
    ).toEqual({
      thumbnailUrl: "https://cdn.example/thumb.jpg",
      videoUrl: "https://cdn.example/video.mp4",
      shortcode: null,
      reelId: 42,
      platform: "tiktok",
      videoPageUrl: "https://www.tiktok.com/@x/video/1",
      originalUrl: "https://www.tiktok.com/@x/video/1",
      durationSec: null,
    });
  });

  it("returns null when no preview identity exists", () => {
    expect(buildRemakeIntentMedia({})).toBeNull();
  });
});
