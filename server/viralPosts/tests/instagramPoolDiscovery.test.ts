import { describe, expect, it } from "vitest";
import type { DiscoveryResult } from "../../discovery/pipeline";
import {
  buildInstagramPoolDiscoveryDescription,
  instagramCreatorSeedTopicSignal,
  selectInstagramCreatorsForDrilling,
  type InstagramHashtagCreatorSeed,
} from "../instagramPoolDiscovery";

function reel(args: {
  shortcode: string;
  handle: string;
  viralScore: number;
  tier?: 1 | 2;
  views?: number;
  caption?: string;
}): DiscoveryResult["viralReels"][number] {
  return {
    shortcode: args.shortcode,
    reelUrl: `https://www.instagram.com/reel/${args.shortcode}/`,
    thumbnailUrl: "",
    videoUrl: "",
    caption: args.caption ?? `${args.handle} restaurant reel`,
    views: args.views ?? 50_000,
    likes: 2_000,
    comments: 100,
    viralScore: args.viralScore,
    viralTier: "Strong",
    reachMultiplier: 5,
    engagementRate: 0.04,
    tier: args.tier ?? 1,
    postedAt: "2026-09-01T00:00:00.000Z",
    owner: {
      username: args.handle,
      fullName: args.handle,
      followers: 10_000,
      isVerified: false,
      biography: "Restaurant operator",
      profilePicUrl: "",
    },
  };
}

function seed(args: {
  handle: string;
  hashtags?: string[];
  posts?: number;
  topicSignalScore?: number;
  caption?: string;
}): InstagramHashtagCreatorSeed {
  return {
    handle: args.handle,
    fullName: args.handle,
    profilePicUrl: "",
    biography: "",
    isVerified: false,
    matchedHashtags: args.hashtags ?? ["restaurantowner"],
    hashtagPostCount: args.posts ?? 1,
    topicSignalScore: args.topicSignalScore ?? 0,
    sampleCaption: args.caption ?? "",
  };
}

describe("Instagram Viral pool selective drilling", () => {
  it("keeps restaurant pool prompts restaurant-specific instead of generic business", () => {
    const description = buildInstagramPoolDiscoveryDescription({
      niche: "Business & Entrepreneurship",
      pillar: "restaurant operations",
    });

    expect(description).toContain("restaurant and hospitality operators");
    expect(description).toContain("restaurant operations");
    expect(description).toContain("restaurant owners");
  });

  it("prioritizes creators with repeated strong hashtag evidence before one-off virality", () => {
    const selected = selectInstagramCreatorsForDrilling({
      reels: [
        reel({ shortcode: "a1", handle: "repeat_operator", viralScore: 12 }),
        reel({ shortcode: "a2", handle: "repeat_operator", viralScore: 11 }),
        reel({ shortcode: "a3", handle: "repeat_operator", viralScore: 10, tier: 2 }),
        reel({ shortcode: "b1", handle: "one_hit", viralScore: 100 }),
        reel({ shortcode: "c1", handle: "two_tier1", viralScore: 8 }),
        reel({ shortcode: "c2", handle: "two_tier1", viralScore: 7 }),
      ],
      pillar: "restaurant operations",
      niche: "Business & Entrepreneurship",
      limit: 3,
    });

    expect(selected.map((creator) => creator.handle)).toEqual([
      "repeat_operator",
      "two_tier1",
      "one_hit",
    ]);
    expect(selected[0]?.tier1Count).toBe(2);
    expect(selected[0]?.hashtagReelCount).toBe(3);
  });

  it("uses best viral score as a deterministic tie-breaker", () => {
    const selected = selectInstagramCreatorsForDrilling({
      reels: [
        reel({ shortcode: "a", handle: "alpha", viralScore: 15 }),
        reel({ shortcode: "b", handle: "beta", viralScore: 30 }),
      ],
      limit: 1,
    });

    expect(selected[0]?.handle).toBe("beta");
  });

  it("can select metricless hashtag creators for drilling without pretending they are viral", () => {
    const selected = selectInstagramCreatorsForDrilling({
      reels: [],
      metriclessSeeds: [
        seed({
          handle: "restaurant_operator",
          hashtags: ["restaurantowner", "foodservice"],
          posts: 2,
          topicSignalScore: 12,
          caption: "How we train restaurant staff for faster service",
        }),
        seed({
          handle: "generic_founder",
          hashtags: ["entrepreneurship"],
          posts: 1,
          topicSignalScore: 0,
          caption: "Founder mindset",
        }),
      ],
      pillar: "restaurant operations",
      niche: "Business & Entrepreneurship",
      limit: 2,
    });

    expect(selected.map((creator) => creator.handle)).toEqual([
      "restaurant_operator",
      "generic_founder",
    ]);
    expect(selected[0]?.seedMode).toBe("metricless_hashtag");
    expect(selected[0]?.bestViews).toBe(0);
    expect(selected[0]?.bestViralScore).toBe(0);
    expect(selected[0]?.matchedHashtags).toEqual([
      "restaurantowner",
      "foodservice",
    ]);
  });

  it("scores real restaurant/operator text above generic founder language for drill priority", () => {
    const restaurant = instagramCreatorSeedTopicSignal({
      text: "Restaurant owner sharing staff training and service systems",
      pillar: "restaurant operations",
      niche: "Business & Entrepreneurship",
    });
    const generic = instagramCreatorSeedTopicSignal({
      text: "Founder mindset and entrepreneurship lessons",
      pillar: "restaurant operations",
      niche: "Business & Entrepreneurship",
    });

    expect(restaurant).toBeGreaterThan(generic);
    expect(generic).toBe(0);
  });
});
