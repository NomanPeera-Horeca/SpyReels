import { describe, expect, it } from "vitest";
import { platformFromReelUrl } from "./reelUrlPlatform";

describe("platformFromReelUrl", () => {
  it("reads the platform from a saved video's link", () => {
    expect(platformFromReelUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("youtube");
    expect(platformFromReelUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("youtube");
    expect(platformFromReelUrl("https://www.tiktok.com/@chef/video/123")).toBe("tiktok");
    expect(platformFromReelUrl("https://www.instagram.com/reel/abc/")).toBe("instagram");
    expect(platformFromReelUrl(null)).toBe("instagram");
    expect(platformFromReelUrl("https://notyoutube.com.evil.test/x")).toBe("instagram");
  });
});
