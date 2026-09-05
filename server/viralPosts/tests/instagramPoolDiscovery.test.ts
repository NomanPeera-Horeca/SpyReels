import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryResult } from "../../discovery/pipeline";
import type { AdaptedCandidate } from "../candidateAdapter";
import {
  applyInstagramPoolAdmission,
  buildInstagramPoolDiscoveryDescription,
  instagramCreatorSeedTopicSignal,
  selectInstagramCreatorsForDrilling,
  type InstagramHashtagCreatorSeed,
} from "../instagramPoolDiscovery";
import {
  routeSemanticPoolCandidates,
  type SemanticPoolVerdict,
} from "../semanticPoolRelevance";

const mockClassifySemantic = vi.hoisted(() => vi.fn());

vi.mock("../semanticPoolRelevance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../semanticPoolRelevance")>();
  return {
    ...actual,
    classifySemanticPoolRelevance: (...args: unknown[]) =>
      mockClassifySemantic(...args),
  };
});

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

function adapted(args: {
  sourceId: string;
  caption: string;
  handle?: string;
}): AdaptedCandidate {
  return {
    platform: "instagram",
    sourceId: args.sourceId,
    sourceUrl: `https://www.instagram.com/reel/${args.sourceId}/`,
    creatorId: args.handle ?? "creator",
    creatorName: args.handle ?? "Creator",
    creatorHandle: `@${args.handle ?? "creator"}`,
    creatorAvatarUrl: null,
    creatorFollowers: 10_000,
    thumbnailUrl: null,
    videoUrl: null,
    caption: args.caption,
    transcript: null,
    hashtags: [],
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    views: 100_000,
    likes: 5_000,
    comments: 100,
    shares: null,
    saves: null,
    reachMultiplier: 10,
    engagementRate: 0.05,
    viewsPerHour: 1_000,
    trendStatus: "proven-format",
    relevanceHint: 50,
    contentPillar: null,
    relevanceLabel: "Direct",
    relevanceReason: "",
    hook: args.caption,
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: { source: "instagram_pool_discovery" },
  };
}

function verdict(
  args: Partial<SemanticPoolVerdict> & { sourceId: string }
): SemanticPoolVerdict {
  return {
    sourceId: args.sourceId,
    domainRelevant: args.domainRelevant ?? true,
    primaryPillar: args.primaryPillar ?? "restaurant operations",
    secondaryPillar: args.secondaryPillar ?? null,
    confidence: args.confidence ?? 0.9,
    reason: args.reason ?? "Strong semantic fit",
  };
}

