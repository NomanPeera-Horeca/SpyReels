import { describe, expect, it } from "vitest";
import {
  extractAllCollectedVideoUrlsAsync,
  parseCollectedVideoUrl,
  parseCollectedVideoUrlSync,
} from "./socialVideoUrl";

describe("socialVideoUrl", () => {
  it("parses an Instagram Reel", () => {
    const parsed = parseCollectedVideoUrlSync(
      "https://www.instagram.com/reel/C9abc_DEF12/"
    );
    expect(parsed?.platform).toBe("instagram");
    expect(parsed?.externalId).toBe("C9abc_DEF12");
  });

  it("parses a canonical TikTok video", () => {
    const parsed = parseCollectedVideoUrlSync(
      "https://www.tiktok.com/@creator/video/7412345678901234567"
    );
    expect(parsed).toEqual({
      platform: "tiktok",
      externalId: "7412345678901234567",
      canonicalUrl:
        "https://www.tiktok.com/@creator/video/7412345678901234567",
    });
  });

  it("resolves a TikTok vt short link through the canonical async parser", async () => {
    const parsed = await parseCollectedVideoUrl("https://vt.tiktok.com/ZSabc123/", {
      resolveRedirect: async () =>
        "https://www.tiktok.com/@creator/video/7412345678901234567",
    });
    expect(parsed?.platform).toBe("tiktok");
    expect(parsed?.externalId).toBe("7412345678901234567");
  });

  it("resolves a TikTok /t/ link through the canonical async parser", async () => {
    const parsed = await parseCollectedVideoUrl(
      "https://www.tiktok.com/t/ZT8abcDEF/",
      {
        resolveRedirect: async () =>
          "https://www.tiktok.com/@creator/video/7412345678901234568",
      }
    );
    expect(parsed?.platform).toBe("tiktok");
    expect(parsed?.externalId).toBe("7412345678901234568");
  });

  it("parses YouTube Shorts, watch, youtu.be, and live URLs", () => {
    expect(
      parseCollectedVideoUrlSync("https://www.youtube.com/shorts/AbCdEf12345")
        ?.externalId
    ).toBe("AbCdEf12345");
    expect(
      parseCollectedVideoUrlSync(
        "https://www.youtube.com/watch?v=AbCdEf12345"
      )?.externalId
    ).toBe("AbCdEf12345");
    expect(
      parseCollectedVideoUrlSync("https://youtu.be/AbCdEf12345")?.externalId
    ).toBe("AbCdEf12345");
    expect(
      parseCollectedVideoUrlSync("https://www.youtube.com/live/AbCdEf12345")
        ?.externalId
    ).toBe("AbCdEf12345");
  });

  it("keeps a TikTok short link when a mixed Telegram message also has IG and YouTube", async () => {
    const parsed = await extractAllCollectedVideoUrlsAsync(
      [
        "https://www.instagram.com/reel/C9abc_DEF12/",
        "https://vt.tiktok.com/ZSabc123/",
        "https://youtu.be/AbCdEf12345",
      ].join("\n"),
      {
        resolveRedirect: async () =>
          "https://www.tiktok.com/@creator/video/7412345678901234567",
      }
    );

    expect(parsed.map((item) => item.platform)).toEqual([
      "instagram",
      "tiktok",
      "youtube",
    ]);
  });

  it("dedupes the same video when Telegram includes it more than once", async () => {
    const parsed = await extractAllCollectedVideoUrlsAsync(
      "https://youtu.be/AbCdEf12345 https://www.youtube.com/watch?v=AbCdEf12345"
    );
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.platform).toBe("youtube");
  });
});
