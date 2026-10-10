import { beforeEach, describe, expect, it, vi } from "vitest";

const selectQueue: unknown[][] = [];

vi.mock("../db", () => ({
  getDb: async () => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => selectQueue.shift() ?? [],
          orderBy: () => ({
            limit: async () => selectQueue.shift() ?? [],
          }),
        }),
      }),
    }),
  }),
}));

vi.mock("../monitoring/alerts", () => ({
  alertOwnerThrottled: vi.fn(),
}));

describe("loadFeaturedDemoPublicPayload", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    vi.resetModules();
  });

  it("returns DB rows for an active allow-listed handle without scraping", async () => {
    selectQueue.push(
      [
        {
          id: 11,
          handle: "mrbeast",
          followerCount: 1_000_000,
          isActive: true,
        },
      ],
      [
        {
          externalId: "v1",
          caption: "Hook one",
          viewCount: 9_000_000,
          likeCount: 10,
          commentCount: 2,
          shareCount: 1,
          engagementRate: "1.20",
          thumbnailUrl: "https://r2.example/featured-demo-thumbs/tiktok/v1.webp",
          durationSec: 30,
          postedAt: new Date("2026-09-01T00:00:00.000Z"),
          videoPageUrl: "https://tiktok.com/@mrbeast/video/v1",
          rank: 1,
        },
      ]
    );

    const {
      loadFeaturedDemoPublicPayload,
      resetFeaturedDemoPublicDemoStatsForTests,
    } = await import("./publicDemo");
    resetFeaturedDemoPublicDemoStatsForTests();

    const payload = await loadFeaturedDemoPublicPayload("tiktok", "mrbeast");
    expect(payload?.handle).toBe("mrbeast");
    expect(payload?.videos).toHaveLength(1);
    expect(payload?.videos[0]?.thumbnailUrl).toContain("featured-demo-thumbs");
    expect(payload?.medianViewCount).toBe(9_000_000);
  });

  it("skips inactive handles and falls through to the next allow-listed handle", async () => {
    selectQueue.push([]); // charlidamelio account miss
    selectQueue.push(
      [
        {
          id: 22,
          handle: "khaby.lame",
          followerCount: 500,
          isActive: true,
        },
      ],
      [
        {
          externalId: "k1",
          caption: "Khaby",
          viewCount: 100,
          likeCount: 1,
          commentCount: 0,
          shareCount: 0,
          engagementRate: "0.20",
          thumbnailUrl: "https://r2.example/featured-demo-thumbs/tiktok/k1.webp",
          durationSec: 12,
          postedAt: new Date("2026-09-02T00:00:00.000Z"),
          videoPageUrl: "https://tiktok.com/@khaby.lame/video/k1",
          rank: 1,
        },
      ]
    );

    const {
      loadFeaturedDemoPublicPayload,
      resetFeaturedDemoPublicDemoStatsForTests,
    } = await import("./publicDemo");
    resetFeaturedDemoPublicDemoStatsForTests();

    const payload = await loadFeaturedDemoPublicPayload(
      "tiktok",
      "charlidamelio"
    );
    expect(payload?.handle).toBe("khaby.lame");
    expect(payload?.videos[0]?.id).toBe("k1");
  });
});
