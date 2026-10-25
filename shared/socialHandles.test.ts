import { describe, expect, it } from "vitest";
import {
  isValidInstagramHandleNormalized,
  isValidTikTokHandleNormalized,
  isValidYouTubeHandleNormalized,
  normalizeInstagramHandle,
  normalizeTikTokHandle,
  normalizeYouTubeHandle,
} from "./socialHandles";

describe("instagram handles", () => {
  it("accepts a real handle that starts or ends with an underscore", () => {
    expect(isValidInstagramHandleNormalized("carterpcs_")).toBe(true);
    expect(isValidInstagramHandleNormalized("_carterpcs")).toBe(true);
    expect(isValidInstagramHandleNormalized("car__ter")).toBe(true);
    expect(normalizeInstagramHandle("  @Carterpcs_ ")).toBe("carterpcs_");
  });

  it("rejects a period at either end or two periods in a row", () => {
    expect(isValidInstagramHandleNormalized(".carter")).toBe(false);
    expect(isValidInstagramHandleNormalized("carter.")).toBe(false);
    expect(isValidInstagramHandleNormalized("car..ter")).toBe(false);
  });

  it("pulls the handle out of a profile link", () => {
    expect(normalizeInstagramHandle("https://instagram.com/carterpcs_/")).toBe("carterpcs_");
  });
});

describe("tiktok handles", () => {
  it("accepts periods and underscores anywhere", () => {
    expect(isValidTikTokHandleNormalized("khaby.lame")).toBe(true);
    expect(isValidTikTokHandleNormalized("_name_")).toBe(true);
    expect(isValidTikTokHandleNormalized("name_")).toBe(true);
    expect(normalizeTikTokHandle("https://www.tiktok.com/@Name_")).toBe("name_");
  });

  it("rejects a one character username", () => {
    expect(isValidTikTokHandleNormalized("a")).toBe(false);
  });
});

describe("youtube handles", () => {
  it("accepts hyphens, trailing underscores, and letters from other languages", () => {
    expect(isValidYouTubeHandleNormalized("mr-beast")).toBe(true);
    expect(isValidYouTubeHandleNormalized("carterpcs_")).toBe(true);
    expect(isValidYouTubeHandleNormalized("김프로")).toBe(true);
    expect(normalizeYouTubeHandle("@Mr-Beast")).toBe("mr-beast");
  });

  it("keeps a channel id case intact", () => {
    const channelId = "UCabcdefghijklmnopqrstuv";
    expect(normalizeYouTubeHandle(`https://youtube.com/channel/${channelId}`)).toBe(channelId);
    expect(isValidYouTubeHandleNormalized(channelId)).toBe(true);
  });

  it("rejects punctuation with no letters or numbers", () => {
    expect(isValidYouTubeHandleNormalized("..")).toBe(false);
    expect(isValidYouTubeHandleNormalized("--")).toBe(false);
  });
});
