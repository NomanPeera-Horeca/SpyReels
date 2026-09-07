import { describe, expect, it } from "vitest";
import {
  applyViralPostSavedOverrides,
  dedupeViralPostsByCanonicalKey,
  normalizeViralPostPlatform,
  viralPostCanonicalKey,
  viralPostCanonicalKeyFromPost,
} from "./viralPosts";

describe("Viral Posts Saved V1 identity", () => {
  it("builds Instagram save identity from platform + sourceId", () => {
    expect(viralPostCanonicalKey("instagram", "AbC123")).toBe("instagram:AbC123");
  });

  it("builds TikTok save identity from platform + sourceId", () => {
    expect(viralPostCanonicalKey("tiktok", "7123456789")).toBe(
      "tiktok:7123456789"
    );
  });

  it("does not collide when IG and TikTok share the same external id", () => {
    const ig = viralPostCanonicalKey("instagram", "same-id");
    const tt = viralPostCanonicalKey("tiktok", "same-id");
    expect(ig).not.toBe(tt);
    expect(ig).toBe("instagram:same-id");
    expect(tt).toBe("tiktok:same-id");
  });

  it("dedupes duplicate saved rows for the same platform post", () => {
    const items = dedupeViralPostsByCanonicalKey([
      { id: "1", platform: "instagram", sourceId: "abc", saved: true },
      { id: "2", platform: "instagram", sourceId: "abc", saved: true },
      { id: "3", platform: "tiktok", sourceId: "abc", saved: true },
    ]);
    expect(items.map((p) => p.id)).toEqual(["1", "3"]);
  });

  it("unsaved override clears saved state for Explore and Saved views", () => {
    const posts = [
      {
        id: "10",
        platform: "instagram" as const,
        sourceId: "reel-1",
        saved: true,
      },
      {
        id: "11",
        platform: "tiktok" as const,
        sourceId: "tt-1",
        saved: true,
      },
    ];
    const next = applyViralPostSavedOverrides(posts, {
      [viralPostCanonicalKey("instagram", "reel-1")]: false,
    });
    expect(next[0]?.saved).toBe(false);
    expect(next[1]?.saved).toBe(true);
  });

  it("Explore and Saved resolve the same saved state via canonical key", () => {
    const explorePost = {
      id: "101",
      platform: "tiktok" as const,
      sourceId: "tt-99",
      saved: false,
    };
    const savedListPost = {
      id: "101",
      platform: "tiktok" as const,
      sourceId: "tt-99",
      saved: true,
    };
    expect(viralPostCanonicalKeyFromPost(explorePost)).toBe(
      viralPostCanonicalKeyFromPost(savedListPost)
    );
    const exploreView = applyViralPostSavedOverrides([explorePost], {
      [viralPostCanonicalKeyFromPost(explorePost)]: true,
    });
    expect(exploreView[0]?.saved).toBe(true);
  });

  it("preserves persisted saved=true without requiring overrides", () => {
    const posts = [
      {
        id: "5",
        platform: "instagram" as const,
        sourceId: "persisted",
        saved: true,
      },
    ];
    expect(applyViralPostSavedOverrides(posts, {})[0]?.saved).toBe(true);
  });

  it("normalizes blank/legacy platform to instagram", () => {
    expect(normalizeViralPostPlatform(null)).toBe("instagram");
    expect(normalizeViralPostPlatform("")).toBe("instagram");
    expect(normalizeViralPostPlatform("Instagram")).toBe("instagram");
    expect(viralPostCanonicalKey(null, "old-1")).toBe("instagram:old-1");
  });
});
