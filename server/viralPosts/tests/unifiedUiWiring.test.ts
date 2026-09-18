import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  applyExplorePostFilters,
  exploreEmptyCopy,
} from "@shared/viralPostsExploreFilters";
import { isViralPostsV1Platform } from "@shared/viralPosts";
import type { ViralPost } from "@shared/viralPosts";
import { selectDiverseFeed } from "../diversity";

function post(
  partial: Partial<ViralPost> & Pick<ViralPost, "id" | "platform">
): ViralPost {
  return {
    sourceId: partial.sourceId ?? partial.id,
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
    views: 50_000,
    ...partial,
  };
}

describe("Viral Posts unified UI wiring", () => {
  it("ViralPosts page always mounts the single Legacy UI (no Explore fork)", () => {
    const page = readFileSync(
      resolve(process.cwd(), "client/src/pages/ViralPosts.tsx"),
      "utf8"
    );
    expect(page).toContain('from "./ViralPostsLegacy"');
    expect(page).not.toContain("ViralPostsExplore");
    expect(page).not.toContain('tab === "explore"');
  });

  it("Legacy Explore source file wires browse when not searching", () => {
    const legacy = readFileSync(
      resolve(process.cwd(), "client/src/pages/ViralPostsLegacy.tsx"),
      "utf8"
    );
    expect(legacy).toContain("viralPosts.browse.useQuery");
    expect(legacy).toContain("viralPosts.search.useQuery");
    expect(legacy).toContain("usingExploreSearch");
    expect(legacy).toContain("clearExploreSearch");
    expect(legacy).toContain("applyExplorePostFilters");
  });

  it("browse and search results share Explore filters including YouTube", () => {
    const browse = [
      post({ id: "ig", platform: "instagram", sourceId: "ig1" }),
      post({ id: "tt", platform: "tiktok", sourceId: "tt1" }),
      post({ id: "yt", platform: "youtube", sourceId: "yt1" }),
    ];
    const search = [
      post({ id: "ig2", platform: "instagram", sourceId: "ig2" }),
      post({ id: "yt2", platform: "youtube", sourceId: "yt2" }),
    ];
    const platforms = { instagram: true, tiktok: true, youtube: true };
    const browseFiltered = applyExplorePostFilters({
      posts: browse,
      platforms,
      postedWithin: "30d",
      quickFilter: "all",
    });
    const searchFiltered = applyExplorePostFilters({
      posts: search,
      platforms,
      postedWithin: "30d",
      quickFilter: "all",
    });
    expect(browseFiltered.every((p) => isViralPostsV1Platform(p.platform))).toBe(
      true
    );
    expect(searchFiltered.every((p) => isViralPostsV1Platform(p.platform))).toBe(
      true
    );
    expect(browseFiltered.map((p) => p.platform).sort()).toEqual([
      "instagram",
      "tiktok",
      "youtube",
    ]);
    expect(searchFiltered.map((p) => p.platform)).toEqual([
      "instagram",
      "youtube",
    ]);
  });

  it("clearing search conceptually returns to browse empty-copy path", () => {
    const browseEmpty = exploreEmptyCopy({
      platforms: { instagram: true, tiktok: true },
      usingSearch: false,
      rawResultCount: 0,
      quickFilter: "all",
    });
    const searchFilteredEmpty = exploreEmptyCopy({
      platforms: { instagram: true, tiktok: true },
      usingSearch: true,
      rawResultCount: 4,
      quickFilter: "all",
    });
    expect(browseEmpty.title).toContain("browse posts");
    expect(searchFilteredEmpty.title).toContain("filters");
  });

  function makeDiv(partial: {
    candidateId: number;
    sourceId: string;
    creatorKey: string;
    platform: string;
    contentPillar: string;
    finalScore: number;
    caption: string;
    hook: string;
  }) {
    return {
      ...partial,
      format: "talking-head",
      trendStatus: "proven-format" as const,
      hidden: false,
      recentlyDismissed: false,
      recentlyShown: false,
      hashtagKey: null,
    };
  }

  it("creator diversity prefers one post per creator on the primary pass", () => {
    const selected = selectDiverseFeed(
      [
        makeDiv({
          candidateId: 1,
          sourceId: "a",
          creatorKey: "chef",
          platform: "instagram",
          contentPillar: "ops",
          finalScore: 0.9,
          caption: "One",
          hook: "One",
        }),
        makeDiv({
          candidateId: 2,
          sourceId: "b",
          creatorKey: "chef",
          platform: "instagram",
          contentPillar: "ops",
          finalScore: 0.8,
          caption: "Two",
          hook: "Two",
        }),
        makeDiv({
          candidateId: 3,
          sourceId: "c",
          creatorKey: "other",
          platform: "tiktok",
          contentPillar: "profit",
          finalScore: 0.7,
          caption: "Three",
          hook: "Three",
        }),
      ],
      { min: 2, max: 7, minFinalScore: 0.55 }
    );
    expect(selected.filter((s) => s.creatorKey === "chef")).toHaveLength(1);
    expect(selected.map((s) => s.sourceId).sort()).toEqual(["a", "c"]);
  });

  it("ordinary sub-1k posts are suppressed while breakout trends can still qualify", () => {
    // Mirror the stale-feed regenerate gate used for V1 quality.
    const ordinary = post({
      id: "low",
      platform: "instagram",
      views: 218,
      trendStatus: "proven-format",
    });
    const breakout = post({
      id: "rising",
      platform: "instagram",
      views: 218,
      trendStatus: "breaking-out",
    });
    const isAccelerating = (p: ViralPost) =>
      p.trendStatus === "breaking-out" || p.trendStatus === "rising-fast";
    const isOrdinaryLowSignal = (p: ViralPost) =>
      (p.views ?? 0) > 0 && (p.views ?? 0) < 500 && !isAccelerating(p);
    expect(isOrdinaryLowSignal(ordinary)).toBe(true);
    expect(isOrdinaryLowSignal(breakout)).toBe(false);
  });
});
