import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveInstagramIdentity: vi.fn(),
  searchReelsByHandle: vi.fn(),
  checkUsageLimit: vi.fn(),
  incrementUsage: vi.fn(),
  decrementUsage: vi.fn(),
}));

vi.mock("../../instagram", () => {
  class InstagramHandleNotFoundError extends Error {}
  class InstagramPrivateAccountError extends Error {}
  class InstagramProviderError extends Error {}
  class InstagramRestrictedMediaError extends Error {}
  return {
    InstagramHandleNotFoundError,
    InstagramPrivateAccountError,
    InstagramProviderError,
    InstagramRestrictedMediaError,
    resolveInstagramIdentity: mocks.resolveInstagramIdentity,
    searchReelsByHandle: mocks.searchReelsByHandle,
  };
});

vi.mock("../../stripe/stripe-service", () => ({
  checkUsageLimit: mocks.checkUsageLimit,
  incrementUsage: mocks.incrementUsage,
  decrementUsage: mocks.decrementUsage,
}));

import {
  findTopContent,
  sortTopContentDeterministically,
} from "./creatorResearch";

function reel(input: {
  shortcode: string;
  views: number;
  engagement: number;
  postedAt: string;
}) {
  return {
    shortcode: input.shortcode,
    reelUrl: `https://instagram.com/reel/${input.shortcode}`,
    caption: input.shortcode,
    viewCount: input.views,
    likeCount: 10,
    commentCount: 2,
    engagementRate: input.engagement,
    duration: 30,
    postedAt: new Date(input.postedAt),
    thumbnailUrl: "https://example.com/thumb.jpg",
    videoUrl: "",
    ownerUsername: "creator",
    ownerFullName: "Creator",
    ownerProfilePicUrl: "",
    ownerFollowerCount: 1000,
  };
}

const profile = {
  userId: "123",
  username: "creator",
  isPrivate: false,
  followerCount: 1000,
  fullName: "Creator",
  biography: "bio",
  profilePicUrl: "",
  postCount: 100,
  followingCount: 50,
  isVerified: true,
  category: "Creator",
  externalUrl: "",
};

const actor = {
  userId: 99,
  openId: "open-99",
  email: "creator@example.com",
  role: "user",
};

describe("AI Gateway creator research", () => {
  beforeEach(() => {
    mocks.resolveInstagramIdentity.mockReset();
    mocks.searchReelsByHandle.mockReset();
    mocks.checkUsageLimit.mockReset();
    mocks.incrementUsage.mockReset();
    mocks.decrementUsage.mockReset();
    mocks.checkUsageLimit.mockResolvedValue({ allowed: true, used: 0, limit: 20 });
    mocks.incrementUsage.mockResolvedValue(undefined);
    mocks.decrementUsage.mockResolvedValue(undefined);
  });

  it("sorts ties deterministically by metric, recency, then shortcode", () => {
    const rows = [
      reel({ shortcode: "c", views: 100, engagement: 2, postedAt: "2026-09-01T00:00:00Z" }),
      reel({ shortcode: "a", views: 100, engagement: 2, postedAt: "2026-09-02T00:00:00Z" }),
      reel({ shortcode: "b", views: 100, engagement: 2, postedAt: "2026-09-02T00:00:00Z" }),
      reel({ shortcode: "z", views: 90, engagement: 9, postedAt: "2026-09-03T00:00:00Z" }),
    ];

    expect(sortTopContentDeterministically(rows, "views").map((row) => row.shortcode)).toEqual([
      "a",
      "b",
      "c",
      "z",
    ]);
  });

  it("returns honest bounded-sample metadata and caps the provider sample for latency", async () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      reel({
        shortcode: `r${index}`,
        views: 1000 - index,
        engagement: 1 + index / 10,
        postedAt: `2026-09-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    mocks.searchReelsByHandle.mockResolvedValue({ reels: rows, profile });

    const result = await findTopContent({
      actor,
      handle: "creator",
      limit: 5,
      rankBy: "views",
    });

    expect(mocks.searchReelsByHandle).toHaveBeenCalledWith("creator", 10);
    expect(result.sampleSize).toBe(10);
    expect(result.sample).toEqual(
      expect.objectContaining({
        policy: "bounded_provider_sample",
        requested: 10,
        analyzed: 10,
        cacheHit: false,
        oldestPostedAt: "2026-09-01T00:00:00.000Z",
        newestPostedAt: "2026-09-10T00:00:00.000Z",
      })
    );
    expect(result.sample.statement).toContain("not an all-time ranking");
    expect(result.content).toHaveLength(5);
  });

  it("reuses a successful sample briefly instead of repeatedly calling the provider", async () => {
    const rows = Array.from({ length: 10 }, (_, index) =>
      reel({
        shortcode: `cache${index}`,
        views: 1000 - index,
        engagement: index,
        postedAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00Z`,
      })
    );
    mocks.searchReelsByHandle.mockResolvedValue({ reels: rows, profile: { ...profile, username: "cache-test" } });

    const first = await findTopContent({ actor, handle: "cache-test", limit: 5, rankBy: "views" });
    const second = await findTopContent({ actor, handle: "cache-test", limit: 5, rankBy: "engagement" });

    expect(mocks.searchReelsByHandle).toHaveBeenCalledTimes(1);
    expect(first.sample.cacheHit).toBe(false);
    expect(second.sample.cacheHit).toBe(true);
  });
});
