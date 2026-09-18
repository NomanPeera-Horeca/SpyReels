import { describe, expect, it } from "vitest";
import type { ViralPost } from "./viralPosts";
import {
  applyExplorePostFilters,
  exploreEmptyCopy,
  resolveExplorePostAgeHours,
} from "./viralPostsExploreFilters";

function post(
  partial: Partial<ViralPost> & Pick<ViralPost, "id" | "platform">
): ViralPost {
  return {
    sourceId: partial.id,
    creatorName: "Creator",
    sourceUrl: "https://example.com",
    relevanceLabel: "Relevant",
    relevanceReason: "Test",
    trendStatus: "proven-format",
    saved: false,
    dismissed: false,
    remade: false,
    ageHours: 12,
    publishedAt: "2026-09-07T00:00:00.000Z",
    ...partial,
  };
}

const nowMs = Date.parse("2026-09-07T12:00:00.000Z");

describe("applyExplorePostFilters", () => {
  const basePlatforms = { instagram: true, tiktok: true, youtube: false };

  it("keeps Instagram-only", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "1", platform: "instagram" }),
        post({ id: "2", platform: "tiktok" }),
      ],
      platforms: { ...basePlatforms, tiktok: false },
      postedWithin: "30d",
      quickFilter: "all",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["1"]);
  });

  it("keeps TikTok-only", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "1", platform: "instagram" }),
        post({ id: "2", platform: "tiktok" }),
      ],
      platforms: { ...basePlatforms, instagram: false },
      postedWithin: "30d",
      quickFilter: "all",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["2"]);
  });

  it("keeps both when both platforms selected", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "1", platform: "instagram" }),
        post({ id: "2", platform: "tiktok" }),
      ],
      platforms: basePlatforms,
      postedWithin: "30d",
      quickFilter: "all",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["1", "2"]);
  });

  it("returns zero when neither platform is selected", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "1", platform: "instagram" }),
        post({ id: "2", platform: "tiktok" }),
      ],
      platforms: { instagram: false, tiktok: false, youtube: false },
      postedWithin: "30d",
      quickFilter: "all",
      nowMs,
    });
    expect(items).toEqual([]);
  });

  it("surfaces YouTube rows only when the YouTube filter is enabled", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "yt", platform: "youtube", ageHours: 1 }),
        post({ id: "ig", platform: "instagram", ageHours: 1 }),
      ],
      platforms: { instagram: true, tiktok: true, youtube: true },
      postedWithin: "30d",
      quickFilter: "all",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["yt", "ig"]);
    const disabled = applyExplorePostFilters({
      posts: items,
      platforms: { instagram: true, tiktok: true, youtube: false },
      postedWithin: "30d",
      quickFilter: "all",
      nowMs,
    });
    expect(disabled.map((p) => p.id)).toEqual(["ig"]);
  });

  it("respects 24h date boundary", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "in", platform: "instagram", ageHours: 24 }),
        post({ id: "out", platform: "instagram", ageHours: 24.01 }),
      ],
      platforms: basePlatforms,
      postedWithin: "24h",
      quickFilter: "all",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["in"]);
  });

  it("respects 7d date boundary", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "in", platform: "instagram", ageHours: 168 }),
        post({ id: "out", platform: "instagram", ageHours: 169 }),
      ],
      platforms: basePlatforms,
      postedWithin: "7d",
      quickFilter: "all",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["in"]);
  });

  it("respects 30d date boundary", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "in", platform: "instagram", ageHours: 720 }),
        post({ id: "out", platform: "instagram", ageHours: 721 }),
      ],
      platforms: basePlatforms,
      postedWithin: "30d",
      quickFilter: "all",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["in"]);
  });

  it("excludes posts with missing usable publication age", () => {
    expect(resolveExplorePostAgeHours({ ageHours: null, publishedAt: null })).toBe(
      null
    );
    const items = applyExplorePostFilters({
      posts: [
        post({
          id: "missing",
          platform: "instagram",
          ageHours: null,
          publishedAt: null,
        }),
        post({ id: "ok", platform: "instagram", ageHours: 5 }),
      ],
      platforms: basePlatforms,
      postedWithin: "7d",
      quickFilter: "all",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["ok"]);
  });

  it("rising includes breaking-out and rising-fast", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "a", platform: "instagram", trendStatus: "breaking-out" }),
        post({ id: "b", platform: "instagram", trendStatus: "rising-fast" }),
        post({ id: "c", platform: "instagram", trendStatus: "proven-format" }),
        post({ id: "d", platform: "instagram", trendStatus: "unknown" }),
      ],
      platforms: basePlatforms,
      postedWithin: "30d",
      quickFilter: "rising",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["a", "b"]);
  });

  it("proven only keeps proven-format", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "a", platform: "instagram", trendStatus: "proven-format" }),
        post({ id: "b", platform: "instagram", trendStatus: "rising-fast" }),
      ],
      platforms: basePlatforms,
      postedWithin: "30d",
      quickFilter: "proven",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["a"]);
  });

  it("all does not momentum-filter", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "a", platform: "instagram", trendStatus: "breaking-out" }),
        post({ id: "b", platform: "instagram", trendStatus: "proven-format" }),
        post({ id: "c", platform: "instagram", trendStatus: "unknown" }),
      ],
      platforms: basePlatforms,
      postedWithin: "30d",
      quickFilter: "all",
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("excludes hidden creators", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({
          id: "1",
          platform: "instagram",
          creatorHandle: "@HiddenChef",
        }),
        post({ id: "2", platform: "instagram", creatorHandle: "@ok" }),
      ],
      platforms: basePlatforms,
      postedWithin: "30d",
      quickFilter: "all",
      hiddenCreatorKeys: ["hiddenchef"],
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["2"]);
  });

  it("excludes dismissed posts", () => {
    const items = applyExplorePostFilters({
      posts: [
        post({ id: "gone", platform: "instagram" }),
        post({ id: "keep", platform: "instagram" }),
      ],
      platforms: basePlatforms,
      postedWithin: "30d",
      quickFilter: "all",
      dismissedPostIds: ["gone"],
      nowMs,
    });
    expect(items.map((p) => p.id)).toEqual(["keep"]);
  });

  it("applies saved overrides", () => {
    const items = applyExplorePostFilters({
      posts: [post({ id: "1", platform: "instagram", saved: false })],
      platforms: basePlatforms,
      postedWithin: "30d",
      quickFilter: "all",
      savedOverrides: { "1": true },
      nowMs,
    });
    expect(items[0]?.saved).toBe(true);
  });

  it("empty copy is truthful when no platform is selected", () => {
    expect(
      exploreEmptyCopy({
        platforms: { instagram: false, tiktok: false },
        usingSearch: false,
        rawResultCount: 10,
        quickFilter: "all",
      }).description
    ).toBe("Select Instagram or TikTok to see posts.");
  });
});
