import { describe, expect, it } from "vitest";
import type { AnalysisSourceSnapshot, NormalizedPost } from "./model";
import { BEST_POST_MIN_POSTS, pickBestPost } from "./bestPost";

const post = (i: number, over: Partial<NormalizedPost> = {}): NormalizedPost => ({
  postId: `p${i}`,
  url: `https://example.com/p${i}`,
  publishedAt: `2026-09-${String(10 + (i % 18)).padStart(2, "0")}T00:00:00Z`,
  views: 1000 + i,
  likes: null,
  comments: null,
  durationSec: 20,
  caption: `Caption ${i}`,
  thumbnailUrl: `https://cdn.example.com/p${i}.jpg`,
  ...over,
});

const snap = (posts: NormalizedPost[], followerCount: number | null = 1000): AnalysisSourceSnapshot => ({
  version: 1,
  platform: "instagram",
  handle: "sample",
  followerCount,
  windowStart: "2026-04-01T00:00:00Z",
  windowEnd: "2026-10-01T00:00:00Z",
  posts,
});

const ten = (over: (i: number) => Partial<NormalizedPost> = () => ({})) =>
  Array.from({ length: BEST_POST_MIN_POSTS }, (_, i) => post(i, over(i)));

describe("pickBestPost", () => {
  it("returns null with fewer than 10 posts or no snapshot", () => {
    expect(pickBestPost(null)).toBeNull();
    expect(pickBestPost(snap(ten().slice(0, 9)))).toBeNull();
  });

  it("picks the most-viewed post and computes the real follower multiple", () => {
    const posts = ten();
    posts[4] = post(4, { views: 24_000, caption: "\n  3 mistakes that kill new restaurants\nmore" });
    const best = pickBestPost(snap(posts, 1000))!;
    expect(best).toMatchObject({
      postId: "p4",
      views: 24_000,
      followerMultiple: 24,
      title: "3 mistakes that kill new restaurants",
      thumbnailUrl: "https://cdn.example.com/p4.jpg",
    });
  });

  it("never invents a multiple when followers are unknown", () => {
    expect(pickBestPost(snap(ten(), null))!.followerMultiple).toBeNull();
    expect(pickBestPost(snap(ten(), 0))!.followerMultiple).toBeNull();
  });

  it("ignores posts without real views; null when none have views", () => {
    expect(pickBestPost(snap(ten(() => ({ views: null }))))).toBeNull();
  });

  it("keeps one decimal under 10x and handles old snapshots without thumbnails", () => {
    const posts = ten(() => ({ thumbnailUrl: undefined }));
    posts[0] = post(0, { views: 2_440, thumbnailUrl: undefined });
    const best = pickBestPost(snap(posts, 1000))!;
    expect(best.followerMultiple).toBe(2.4);
    expect(best.thumbnailUrl).toBeNull();
  });
});
