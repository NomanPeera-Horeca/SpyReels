import { describe, expect, it } from "vitest";
import {
  selectBestSimilarFeaturedReels,
  selectRelatedFeaturedCreators,
  type SimilarFeaturedCreator,
  type SimilarFeaturedReelSupply,
} from "../similarCreatorSupply";

function creator(
  id: number,
  handle: string,
  nicheSlug: string,
  followerCount: number
): SimilarFeaturedCreator {
  return {
    id,
    handle,
    displayName: handle,
    followerCount,
    profilePicUrl: null,
    nicheSlug,
    nicheName: nicheSlug,
  };
}

function reel(
  id: number,
  creatorRow: SimilarFeaturedCreator,
  overrides: Partial<SimilarFeaturedReelSupply> = {}
): SimilarFeaturedReelSupply {
  return {
    featuredReelId: id,
    featuredAccountId: creatorRow.id,
    sourceId: `reel-${id}`,
    sourceUrl: `https://www.instagram.com/reel/reel-${id}/`,
    creatorHandle: creatorRow.handle,
    creatorName: creatorRow.displayName,
    creatorAvatarUrl: null,
    creatorFollowers: creatorRow.followerCount,
    thumbnailUrl: null,
    videoUrl: null,
    caption: `Useful reel ${id}`,
    publishedAt: new Date("2026-09-01T00:00:00Z"),
    views: 100_000,
    likes: 5_000,
    comments: 200,
    nicheSlug: creatorRow.nicheSlug,
    nicheName: creatorRow.nicheName,
    viralFlag: false,
    remakeabilityScore: 60,
    suggestedAction: "save_inspiration",
    rank: id,
    ...overrides,
  };
}

describe("similar creator Featured supply", () => {
  it("excludes known creators and round-robins across niches", () => {
    const rows = [
      creator(1, "known", "restaurants", 1_000_000),
      creator(2, "restaurant-a", "restaurants", 900_000),
      creator(3, "restaurant-b", "restaurants", 800_000),
      creator(4, "business-a", "business", 700_000),
      creator(5, "business-b", "business", 600_000),
    ];

    const selected = selectRelatedFeaturedCreators(rows, {
      excludeHandles: ["@known"],
      limit: 4,
    });

    expect(selected.map((row) => row.handle)).toEqual([
      "restaurant-a",
      "business-a",
      "restaurant-b",
      "business-b",
    ]);
  });

  it("prefers remakeable viral Featured reels over raw catalog rank", () => {
    const c = creator(10, "operator", "restaurants", 100_000);
    const rankOneButWeak = reel(1, c, {
      rank: 1,
      views: 1_000_000,
      remakeabilityScore: 50,
      suggestedAction: "save_inspiration",
      viralFlag: false,
    });
    const remakeWinner = reel(2, c, {
      rank: 8,
      views: 300_000,
      remakeabilityScore: 90,
      suggestedAction: "make_version",
      viralFlag: true,
    });

    const selected = selectBestSimilarFeaturedReels(
      [rankOneButWeak, remakeWinner],
      [c],
      { maxPerCreator: 1, limit: 1 }
    );

    expect(selected[0]?.featuredReelId).toBe(2);
  });

  it("drops view-only and very low-remakeability reels and caps creator repetition", () => {
    const a = creator(20, "a", "restaurants", 100_000);
    const b = creator(21, "b", "restaurants", 90_000);
    const rows = [
      reel(1, a, { suggestedAction: "view_only", remakeabilityScore: 95 }),
      reel(2, a, { remakeabilityScore: 20 }),
      reel(3, a, { remakeabilityScore: 90, suggestedAction: "make_version" }),
      reel(4, a, { remakeabilityScore: 85, suggestedAction: "make_version" }),
      reel(5, a, { remakeabilityScore: 80, suggestedAction: "make_version" }),
      reel(6, b, { remakeabilityScore: 75, viralFlag: true }),
    ];

    const selected = selectBestSimilarFeaturedReels(rows, [a, b], {
      maxPerCreator: 2,
      limit: 6,
    });

    expect(selected.some((row) => row.featuredReelId === 1)).toBe(false);
    expect(selected.some((row) => row.featuredReelId === 2)).toBe(false);
    expect(selected.filter((row) => row.featuredAccountId === a.id)).toHaveLength(2);
    expect(selected.some((row) => row.featuredAccountId === b.id)).toBe(true);
  });
});