describe("Instagram semantic pool admission wiring", () => {
  beforeEach(() => {
    mockClassifySemantic.mockReset();
  });

  it("rejects a recipe tutorial from restaurant operations", async () => {
    const recipe = adapted({
      sourceId: "pico",
      caption: "Pico de Gallo in under 20 seconds",
      handle: "the_latin_foodie",
    });
    mockClassifySemantic.mockResolvedValue({
      verdicts: [
        verdict({
          sourceId: "pico",
          domainRelevant: false,
          primaryPillar: null,
          reason: "Recipe tutorial, not restaurant operator content",
        }),
      ],
      haikuCalls: 1,
    });

    const result = await applyInstagramPoolAdmission({
      niche: "restaurant operations",
      poolNiche: "Business & Entrepreneurship",
      pillar: "restaurant operations",
      candidates: [recipe],
    });

    expect(result.adapted).toHaveLength(0);
    expect(result.semanticRejected).toBe(1);
    expect(result.semanticRerouted).toBe(0);
    expect(result.semanticHaikuCalls).toBe(1);
    expect(result.semanticRejectedCandidates[0]?.reason).toBe("off_domain");
  });

  it("reroutes a QSR opportunity to restaurant profitability", async () => {
    const qsr = adapted({
      sourceId: "qsr",
      caption: "India's next big QSR opportunity might be hiding in plain sight",
      handle: "all_about_restaurants",
    });
    mockClassifySemantic.mockResolvedValue({
      verdicts: [
        verdict({
          sourceId: "qsr",
          primaryPillar: "restaurant profitability",
          reason: "Restaurant market opportunity and economics",
        }),
      ],
      haikuCalls: 1,
    });

    const result = await applyInstagramPoolAdmission({
      niche: "restaurant operations",
      poolNiche: "Business & Entrepreneurship",
      pillar: "restaurant operations",
      candidates: [qsr],
    });

    expect(result.adapted).toHaveLength(0);
    expect(result.semanticRerouted).toBe(1);
    expect(result.reroutedCandidates[0]?.targetPillar).toBe(
      "restaurant profitability"
    );
    expect(result.reroutedCandidates[0]?.candidate.sourceId).toBe("qsr");
    expect(result.reroutedCandidates[0]?.candidate.contentPillar).toBe(
      "restaurant profitability"
    );
  });

  it("keeps a real staff training Reel in restaurant operations", async () => {
    const ops = adapted({
      sourceId: "sop",
      caption: "How we train restaurant staff before every shift",
      handle: "ops_owner",
    });
    mockClassifySemantic.mockResolvedValue({
      verdicts: [verdict({ sourceId: "sop" })],
      haikuCalls: 1,
    });

    const result = await applyInstagramPoolAdmission({
      niche: "restaurant operations",
      poolNiche: "Business & Entrepreneurship",
      pillar: "restaurant operations",
      candidates: [ops],
    });

    expect(result.adapted).toHaveLength(1);
    expect(result.adapted[0]?.contentPillar).toBe("restaurant operations");
    expect(result.semanticRerouted).toBe(0);
    expect(result.semanticRejected).toBe(0);
  });

  it("rejects generic unrelated content instead of keyword matching", async () => {
    const promo = adapted({
      sourceId: "uni",
      caption: "University hospitality promo",
      handle: "vemosa_skills",
    });
    mockClassifySemantic.mockResolvedValue({
      verdicts: [
        verdict({
          sourceId: "uni",
          domainRelevant: false,
          primaryPillar: null,
          reason: "University promo, not an operator lesson",
        }),
      ],
      haikuCalls: 1,
    });

    const result = await applyInstagramPoolAdmission({
      niche: "restaurant operations",
      poolNiche: "Business & Entrepreneurship",
      pillar: "restaurant operations",
      candidates: [promo],
    });

    expect(result.adapted).toHaveLength(0);
    expect(result.semanticRejected).toBe(1);
  });

  it("fails closed when semantic classification throws and does not keyword-admit", async () => {
    const recipe = adapted({
      sourceId: "pico",
      caption: "Pico de Gallo in under 20 seconds",
    });
    mockClassifySemantic.mockRejectedValue(new Error("haiku unavailable"));

    const result = await applyInstagramPoolAdmission({
      niche: "restaurant operations",
      poolNiche: "Business & Entrepreneurship",
      pillar: "restaurant operations",
      candidates: [recipe],
    });

    expect(result.adapted).toHaveLength(0);
    expect(result.reroutedCandidates).toHaveLength(0);
    expect(result.semanticRejected).toBe(1);
    expect(result.semanticHaikuCalls).toBe(0);
    expect(result.semanticRejectedCandidates[0]?.reason).toBe("missing_verdict");
  });

  it("fails closed when the semantic judge returns no verdict", async () => {
    const reel = adapted({
      sourceId: "missing",
      caption: "Some viral Reel",
    });
    mockClassifySemantic.mockResolvedValue({
      verdicts: [],
      haikuCalls: 1,
    });

    const result = await applyInstagramPoolAdmission({
      niche: "restaurant operations",
      poolNiche: "Business & Entrepreneurship",
      pillar: "restaurant operations",
      candidates: [reel],
    });

    expect(result.adapted).toHaveLength(0);
    expect(result.semanticRejectedCandidates[0]?.reason).toBe("missing_verdict");
  });

  it("does not spend extra ScrapeCreators budget during semantic routing", async () => {
    mockClassifySemantic.mockResolvedValue({ verdicts: [], haikuCalls: 1 });
    await applyInstagramPoolAdmission({
      niche: "restaurant operations",
      poolNiche: "Business & Entrepreneurship",
      pillar: "restaurant operations",
      candidates: [adapted({ sourceId: "a", caption: "Staff SOP training" })],
    });
    expect(mockClassifySemantic).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(mockClassifySemantic.mock.calls[0])).not.toContain(
      "scrapeReels"
    );
  });

  it("keeps the same routing helper as production semantic classification", () => {
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [
        adapted({
          sourceId: "qsr",
          caption: "India's next big QSR opportunity might be hiding in plain sight",
        }),
      ],
      verdicts: [
        verdict({
          sourceId: "qsr",
          primaryPillar: "restaurant profitability",
        }),
      ],
    });
    expect(routed.currentPool).toHaveLength(0);
    expect(routed.rerouted[0]?.targetPillar).toBe("restaurant profitability");
  });
});
