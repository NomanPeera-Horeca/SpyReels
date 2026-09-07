import { describe, expect, it } from "vitest";
import type { AdaptedCandidate } from "../candidateAdapter";
import {
  buildAdmittedPoolLinks,
  groupSemanticReroutes,
} from "../poolRefresh";
import type { SemanticPoolReroute } from "../semanticPoolRelevance";

function candidate(args: {
  sourceId: string;
  caption: string;
  source?: string;
  semantic?: {
    domainRelevant: boolean;
    primaryPillar: string | null;
    secondaryPillar?: string | null;
    confidence: number;
    reason?: string;
  };
}): AdaptedCandidate {
  return {
    platform: "instagram",
    sourceId: args.sourceId,
    sourceUrl: `https://www.instagram.com/reel/${args.sourceId}/`,
    creatorId: "creator",
    creatorName: "Creator",
    creatorHandle: "@creator",
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
    contentPillar: args.semantic?.primaryPillar ?? null,
    relevanceLabel: "Direct",
    relevanceReason: args.semantic?.reason || "",
    hook: args.caption,
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: {
      source: args.source ?? "instagram_pool_discovery",
      ...(args.semantic
        ? {
            semanticDomainRelevant: args.semantic.domainRelevant,
            semanticPrimaryPillar: args.semantic.primaryPillar,
            semanticSecondaryPillar: args.semantic.secondaryPillar ?? null,
            semanticPillarConfidence: args.semantic.confidence,
            semanticPillarReason: args.semantic.reason ?? "Semantic classification",
          }
        : {}),
    },
  };
}

const operationsPool = {
  platform: "instagram",
  niche: "Business & Entrepreneurship",
  pillar: "restaurant operations",
};

const profitabilityPool = {
  platform: "instagram",
  niche: "Business & Entrepreneurship",
  pillar: "restaurant profitability",
};

describe("semantic reroute pool linking", () => {
  it("does not force a profitability Reel into the operations pool", () => {
    const qsr = candidate({
      sourceId: "qsr",
      caption: "India's next big QSR opportunity might be hiding in plain sight",
      semantic: {
        domainRelevant: true,
        primaryPillar: "restaurant profitability",
        confidence: 0.91,
        reason: "Restaurant market opportunity and economics",
      },
    });

    const links = buildAdmittedPoolLinks({
      pool: operationsPool,
      adapted: [qsr],
      candidateIdsBySource: new Map([["qsr", 11]]),
    });

    expect(links).toHaveLength(0);
  });

  it("preserves semantic confidence when linking into the correct sibling pool", () => {
    const qsr = candidate({
      sourceId: "qsr",
      caption: "India's next big QSR opportunity might be hiding in plain sight",
      semantic: {
        domainRelevant: true,
        primaryPillar: "restaurant profitability",
        confidence: 0.91,
        reason: "Restaurant market opportunity and economics",
      },
    });

    const links = buildAdmittedPoolLinks({
      pool: profitabilityPool,
      adapted: [qsr],
      candidateIdsBySource: new Map([["qsr", 11]]),
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.candidateId).toBe(11);
    expect(links[0]?.classification.primaryPillar).toBe("restaurant profitability");
    expect(links[0]?.classification.confidence).toBe(0.91);
    expect(links[0]?.classification.reason).toBe(
      "Restaurant market opportunity and economics"
    );
  });

  it("groups sibling reroutes by target pillar and keeps canonical source ids", () => {
    const qsr: SemanticPoolReroute = {
      candidate: candidate({
        sourceId: "qsr",
        caption: "India's next big QSR opportunity might be hiding in plain sight",
        semantic: {
          domainRelevant: true,
          primaryPillar: "restaurant profitability",
          confidence: 0.91,
        },
      }),
      targetPillar: "restaurant profitability",
      verdict: {
        sourceId: "qsr",
        domainRelevant: true,
        primaryPillar: "restaurant profitability",
        secondaryPillar: null,
        confidence: 0.91,
        reason: "Restaurant market opportunity",
      },
    };

    const grouped = groupSemanticReroutes([qsr]);
    expect([...grouped.keys()]).toEqual(["restaurant profitability"]);
    expect(grouped.get("restaurant profitability")?.[0]?.sourceId).toBe("qsr");
  });

  it("keeps Featured transferable admission in the 0.35-0.49 band", () => {
    const featured = candidate({
      sourceId: "feat",
      caption: "A reusable founder story format",
      source: "featured_catalog",
    });
    featured.relevanceReason = "Transferable storytelling format";
    featured.rawProviderPayload.classificationConfidence = 0.42;

    const links = buildAdmittedPoolLinks({
      pool: operationsPool,
      adapted: [featured],
      candidateIdsBySource: new Map([["feat", 22]]),
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.classification.confidence).toBeGreaterThanOrEqual(0.35);
    expect(links[0]?.classification.confidence).toBeLessThan(0.5);
  });

  it("keeps TikTok and YouTube legacy admission unchanged", () => {
    const tiktok = candidate({
      sourceId: "tt",
      caption: "Generic business story",
      source: "legacy_provider",
    });
    tiktok.rawProviderPayload = { platform: "tiktok" };
    const youtube = candidate({
      sourceId: "yt",
      caption: "Generic business story",
      source: "legacy_provider",
    });
    youtube.rawProviderPayload = { platform: "youtube" };

    const tiktokLinks = buildAdmittedPoolLinks({
      pool: { ...operationsPool, platform: "tiktok" },
      adapted: [tiktok],
      candidateIdsBySource: new Map([["tt", 31]]),
    });
    const youtubeLinks = buildAdmittedPoolLinks({
      pool: { ...operationsPool, platform: "youtube" },
      adapted: [youtube],
      candidateIdsBySource: new Map([["yt", 32]]),
    });

    expect(tiktokLinks[0]?.classification.confidence).toBe(0.55);
    expect(youtubeLinks[0]?.classification.confidence).toBe(0.55);
  });
});
