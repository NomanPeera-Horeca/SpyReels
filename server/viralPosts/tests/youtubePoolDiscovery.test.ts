import { describe, expect, it } from "vitest";
import {
  YOUTUBE_POOL_MAX_SEARCH_QUERIES,
  YOUTUBE_POOL_MIN_VIEWS,
  buildYouTubeShortsSearchQueries,
  extractYouTubeSearchShorts,
  parseYouTubeSearchShort,
  prequalifyYouTubeSearchShorts,
  youtubeSearchFilters,
} from "../youtubePoolDiscovery";

describe("YouTube Shorts pool discovery foundation", () => {
  it.each([
    ["Restaurants & Cafes", "restaurant marketing"],
    ["Health & Fitness", "Health & Fitness marketing"],
    ["Real Estate", "Real Estate operations"],
    ["Beauty", "Beauty marketing"],
    ["Personal Finance", "Personal Finance"],
  ])("builds search phrases from the actual niche and pillar for %s", (niche, pillar) => {
    const queries = buildYouTubeShortsSearchQueries({ niche, pillar });
    expect(queries.length).toBeGreaterThan(0);
    expect(queries.length).toBeLessThanOrEqual(YOUTUBE_POOL_MAX_SEARCH_QUERIES);
    expect(queries[0]).toBe(pillar);
    expect(queries.join(" ").toLowerCase()).toContain(niche.toLowerCase());
  });

  it("does not inject restaurant terms into a non-restaurant niche", () => {
    const queries = buildYouTubeShortsSearchQueries({
      niche: "Beauty",
      pillar: "Beauty marketing",
    });
    expect(queries.join(" ").toLowerCase()).not.toContain("restaurant");
    expect(queries.join(" ").toLowerCase()).not.toContain("hospitality");
  });

  it("parses a Shorts search result into the existing YouTube adapter shape", () => {
    const parsed = parseYouTubeSearchShort({
      type: "short",
      id: "abc123",
      url: "https://www.youtube.com/watch?v=abc123",
      title: "A strong hook",
      description: "Useful business tactic",
      thumbnail: "https://img.youtube.com/vi/abc123/maxresdefault.jpg",
      viewCountInt: 125000,
      likeCountInt: 7200,
      commentCountInt: 310,
      publishDate: "2026-09-10T12:00:00Z",
      channel: {
        title: "Creator Name",
        handle: "@creatorname",
      },
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.videoId).toBe("abc123");
    expect(parsed?.ownerHandle).toBe("creatorname");
    expect(parsed?.viewCount).toBe(125000);
    expect(parsed?.likeCount).toBe(7200);
    expect(parsed?.commentCount).toBe(310);
  });

  it("rejects normal YouTube videos when the provider labels them video", () => {
    expect(
      parseYouTubeSearchShort({
        type: "video",
        id: "long-video",
        publishDate: "2026-09-10T12:00:00Z",
      })
    ).toBeNull();
  });

  it("dedupes duplicate Shorts returned by multiple searches", () => {
    const rows = extractYouTubeSearchShorts({
      success: true,
      shorts: [
        {
          type: "short",
          id: "same",
          title: "First",
          publishDate: "2026-09-10T12:00:00Z",
          viewCountInt: 2000,
          channel: { handle: "@one" },
        },
        {
          type: "short",
          id: "same",
          title: "Duplicate",
          publishDate: "2026-09-10T12:00:00Z",
          viewCountInt: 3000,
          channel: { handle: "@one" },
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.videoId).toBe("same");
  });

  it("keeps a low but explicit viral floor before semantic/ranking stages", () => {
    const base = {
      videoId: "x",
      title: "x",
      description: "",
      likeCount: 10,
      commentCount: 1,
      thumbnailUrl: "",
      videoPageUrl: "https://www.youtube.com/shorts/x",
      durationSec: 30,
      postedAt: new Date("2026-09-10T12:00:00Z"),
      ownerHandle: "creator",
    };
    const rows = prequalifyYouTubeSearchShorts([
      { ...base, videoId: "below", viewCount: YOUTUBE_POOL_MIN_VIEWS - 1 },
      { ...base, videoId: "at", viewCount: YOUTUBE_POOL_MIN_VIEWS },
      { ...base, videoId: "above", viewCount: 100_000 },
    ]);
    expect(rows.map((row) => row.videoId)).toEqual(["at", "above"]);
  });
});

describe("youtubeSearchFilters", () => {
  it("never sends sortBy (the provider returns empty lists with it) and alternates all-time / this month", () => {
    expect(youtubeSearchFilters(0)).toEqual({ type: "shorts" });
    expect(youtubeSearchFilters(1)).toEqual({ type: "shorts", uploadDate: "this_month" });
    for (let i = 0; i < 6; i++) expect(youtubeSearchFilters(i)).not.toHaveProperty("sortBy");
  });
});
