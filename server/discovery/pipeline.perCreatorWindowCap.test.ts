import { describe, expect, it } from "vitest";
import { DISCOVERY_REELS_PER_PAGE } from "@shared/const";
import { applyPerCreatorWindowCap } from "./pipeline";

type MockReel = Parameters<typeof applyPerCreatorWindowCap>[0][number];

function mockReel(params: {
  shortcode: string;
  username: string;
  tier: 1 | 2;
  viralScore: number;
}): MockReel {
  return {
    shortcode: params.shortcode,
    caption: "",
    views: 10_000,
    likes: 100,
    comments: 10,
    videoUrl: "",
    thumbnailUrl: "",
    postedAt: null,
    owner: {
      username: params.username,
      fullName: params.username,
      followers: 1_000,
      isVerified: false,
      isPrivate: false,
      biography: "",
      profilePicUrl: "",
    },
    viralScore: params.viralScore,
    viralTier: "Healthy",
    reachMultiplier: 3,
    engagementRate: 0.1,
    reelUrl: `https://www.instagram.com/reel/${params.shortcode}/`,
    tier: params.tier,
  };
}

function countCreatorInSlice(
  reels: MockReel[],
  start: number,
  end: number,
  username: string
): number {
  const key = username.toLowerCase();
  return reels
    .slice(start, end)
    .filter((r) => r.owner.username.toLowerCase() === key).length;
}

function assertMaxPerCreatorPerPage(
  reels: MockReel[],
  maxPerPage: number,
  pageSize: number
): void {
  for (let page = 0; page * pageSize < reels.length; page++) {
    const slice = reels.slice(page * pageSize, (page + 1) * pageSize);
    const counts = new Map<string, number>();
    for (const reel of slice) {
      const key = reel.owner.username.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    for (const count of counts.values()) {
      expect(count).toBeLessThanOrEqual(maxPerPage);
    }
  }
}

describe("applyPerCreatorWindowCap", () => {
  it("returns empty array for empty input", () => {
    expect(applyPerCreatorWindowCap([])).toEqual([]);
  });

  it("defers a single creator beyond 3 reels per algorithm window", () => {
    const input = [
      mockReel({ shortcode: "a1", username: "alice", tier: 1, viralScore: 100 }),
      mockReel({ shortcode: "a2", username: "alice", tier: 1, viralScore: 90 }),
      mockReel({ shortcode: "a3", username: "alice", tier: 1, viralScore: 80 }),
      mockReel({ shortcode: "a4", username: "alice", tier: 1, viralScore: 70 }),
      mockReel({ shortcode: "a5", username: "alice", tier: 1, viralScore: 60 }),
    ];

    const output = applyPerCreatorWindowCap(input);

    expect(output).toHaveLength(5);
    expect(output.slice(0, 3).map((r) => r.shortcode)).toEqual(["a1", "a2", "a3"]);
    expect(output.slice(3, 5).map((r) => r.shortcode)).toEqual(["a4", "a5"]);
    expect(output.map((r) => r.shortcode)).toEqual([
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
    ]);
  });

  it("limits dominant creator to 3 on page 1 in the 15-reel mixed case", () => {
    const input = [
      mockReel({ shortcode: "a1", username: "alice", tier: 1, viralScore: 100 }),
      mockReel({ shortcode: "a2", username: "alice", tier: 1, viralScore: 90 }),
      mockReel({ shortcode: "a3", username: "alice", tier: 1, viralScore: 80 }),
      mockReel({ shortcode: "a4", username: "alice", tier: 1, viralScore: 70 }),
      mockReel({ shortcode: "a5", username: "alice", tier: 1, viralScore: 60 }),
      ...["b", "c", "d", "e", "f", "g", "h", "i", "j"].map((u) =>
        mockReel({
          shortcode: `${u}1`,
          username: u,
          tier: 1,
          viralScore: 50,
        })
      ),
    ];

    const output = applyPerCreatorWindowCap(input);
    const page1 = output.slice(0, DISCOVERY_REELS_PER_PAGE);

    expect(page1).toHaveLength(9);
    expect(countCreatorInSlice(page1, 0, 9, "alice")).toBe(3);
    expect(page1.map((r) => r.shortcode)).toEqual([
      "a1",
      "a2",
      "a3",
      "b1",
      "c1",
      "d1",
      "e1",
      "f1",
      "g1",
    ]);
    expect(output.map((r) => r.shortcode)).toEqual([
      "a1",
      "a2",
      "a3",
      "b1",
      "c1",
      "d1",
      "e1",
      "f1",
      "g1",
      "a4",
      "a5",
      "h1",
      "i1",
      "j1",
    ]);
    assertMaxPerCreatorPerPage(output, 3, DISCOVERY_REELS_PER_PAGE);
  });

  it("never places tier-2 before a remaining tier-1 reel", () => {
    const input = [
      mockReel({ shortcode: "a1", username: "alice", tier: 1, viralScore: 100 }),
      mockReel({ shortcode: "a2", username: "alice", tier: 1, viralScore: 90 }),
      mockReel({ shortcode: "a3", username: "alice", tier: 1, viralScore: 80 }),
      mockReel({ shortcode: "a4", username: "alice", tier: 1, viralScore: 70 }),
      ...["b", "c", "d", "e", "f", "g"].map((u) =>
        mockReel({
          shortcode: `${u}1`,
          username: u,
          tier: 1,
          viralScore: 50,
        })
      ),
      mockReel({ shortcode: "h1", username: "helen", tier: 1, viralScore: 40 }),
      mockReel({ shortcode: "x1", username: "xavier", tier: 2, viralScore: 99 }),
      mockReel({ shortcode: "x2", username: "xena", tier: 2, viralScore: 98 }),
    ];

    const output = applyPerCreatorWindowCap(input);
    const firstTier2Idx = output.findIndex((r) => r.tier === 2);

    expect(firstTier2Idx).toBeGreaterThanOrEqual(0);
    const tier1Shortcodes = input
      .filter((r) => r.tier === 1)
      .map((r) => r.shortcode);
    for (const shortcode of tier1Shortcodes) {
      const idx = output.findIndex((r) => r.shortcode === shortcode);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(firstTier2Idx);
    }
  });

  it("preserves order when 9 distinct creators each have one reel", () => {
    const input = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map((u, i) =>
      mockReel({
        shortcode: `${u}1`,
        username: u,
        tier: 1,
        viralScore: 100 - i,
      })
    );

    const output = applyPerCreatorWindowCap(input);

    expect(output.map((r) => r.shortcode)).toEqual(input.map((r) => r.shortcode));
  });

  it("respects the topN slice", () => {
    const input = Array.from({ length: 20 }, (_, i) =>
      mockReel({
        shortcode: `r${i}`,
        username: `user${i}`,
        tier: 1,
        viralScore: 100 - i,
      })
    );

    expect(applyPerCreatorWindowCap(input, 10)).toHaveLength(10);
    expect(applyPerCreatorWindowCap(input, 10).map((r) => r.shortcode)).toEqual(
      input.slice(0, 10).map((r) => r.shortcode)
    );
  });
});
