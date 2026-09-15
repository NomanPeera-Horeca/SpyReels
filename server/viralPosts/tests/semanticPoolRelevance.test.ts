import { describe, expect, it } from "vitest";
import type { AdaptedCandidate } from "../candidateAdapter";
import {
  SEMANTIC_POOL_PROMPT,
  normalizeSemanticPoolVerdict,
  routeSemanticPoolCandidates,
  type SemanticPoolVerdict,
} from "../semanticPoolRelevance";

function candidate(sourceId: string, caption: string): AdaptedCandidate {
  return {
    platform: "instagram",
    sourceId,
    sourceUrl: `https://www.instagram.com/reel/${sourceId}/`,
    creatorId: "creator",
    creatorName: "Creator",
    creatorHandle: "@creator",
    creatorAvatarUrl: null,
    creatorFollowers: 10_000,
    thumbnailUrl: null,
    videoUrl: null,
    caption,
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
    hook: caption,
    format: "talking-head",
    hashtagKey: null,
    rawProviderPayload: { source: "instagram_pool_discovery" },
  };
}

function verdict(args: Partial<SemanticPoolVerdict> & { sourceId: string }): SemanticPoolVerdict {
  return {
    sourceId: args.sourceId,
    domainRelevant: args.domainRelevant ?? true,
    primaryPillar: args.primaryPillar ?? "restaurant operations",
    secondaryPillar: args.secondaryPillar ?? null,
    confidence: args.confidence ?? 0.9,
    reason: args.reason ?? "Strong semantic fit",
  };
}

describe("semantic restaurant pool relevance", () => {
  it("rejects viral recipe content when semantic judge says it is not operator content", () => {
    const reel = candidate("recipe", "Pico de Gallo in under 20 seconds");
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [reel],
      verdicts: [
        verdict({
          sourceId: "recipe",
          domainRelevant: false,
          primaryPillar: null,
          confidence: 0.96,
          reason: "Recipe tutorial, not restaurant operator content",
        }),
      ],
    });

    expect(routed.currentPool).toHaveLength(0);
    expect(routed.rerouted).toHaveLength(0);
    expect(routed.rejected).toHaveLength(1);
    expect(routed.rejected[0]?.reason).toBe("off_domain");
  });

  it("reroutes a QSR opportunity from operations to profitability instead of discarding it", () => {
    const reel = candidate("qsr", "India's next big QSR opportunity might be hiding in plain sight");
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [reel],
      verdicts: [
        verdict({
          sourceId: "qsr",
          primaryPillar: "restaurant profitability",
          confidence: 0.91,
          reason: "Restaurant market opportunity and business economics",
        }),
      ],
    });

    expect(routed.currentPool).toHaveLength(0);
    expect(routed.rerouted).toHaveLength(1);
    expect(routed.rerouted[0]?.targetPillar).toBe("restaurant profitability");
    expect(routed.rerouted[0]?.candidate.contentPillar).toBe("restaurant profitability");
    expect(routed.rerouted[0]?.candidate.pillarConfidence).toBe(0.91);
  });

  it("keeps real operations content in the current operations pool", () => {
    const reel = candidate("ops", "How we train restaurant staff before every shift");
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [reel],
      verdicts: [verdict({ sourceId: "ops", primaryPillar: "restaurant operations" })],
    });

    expect(routed.currentPool).toHaveLength(1);
    expect(routed.rerouted).toHaveLength(0);
    expect(routed.currentPool[0]?.contentPillar).toBe("restaurant operations");
    expect(routed.currentPool[0]?.rawProviderPayload.semanticPrimaryPillar).toBe(
      "restaurant operations"
    );
  });

  it("does not admit a candidate to the source pool from secondary-pillar metadata", () => {
    const reel = candidate("equipment", "Choosing a high-capacity prep machine for faster service");
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [reel],
      verdicts: [
        verdict({
          sourceId: "equipment",
          primaryPillar: "kitchen buildouts",
          secondaryPillar: "restaurant operations",
          confidence: 0.9,
          reason: "Primarily an equipment selection and capacity decision",
        }),
      ],
    });

    expect(routed.currentPool).toHaveLength(0);
    expect(routed.rerouted).toHaveLength(1);
    expect(routed.rerouted[0]?.targetPillar).toBe("kitchen buildouts");
    expect(routed.rerouted[0]?.verdict.secondaryPillar).toBe("restaurant operations");
  });

  it("rejects missing and low-confidence semantic verdicts rather than polluting a pool", () => {
    const missing = candidate("missing", "Some viral Reel");
    const low = candidate("low", "Some ambiguous restaurant Reel");
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [missing, low],
      verdicts: [verdict({ sourceId: "low", confidence: 0.4 })],
    });

    expect(routed.currentPool).toHaveLength(0);
    expect(routed.rejected.map((x) => x.reason).sort()).toEqual([
      "low_confidence",
      "missing_verdict",
    ]);
  });

  it("classifies short-form content across Instagram, TikTok, and YouTube without a second judge", () => {
    expect(SEMANTIC_POOL_PROMPT).toContain("Instagram Reels");
    expect(SEMANTIC_POOL_PROMPT).toContain("TikTok videos");
    expect(SEMANTIC_POOL_PROMPT).toContain("YouTube Shorts");
    expect(SEMANTIC_POOL_PROMPT).toContain("Recipe tutorials");
    expect(SEMANTIC_POOL_PROMPT).toContain("primary pillar is the video's canonical pool");
    expect(SEMANTIC_POOL_PROMPT).toContain("INSTAGRAM TRANSFERABILITY RULE");
    expect(SEMANTIC_POOL_PROMPT).toContain(
      "do NOT require the creator, caption, or setting to explicitly say restaurant"
    );
    expect(SEMANTIC_POOL_PROMPT).toContain("generic motivation");

    const tiktok = candidate("tt-ops", "How we train restaurant staff before every shift");
    tiktok.platform = "tiktok";
    tiktok.sourceUrl = "https://www.tiktok.com/@ops/video/tt-ops";
    const youtube = candidate("yt-ops", "Restaurant inventory SOP that prevents stockouts");
    youtube.platform = "youtube";
    youtube.sourceUrl = "https://www.youtube.com/shorts/yt-ops";
    const instagram = candidate("ig-ops", "How we train restaurant staff before every shift");

    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [tiktok, youtube, instagram],
      verdicts: [
        verdict({ sourceId: "tt-ops", primaryPillar: "restaurant operations" }),
        verdict({ sourceId: "yt-ops", primaryPillar: "restaurant operations" }),
        verdict({ sourceId: "ig-ops", primaryPillar: "restaurant operations" }),
      ],
    });

    expect(routed.currentPool).toHaveLength(3);
    expect(routed.currentPool.map((row) => row.platform).sort()).toEqual([
      "instagram",
      "tiktok",
      "youtube",
    ]);
  });

  it("normalizes invalid pillar output instead of accepting invented categories", () => {
    const normalized = normalizeSemanticPoolVerdict({
      sourceId: "bad",
      domainRelevant: true,
      primaryPillar: "recipes",
      secondaryPillar: "restaurant operations",
      confidence: 0.9,
      reason: "bad model output",
    });

    expect(normalized).not.toBeNull();
    expect(normalized?.domainRelevant).toBe(false);
    expect(normalized?.primaryPillar).toBeNull();
  });
});
