import { describe, expect, it } from "vitest";
import type { AdaptedCandidate } from "../candidateAdapter";
import {
  MIN_SEMANTIC_POOL_CONFIDENCE,
  SEMANTIC_POOL_PROMPT,
  buildSemanticPoolPrompt,
  clipForPrompt,
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

describe("semantic pool relevance", () => {
  it("keeps the production quality threshold at 0.55", () => {
    expect(MIN_SEMANTIC_POOL_CONFIDENCE).toBe(0.55);
  });

  it("uses a niche-neutral transferability policy", () => {
    expect(SEMANTIC_POOL_PROMPT).toContain("CURRENT USER NICHE");
    expect(SEMANTIC_POOL_PROMPT).toContain("ALLOWED ACTIVE CONTENT PILLARS");
    expect(SEMANTIC_POOL_PROMPT).toContain("concrete, transferable action");
    expect(SEMANTIC_POOL_PROMPT).toContain("Generic motivation");
    expect(SEMANTIC_POOL_PROMPT).not.toContain("INSTAGRAM TRANSFERABILITY RULE");
    expect(SEMANTIC_POOL_PROMPT).not.toContain(
      "restaurant or hospitality OPERATOR"
    );
  });

  it.each([
    {
      niche: "Restaurants & Cafes",
      pillars: [
        "restaurant profitability",
        "restaurant marketing",
        "restaurant operations",
      ],
      acceptedPillar: "restaurant marketing",
    },
    {
      niche: "Health & Fitness",
      pillars: [
        "Health & Fitness",
        "Health & Fitness marketing",
        "Health & Fitness operations",
      ],
      acceptedPillar: "Health & Fitness marketing",
    },
    {
      niche: "Real Estate",
      pillars: ["Real Estate", "Real Estate marketing", "Real Estate operations"],
      acceptedPillar: "Real Estate operations",
    },
    {
      niche: "Beauty",
      pillars: ["Beauty", "Beauty marketing", "Beauty operations"],
      acceptedPillar: "Beauty marketing",
    },
    {
      niche: "Personal Finance",
      pillars: [
        "Personal Finance",
        "Personal Finance marketing",
        "Personal Finance operations",
      ],
      acceptedPillar: "Personal Finance",
    },
  ])(
    "injects the actual niche and pillars for $niche",
    ({ niche, pillars, acceptedPillar }) => {
      const prompt = buildSemanticPoolPrompt({ niche, activePillars: pillars });
      expect(prompt).toContain(`CURRENT USER NICHE:\n${niche}`);
      for (const pillar of pillars) {
        expect(prompt).toContain(`- ${pillar}`);
      }

      const normalized = normalizeSemanticPoolVerdict(
        {
          sourceId: "multi-niche",
          domainRelevant: true,
          primaryPillar: acceptedPillar,
          secondaryPillar: null,
          confidence: 0.9,
          reason: "Useful tactic for this niche",
        },
        pillars
      );
      expect(normalized?.domainRelevant).toBe(true);
      expect(normalized?.primaryPillar).toBe(acceptedPillar);
    }
  );

  it("rejects a pillar invented outside the user's active pillar list", () => {
    const normalized = normalizeSemanticPoolVerdict(
      {
        sourceId: "bad-pillar",
        domainRelevant: true,
        primaryPillar: "restaurant operations",
        secondaryPillar: null,
        confidence: 0.9,
        reason: "Wrong niche pillar",
      },
      ["Beauty", "Beauty marketing", "Beauty operations"]
    );

    expect(normalized).not.toBeNull();
    expect(normalized?.domainRelevant).toBe(false);
    expect(normalized?.primaryPillar).toBeNull();
  });

  it("rejects viral recipe content when semantic judge says it is not useful to the niche", () => {
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
          reason: "Recipe tutorial, not an operator lesson",
        }),
      ],
    });

    expect(routed.currentPool).toHaveLength(0);
    expect(routed.rerouted).toHaveLength(0);
    expect(routed.rejected).toHaveLength(1);
    expect(routed.rejected[0]?.reason).toBe("off_domain");
  });

  it("reroutes a strong semantic fit to the correct supplied pillar", () => {
    const reel = candidate("qsr", "A pricing tactic that improves unit economics");
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [reel],
      verdicts: [
        verdict({
          sourceId: "qsr",
          primaryPillar: "restaurant profitability",
          confidence: 0.91,
          reason: "Business economics and pricing",
        }),
      ],
    });

    expect(routed.currentPool).toHaveLength(0);
    expect(routed.rerouted).toHaveLength(1);
    expect(routed.rerouted[0]?.targetPillar).toBe("restaurant profitability");
    expect(routed.rerouted[0]?.candidate.contentPillar).toBe(
      "restaurant profitability"
    );
    expect(routed.rerouted[0]?.candidate.pillarConfidence).toBe(0.91);
  });

  it("keeps a strong fit in the current pool", () => {
    const reel = candidate("ops", "How we train a service team before every shift");
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [reel],
      verdicts: [verdict({ sourceId: "ops", primaryPillar: "restaurant operations" })],
    });

    expect(routed.currentPool).toHaveLength(1);
    expect(routed.rerouted).toHaveLength(0);
    expect(routed.currentPool[0]?.contentPillar).toBe("restaurant operations");
    expect(routed.currentPool[0]?.relevanceLabel).toBe("Semantic niche fit");
  });

  it("keeps the 0.55 confidence gate exact", () => {
    const below = candidate("below", "Ambiguous tactic");
    const atThreshold = candidate("at", "Clear tactic");
    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [below, atThreshold],
      verdicts: [
        verdict({
          sourceId: "below",
          primaryPillar: "restaurant operations",
          confidence: 0.549,
        }),
        verdict({
          sourceId: "at",
          primaryPillar: "restaurant operations",
          confidence: 0.55,
        }),
      ],
    });

    expect(routed.currentPool.map((row) => row.sourceId)).toEqual(["at"]);
    expect(routed.rejected).toHaveLength(1);
    expect(routed.rejected[0]?.reason).toBe("low_confidence");
  });

  it("still routes supported short-form platforms through the same pure routing step", () => {
    const instagram = candidate("ig", "A customer retention system");
    const tiktok = candidate("tt", "A customer retention system");
    tiktok.platform = "tiktok";
    tiktok.sourceUrl = "https://www.tiktok.com/@creator/video/tt";
    const youtube = candidate("yt", "A customer retention system");
    youtube.platform = "youtube";
    youtube.sourceUrl = "https://www.youtube.com/shorts/yt";

    const routed = routeSemanticPoolCandidates({
      sourcePillar: "restaurant operations",
      candidates: [instagram, tiktok, youtube],
      verdicts: [
        verdict({ sourceId: "ig", primaryPillar: "restaurant operations" }),
        verdict({ sourceId: "tt", primaryPillar: "restaurant operations" }),
        verdict({ sourceId: "yt", primaryPillar: "restaurant operations" }),
      ],
    });

    expect(routed.currentPool.map((row) => row.platform).sort()).toEqual([
      "instagram",
      "tiktok",
      "youtube",
    ]);
  });
});

describe("clipForPrompt", () => {
  it("never leaves half an emoji when the cut lands inside one", () => {
    const clipped = clipForPrompt("ab😀cd", 3); // "ab" + high surrogate
    expect(clipped).toBe("ab");
    expect(() => encodeURIComponent(clipped)).not.toThrow();
  });
  it("keeps whole emoji and squashes whitespace", () => {
    expect(clipForPrompt("  hi\n\n😀 there ", 50)).toBe("hi 😀 there");
    expect(clipForPrompt(null, 10)).toBe("");
  });
});
