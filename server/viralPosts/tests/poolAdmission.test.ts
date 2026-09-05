import { describe, expect, it } from "vitest";
import type { AdaptedCandidate } from "../candidateAdapter";
import { classifyCandidateForPoolAdmission } from "../poolAdmission";

function candidate(args: {
  caption: string;
  source?: string;
  relevanceReason?: string;
  classificationConfidence?: number;
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
    sourceId: "abc123",
    sourceUrl: "https://www.instagram.com/reel/abc123/",
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
    contentPillar: null,
    relevanceLabel: "Direct",
    relevanceReason: args.relevanceReason || "",
    hook: args.caption,
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: {
      source: args.source ?? "instagram_pool_discovery",
      ...(args.classificationConfidence == null
        ? {}
        : { classificationConfidence: args.classificationConfidence }),
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

const pool = {
  platform: "instagram",
  niche: "Business & Entrepreneurship",
  pillar: "restaurant operations",
};

describe("direct Instagram pool admission", () => {
  it("rejects viral direct-discovery reels with no real target-pillar evidence", () => {
    const decision = classifyCandidateForPoolAdmission({
      pool,
      candidate: candidate({ caption: "Pico de Gallo in under 20 seconds" }),
    });

    expect(decision.admit).toBe(false);
    expect(decision.reason).toBe("insufficient_direct_pillar_evidence");
    expect(decision.classification.confidence).toBe(0.35);
  });

  it("admits direct-discovery reels with actual restaurant-operations evidence", () => {
    const decision = classifyCandidateForPoolAdmission({
      pool,
      candidate: candidate({
        caption: "Restaurant staff training systems that make every shift run better",
      }),
    });

    expect(decision.admit).toBe(true);
    expect(decision.classification.primaryPillar).toBe("restaurant operations");
    expect(decision.classification.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("uses semantic classification as authoritative when available", () => {
    const decision = classifyCandidateForPoolAdmission({
      pool,
      candidate: candidate({
        caption: "How we train restaurant staff before every shift",
        semantic: {
          domainRelevant: true,
          primaryPillar: "restaurant operations",
          confidence: 0.91,
          reason: "Staff training and shift systems",
        },
      }),
    });

    expect(decision.admit).toBe(true);
    expect(decision.classification.confidence).toBe(0.91);
    expect(decision.classification.reason).toBe("Staff training and shift systems");
  });

  it("rejects a semantic pillar mismatch instead of forcing the Reel into the source pool", () => {
    const decision = classifyCandidateForPoolAdmission({
      pool,
      candidate: candidate({
        caption: "India's next big QSR opportunity might be hiding in plain sight",
        semantic: {
          domainRelevant: true,
          primaryPillar: "restaurant profitability",
          confidence: 0.9,
          reason: "Restaurant market opportunity and economics",
        },
      }),
    });

    expect(decision.admit).toBe(false);
    expect(decision.reason).toBe("semantic_pillar_mismatch");
    expect(decision.classification.primaryPillar).toBe("restaurant profitability");
    expect(decision.classification.confidence).toBe(0.9);
  });

  it("rejects semantically off-domain content even if a keyword fallback might match", () => {
    const decision = classifyCandidateForPoolAdmission({
      pool,
      candidate: candidate({
        caption: "Hospitality service inspiration",
        semantic: {
          domainRelevant: false,
          primaryPillar: null,
          confidence: 0.95,
          reason: "Generic promotional content, not an operator lesson",
        },
      }),
    });

    expect(decision.admit).toBe(false);
    expect(decision.reason).toBe("semantic_off_domain");
  });

  it("keeps transferable Featured behavior unchanged", () => {
    const decision = classifyCandidateForPoolAdmission({
      pool,
      candidate: candidate({
        caption: "A reusable founder story format",
        source: "featured_catalog",
        relevanceReason: "Transferable storytelling format",
        classificationConfidence: 0.42,
      }),
    });

    expect(decision.admit).toBe(true);
    expect(decision.classification.confidence).toBeGreaterThanOrEqual(0.35);
    expect(decision.classification.confidence).toBeLessThan(0.5);
  });

  it("preserves the legacy fallback for non-Instagram-discovery provider rows", () => {
    const decision = classifyCandidateForPoolAdmission({
      pool,
      candidate: candidate({
        caption: "Generic business story",
        source: "legacy_provider",
      }),
    });

    expect(decision.admit).toBe(true);
    expect(decision.classification.confidence).toBe(0.55);
  });
});
