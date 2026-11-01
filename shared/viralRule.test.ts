import { describe, expect, it } from "vitest";
import { classifyVirality, nextViralRecheckAt, usualViewsFromRecent } from "./viralRule";

const NOW = new Date("2026-11-01T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("usualViewsFromRecent", () => {
  it("uses the median of the 12 most recent videos", () => {
    const videos = [
      ...Array.from({ length: 12 }, (_, i) => ({ views: 1_000 + i, postedAt: daysAgo(i) })),
      { views: 9_999_999, postedAt: daysAgo(100) }, // older than the 12, ignored
    ];
    expect(usualViewsFromRecent(videos)).toEqual({ usualViews: 1_006, sampleSize: 12 });
  });

  it("needs at least 3 videos with views", () => {
    expect(usualViewsFromRecent([{ views: 5_000 }, { views: 0 }, { views: null }])).toBeNull();
  });
});

describe("classifyVirality: main rule, creator's usual views", () => {
  it("is viral at 5x usual views and 10,000+ views, the same on every platform", () => {
    for (const platform of ["instagram", "tiktok", "youtube"]) {
      expect(classifyVirality({ platform, views: 50_000, usualViews: 10_000, now: NOW })).toEqual({
        status: "viral",
        basis: "usual_views",
        multiple: 5,
      });
    }
  });

  it("is not viral below 5x, even with huge views", () => {
    expect(classifyVirality({ platform: "tiktok", views: 400_000, usualViews: 100_000 }).status).toBe(
      "not_viral"
    );
  });

  it("is not viral under 10,000 views, even at a big multiple", () => {
    expect(classifyVirality({ platform: "instagram", views: 9_000, usualViews: 100 }).status).toBe(
      "not_viral"
    );
  });

  it("prefers usual views over followers when both are known", () => {
    const v = classifyVirality({ platform: "tiktok", views: 30_000, usualViews: 20_000, followers: 1_000 });
    expect(v).toMatchObject({ status: "not_viral", basis: "usual_views" });
  });
});

describe("classifyVirality: fallback on followers", () => {
  it("uses 3x for Instagram and 5x for TikTok and YouTube", () => {
    expect(classifyVirality({ platform: "instagram", views: 30_000, followers: 10_000 }).status).toBe("viral");
    expect(classifyVirality({ platform: "tiktok", views: 30_000, followers: 10_000 }).status).toBe("not_viral");
    expect(classifyVirality({ platform: "youtube", views: 30_000, followers: 10_000 }).status).toBe("not_viral");
    expect(classifyVirality({ platform: "youtube", views: 50_000, followers: 10_000 })).toMatchObject({
      status: "viral",
      basis: "followers",
    });
  });

  it("is unknown without views or any baseline", () => {
    expect(classifyVirality({ platform: "instagram", views: 50_000 }).status).toBe("unknown");
    expect(classifyVirality({ platform: "instagram", views: null, followers: 10 }).status).toBe("unknown");
    expect(classifyVirality({ platform: "facebook", views: 50_000, followers: 10 }).status).toBe("unknown");
  });
});

describe("classifyVirality: rising", () => {
  it("marks a young video at 2x usual views as rising", () => {
    expect(
      classifyVirality({ platform: "tiktok", views: 4_000, usualViews: 2_000, publishedAt: daysAgo(1), now: NOW })
    ).toMatchObject({ status: "rising", multiple: 2 });
  });

  it("does not call an old video rising", () => {
    expect(
      classifyVirality({ platform: "tiktok", views: 4_000, usualViews: 2_000, publishedAt: daysAgo(10), now: NOW })
        .status
    ).toBe("not_viral");
  });

  it("needs 2,000+ views to be rising", () => {
    expect(
      classifyVirality({ platform: "instagram", views: 1_500, usualViews: 300, publishedAt: daysAgo(1), now: NOW })
        .status
    ).toBe("not_viral");
  });
});

describe("nextViralRecheckAt", () => {
  it("re-checks rising videos on day 1, 3, 7 and 14, then stops", () => {
    const published = new Date(NOW.getTime() - 30 * 3_600_000); // 30 hours old
    expect(nextViralRecheckAt({ status: "rising", publishedAt: published, now: NOW })?.getTime()).toBe(
      published.getTime() + 72 * 3_600_000
    );
    expect(nextViralRecheckAt({ status: "rising", publishedAt: daysAgo(15), now: NOW })).toBeNull();
    expect(nextViralRecheckAt({ status: "viral", publishedAt: published, now: NOW })).toBeNull();
  });
});
