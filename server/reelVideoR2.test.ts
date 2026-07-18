import { describe, expect, it } from "vitest";
import { isDurableReelVideoUrl } from "./reelVideoR2";

describe("isDurableReelVideoUrl", () => {
  it("accepts R2 reel-videos URLs", () => {
    expect(
      isDurableReelVideoUrl(
        "https://pub-059f1c24b0b4430da6a57824dd88b55e.r2.dev/reel-videos/DAwcdqZPFkI.mp4"
      )
    ).toBe(true);
  });

  it("rejects Instagram CDN URLs", () => {
    expect(
      isDurableReelVideoUrl(
        "https://scontent-sjc3-1.cdninstagram.com/o1/v/t2/f2/m86/AQOhCUk.mp4"
      )
    ).toBe(false);
  });

  it("rejects empty values", () => {
    expect(isDurableReelVideoUrl(null)).toBe(false);
    expect(isDurableReelVideoUrl("")).toBe(false);
  });
});
