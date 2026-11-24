import { describe, expect, it } from "vitest";
import { creatorKeyOf, groupLibraryCreators, libraryPoolForExploreNiche, MIN_LIBRARY_VIDEOS } from "./exploreCreators";

const v = (id: number, platform: string, handle: string | null, views = 100, followers: number | null = 1000, avatar: string | null = null) => ({
  id,
  platform,
  creatorHandle: handle,
  creatorId: null,
  creatorName: handle ? handle.toUpperCase() : "x",
  creatorAvatarUrl: avatar,
  creatorFollowers: followers,
  views,
});

describe("Explore niche -> library pool", () => {
  it("restaurant niches read the restaurant pillars of the business pool", () => {
    expect(libraryPoolForExploreNiche("Restaurants & cafés")).toMatchObject({ niche: "Business & Entrepreneurship" });
    expect(libraryPoolForExploreNiche("Restaurants & cafés")?.pillars?.length).toBeGreaterThan(0);
  });
  it("known niches map to their pool; unknown niches get none (no unrelated Business videos)", () => {
    expect(libraryPoolForExploreNiche("Fitness")).toEqual({ niche: "Health & Fitness", pillars: null });
    expect(libraryPoolForExploreNiche("Skincare & beauty")?.niche).toBe("Beauty");
    expect(libraryPoolForExploreNiche("Gaming")).toBeNull();
    expect(libraryPoolForExploreNiche("")).toBeNull();
  });
});

describe("grouping library videos by creator", () => {
  it(`keeps creators with at least ${MIN_LIBRARY_VIDEOS} videos, most videos first`, () => {
    const out = groupLibraryCreators(
      [v(1, "tiktok", "@Taco"), v(2, "tiktok", "taco", 900), v(3, "tiktok", "taco"), v(4, "tiktok", "solo"), v(5, "tiktok", "pair"), v(6, "tiktok", "pair")],
      "tiktok"
    );
    expect(out.map(c => [c.handle, c.videoCount])).toEqual([
      ["Taco", 3],
      ["pair", 2],
    ]);
    expect(out[0]).toMatchObject({ key: "tiktok:taco", bestViews: 900 });
  });
  it("ignores other platforms, blank handles and counts each video once", () => {
    const out = groupLibraryCreators([v(1, "youtube", "a"), v(1, "youtube", "a"), v(2, "tiktok", "a"), v(3, "youtube", null)], "youtube");
    expect(out).toEqual([]);
  });
  it("ties break by followers, and a row with an avatar is preferred", () => {
    const out = groupLibraryCreators(
      [v(1, "tiktok", "a", 1, 10), v(2, "tiktok", "a", 1, 10), v(3, "tiktok", "b", 1, 500), v(4, "tiktok", "b", 1, 500, "pic.jpg")],
      "tiktok"
    );
    expect(out.map(c => c.handle)).toEqual(["b", "a"]);
    expect(out[0].profilePicUrl).toBe("pic.jpg");
  });
  it("creator key is lower-case without @", () => {
    expect(creatorKeyOf({ creatorHandle: " @Chef ", creatorId: null })).toBe("chef");
    expect(creatorKeyOf({ creatorHandle: null, creatorId: "UC123" })).toBe("uc123");
  });
});
