import { describe, expect, it } from "vitest";
import { extractTikTokPlayUrl } from "./tiktok";

describe("extractTikTokPlayUrl", () => {
  it("prefers no-watermark addr", () => {
    expect(
      extractTikTokPlayUrl({
        download_no_watermark_addr: {
          url_list: ["https://cdn.example/no-wm.mp4"],
        },
        play_addr: { url_list: ["https://cdn.example/wm.mp4"] },
      })
    ).toBe("https://cdn.example/no-wm.mp4");
  });

  it("falls back to bit_rate when top-level play_addr is empty", () => {
    expect(
      extractTikTokPlayUrl({
        has_watermark: true,
        play_addr: { url_list: [] },
        bit_rate: [
          {
            play_addr: {
              url_list: ["https://cdn.example/bit0.mp4", "https://cdn.example/bit0b.mp4"],
            },
          },
        ],
      })
    ).toBe("https://cdn.example/bit0.mp4");
  });

  it("returns empty string when no playable urls exist", () => {
    expect(extractTikTokPlayUrl({ play_addr: { url_list: [] } })).toBe("");
    expect(extractTikTokPlayUrl(null)).toBe("");
  });
});
