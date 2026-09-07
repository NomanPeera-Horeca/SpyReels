import { describe, expect, it } from "vitest";
import {
  selectFeaturedTransferableRows,
  type FeaturedSupplyRow,
} from "../featuredSupply";

function row(
  id: number,
  overrides: Partial<FeaturedSupplyRow> = {}
): FeaturedSupplyRow {
  return {
    featuredReelId: id,
    reelShortcode: `reel-${id}`,
    caption: "A practical business lesson every owner should know.",
    viewCount: 250_000,
    likeCount: 12_000,
    commentCount: 400,
    thumbnailUrl: `https://example.com/${id}.jpg`,
    videoUrl: `https://example.com/${id}.mp4`,
    postedAt: new Date("2026-08-20T12:00:00Z"),
    rank: id,
    transcript: null,
    remakeabilityScore: 82,
    suggestedAction: "make_version",
    classificationReason: "Simple solo creator format",
    viralFlag: true,
    productionFormat: "talking_head",
    contentType: "educational",
    hookPattern: "direct_promise",
    handle: `creator${id}`,
    displayName: `Creator ${id}`,
    followerCount: 50_000,
    profilePicUrl: null,
    ...overrides,
  };
}

describe("Featured transferable Viral Posts supply", () => {
  it("mixes direct pillar matches with strong cross-niche remakeable formats", () => {
    const direct = row(1, {
      caption: "3 restaurant pricing mistakes destroying your menu margin and profit.",
      handle: "restaurantowner",
    });
    const adjacentCarLesson = row(2, {
      caption: "I learned this pricing lesson after undercharging customers for years.",
      handle: "carbusinesscoach",
      remakeabilityScore: 91,
      productionFormat: "talking_head",
    });
    const anotherDirect = row(3, {
      caption: "Restaurant food cost is quietly killing your profit margin.",
      handle: "foodcostcoach",
    });

    const selected = selectFeaturedTransferableRows({
      rows: [direct, adjacentCarLesson, anotherDirect],
      pillar: "restaurant profitability",
      limit: 3,
    });

    expect(selected.map((r) => r.featuredReelId)).toContain(direct.featuredReelId);
    expect(selected.map((r) => r.featuredReelId)).toContain(adjacentCarLesson.featuredReelId);
  });

  it("rejects production-heavy spectacle even when viral and highly remakeable", () => {
    const jetSpectacle = row(10, {
      caption: "The wildest private jet reveal you will see today.",
      productionFormat: "music_dance",
      remakeabilityScore: 95,
      viralFlag: true,
    });
    const simpleLesson = row(11, {
      caption: "3 pricing mistakes I made as a small business owner.",
      productionFormat: "talking_head",
    });

    const selected = selectFeaturedTransferableRows({
      rows: [jetSpectacle, simpleLesson],
      pillar: "restaurant profitability",
      limit: 2,
    });

    expect(selected.map((r) => r.featuredReelId)).not.toContain(jetSpectacle.featuredReelId);
    expect(selected.map((r) => r.featuredReelId)).toContain(simpleLesson.featuredReelId);
  });

  it("rejects weak unproven rows and caps one creator at two selections", () => {
    const weak = row(20, {
      viewCount: 3_000,
      followerCount: 100_000,
      viralFlag: false,
      remakeabilityScore: 55,
      suggestedAction: "view_only",
    });
    const sameCreator = [21, 22, 23, 24].map((id) =>
      row(id, {
        handle: "samecreator",
        caption: `${id} pricing mistakes business owners should stop making.`,
      })
    );
    const otherCreator = row(25, {
      handle: "differentcreator",
      caption: "How to fix a pricing mistake without losing customers.",
    });

    const selected = selectFeaturedTransferableRows({
      rows: [weak, ...sameCreator, otherCreator],
      pillar: "restaurant profitability",
      limit: 5,
    });

    expect(selected.map((r) => r.featuredReelId)).not.toContain(weak.featuredReelId);
    expect(selected.filter((r) => r.handle === "samecreator")).toHaveLength(2);
    expect(selected.map((r) => r.featuredReelId)).toContain(otherCreator.featuredReelId);
  });
});
