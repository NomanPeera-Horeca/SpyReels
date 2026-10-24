import { describe, expect, it } from "vitest";
import type { OnboardingStateView } from "../onboarding/onboardingService";
import { CREATOR_SIGNAL_RECENT_DAYS, homeContextFromState, pickViralCreators, videoMatchText } from "./homeService";

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
    ]);
  });

  it("does not fill empty slots with large accounts that have no viral badge", () => {
    const famous = {
      id: 9,
      handle: "famous",
      displayName: "Famous",
      profilePicUrl: null,
      followerCount: 10_000_000,
    };
    expect(pickViralCreators([famous, ...accounts], [], now)).toEqual([]);
    const oneBadge = pickViralCreators(
      [famous, ...accounts],
      [{ featuredAccountId: 4, viewCount: 260_000, postedAt: daysAgo(2) }],
      now
    );
    expect(oneBadge.map(c => c.handle)).toEqual(["d"]);
  });
});

describe("homeContextFromState", () => {
  it("with no profile, Home is general and Finish setup starts at Goal", () => {
    expect(homeContextFromState(null)).toMatchObject({
      hasProfile: false,
      nicheLabel: null,
      featuredNicheSlug: null,
      pillarTitles: [],
      goalText: null,
      audienceText: null,
      personalizationComplete: false,
      nextStep: "goal",
    });
  });

  it("keeps a fitness goal from changing the niche, and still exposes it for ranking", () => {
    const state = {
      profile: { id: "p" },
      steps: { goal: "confirmed", audience: "confirmed", pillars: "pending" },
      items: [
        {
          kind: "niche",
          status: "confirmed",
          payload: { slug: "pottery", label: "Pottery studio" },
        },
        {
          kind: "goal",
          status: "confirmed",
          payload: { text: "Help fitness coaches sign clients." },
        },
        {
          kind: "audience",
          status: "confirmed",
          payload: { who: "Restaurant owners", outcome: "Lower food cost" },
        },
        {
          kind: "pillar",
          status: "suggested",
          payload: { title: "Ignored pillar", description: "" },
        },
        {
          kind: "pillar",
          status: "confirmed",
          payload: { title: "Menu engineering", description: "Prices" },
        },
      ],
    } as OnboardingStateView;
    const ctx = homeContextFromState(state);
    expect(ctx.nicheLabel).toBe("Pottery studio");
    expect(ctx.featuredNicheSlug).toBeNull();
    expect(ctx.goalText).toBe("Help fitness coaches sign clients.");
    expect(ctx.audienceText).toBe("Restaurant owners. Lower food cost");
    expect(ctx.pillarTitles).toEqual(["Menu engineering"]);
    expect(videoMatchText(ctx)).toBe("Pottery studio");
    expect(videoMatchText(ctx)).not.toContain("fitness");
  });
});
