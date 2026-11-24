import { describe, expect, it } from "vitest";
import {
  collectedLibrarySort,
  collectedRowSortFields,
  mergedOrder,
  savedItemSortFields,
  savedLibrarySort,
  savedTabFromSearch,
} from "./savedLibrary";
import { shortLink } from "./SavedV2";

const day = (n: number) => new Date(Date.UTC(2026, 10, n));

const saved = (id: number, created: Date, views: number, likes = 0, comments = 0, followers = 1000) =>
  savedItemSortFields({
    id,
    createdAt: created,
    source: "scraped",
    reel: { viewCount: views, likeCount: likes, commentCount: comments },
    job: { followerCount: followers },
  });

describe("sort fields", () => {
  it("starred videos: engagement is (likes + comments) / followers, none for discover", () => {
    expect(saved(1, day(1), 500, 40, 10, 1000)).toMatchObject({ key: "s:1", views: 500, likes: 40, engagement: 5 });
    expect(
      savedItemSortFields({
        id: 2,
        createdAt: day(1),
        source: "discover",
        reel: { viewCount: 9, likeCount: 9, commentCount: 9 },
        job: { followerCount: 10 },
      }).engagement
    ).toBe(0);
  });

  it("link videos: prefer the re-checked views and followers", () => {
    const f = collectedRowSortFields({
      id: 7,
      createdAt: day(2),
      viewCount: 100,
      monitoredViewCount: 250,
      likeCount: 20,
      commentCount: 5,
      monitoredFollowerCount: 500,
      ownerFollowerCount: 9999,
    });
    expect(f).toMatchObject({ key: "c:7", views: 250, likes: 20, engagement: 5 });
    expect(collectedRowSortFields({ id: 8, createdAt: day(2), viewCount: 100, monitoredViewCount: 0 }).views).toBe(100);
  });
});

describe("one order for both lists", () => {
  const link = collectedRowSortFields({ id: 1, createdAt: day(3), viewCount: 50 });
  const a = saved(1, day(1), 900);
  const b = saved(2, day(5), 10);

  it("newest first mixes starred and link videos by when they were added", () => {
    const o = mergedOrder([a, link, b], "newest");
    expect([...o.entries()].sort((x, y) => x[1] - y[1]).map(([k]) => k)).toEqual(["s:2", "c:1", "s:1"]);
  });

  it("most views across both lists", () => {
    const o = mergedOrder([a, link, b], "views");
    expect(o.get("s:1")).toBe(0);
    expect(o.get("c:1")).toBe(1);
    expect(o.get("s:2")).toBe(2);
  });

  it("ties fall back to newest", () => {
    const o = mergedOrder([saved(1, day(1), 5), saved(2, day(2), 5)], "views");
    expect(o.get("s:2")).toBe(0);
  });
});

describe("helpers", () => {
  it("reads the tab from the address", () => {
    expect(savedTabFromSearch("?tab=links&add=1")).toBe("links");
    expect(savedTabFromSearch("?tab=starred")).toBe("starred");
    expect(savedTabFromSearch("?tab=nope")).toBe("all");
    expect(savedTabFromSearch("")).toBe("all");
  });

  it("maps the page sort to each library's sort", () => {
    expect(savedLibrarySort("newest")).toBe("date");
    expect(savedLibrarySort("views")).toBe("views");
    expect(collectedLibrarySort("newest")).toBe("added_newest");
    expect(collectedLibrarySort("engagement")).toBe("engagement");
  });

  it("shortens links for the adding and failed rows", () => {
    expect(shortLink("https://www.instagram.com/reel/C9xK2/")).toBe("instagram.com/reel/C9xK2");
    expect(shortLink("")).toBe("your link");
    expect(shortLink("https://example.com/" + "a".repeat(60)).endsWith("…")).toBe(true);
  });
});
