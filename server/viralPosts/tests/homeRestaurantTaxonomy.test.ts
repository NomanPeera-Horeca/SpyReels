import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  findExistingPools: vi.fn(async () => [] as unknown[]),
  listPoolsForNiche: vi.fn(async () => [] as unknown[]),
}));

vi.mock("../featureFlag", async importOriginal => ({
  ...(await importOriginal<typeof import("../featureFlag")>()),
  isViralPostsLive: true,
  isViralPostsInstagramEnabled: true,
  isViralPostsTiktokEnabled: true,
  isViralPostsYoutubeEnabled: true,
  isAnyViralPostsPlatformEnabled: true,
}));
vi.mock("../poolRepository", async importOriginal => ({
  ...(await importOriginal<typeof import("../poolRepository")>()),
  findExistingPools: repo.findExistingPools,
  listPoolsForNiche: repo.listPoolsForNiche,
}));

import { browseIndexedViralPosts } from "../browseService";

const restaurantOwner = {
  userId: 1,
  description: "Restaurant Business Growth Strategies",
  pillars: ["Menu Strategy", "Restaurant Systems Building", "Restaurant Business Mindset"],
  goalText: "Teach restaurant owners no-BS strategies to grow a profitable, well-run business.",
  audienceText: "Restaurant owners",
  matchMode: "taxonomy" as const,
  categoryLabel: "Business",
  specificNiche: "Restaurant Business Growth Strategies",
  limit: 4,
  creatorLimit: 3,
  recentDays: 90,
};

describe("Home taxonomy read for restaurant businesses", () => {
  beforeEach(() => {
    repo.findExistingPools.mockClear();
    repo.listPoolsForNiche.mockClear();
  });

  it("reads the restaurant pools for a Business category with a restaurant-operations niche", async () => {
    const res = await browseIndexedViralPosts(restaurantOwner);
    expect(res.niche).toBe("Business & Entrepreneurship");
    const specs = repo.findExistingPools.mock.calls[0]?.[0] as Array<{ niche: string; pillar: string }>;
    expect(specs.length).toBeGreaterThan(0);
    expect(specs.every(spec => spec.niche === "Business & Entrepreneurship")).toBe(true);
    expect(specs.map(spec => spec.pillar)).toContain("restaurant profitability");
  });

  it("still returns nothing for a generic Business niche", async () => {
    const res = await browseIndexedViralPosts({
      ...restaurantOwner,
      description: "Personal branding for founders",
      specificNiche: "Personal branding for founders",
    });
    expect(res).toMatchObject({ items: [], creators: [], niche: "" });
    expect(repo.findExistingPools).not.toHaveBeenCalled();
  });
});
