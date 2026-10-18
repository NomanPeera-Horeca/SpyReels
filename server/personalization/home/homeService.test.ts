import { describe, expect, it } from "vitest";
import { CREATOR_SIGNAL_RECENT_DAYS, homeContextFromState, pickViralCreators } from "./homeService";

const now = new Date("2026-10-16T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

describe("pickViralCreators", () => {
  const accounts = [
    { id: 1, handle: "a", displayName: "A", profilePicUrl: null, followerCount: 1_000 },
    { id: 2, handle: "b", displayName: "B", profilePicUrl: null, followerCount: 2_000 },
    { id: 3, handle: "c", displayName: "C", profilePicUrl: null, followerCount: 0 },
    { id: 4, handle: "d", displayName: "D", profilePicUrl: null, followerCount: 500 },
  ];

  it("uses the best RECENT video, hides old, missing-follower and sub-Healthy signals", () => {
    const out = pickViralCreators(
      accounts,
      [
        { featuredAccountId: 1, viewCount: 34_000, postedAt: daysAgo(10) }, // Strong 34x
        { featuredAccountId: 1, viewCount: 900_000, postedAt: daysAgo(CREATOR_SIGNAL_RECENT_DAYS + 1) }, // stale
        { featuredAccountId: 2, viewCount: 8_000, postedAt: daysAgo(5) }, // 4x: Skip
        { featuredAccountId: 3, viewCount: 99_000, postedAt: daysAgo(5) }, // no followers
        { featuredAccountId: 4, viewCount: 260_000, postedAt: daysAgo(2) }, // Viral 520x? -> Explosive
      ],
      now,
      4
    );
    expect(out.map(c => [c.handle, c.badge?.label ?? null])).toEqual([
      ["d", "Explosive · 520x followers"],
      ["a", "Strong · 34x followers"],
      ["b", null],
      ["c", null],
    ]);
  });

  it("limits to three by default", () => {
    expect(pickViralCreators(accounts, [], now)).toHaveLength(3);
  });
});

describe("homeContextFromState", () => {
  it("with no profile, Home is general and Finish setup starts at Goal", () => {
    expect(homeContextFromState(null)).toMatchObject({
      hasProfile: false,
      nicheLabel: null,
      featuredNicheSlug: null,
      personalizationComplete: false,
      nextStep: "goal",
    });
  });
});
