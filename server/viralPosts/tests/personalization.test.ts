import { describe, expect, it } from "vitest";
import type { AdaptedCandidate } from "../candidateAdapter";
import {
  canonicalCandidateKey,
  personalizationRelevanceBoost,
  type ViralPersonalizationSignals,
} from "../personalization";

function emptySignals(): ViralPersonalizationSignals {
  return {
    strongCreatorHandles: new Set(),
    radarCreatorHandles: new Set(),
    preferredFormats: new Map(),
    topicTerms: new Map(),
    collectedSourceKeys: new Set(),
  };
}

function candidate(
  overrides: Partial<AdaptedCandidate> = {}
): AdaptedCandidate {
  return {
    platform: "instagram",
    sourceId: "abc123",
    sourceUrl: "https://www.instagram.com/reel/abc123/",
    creatorId: "pricingcreator",
    creatorName: "Pricing Creator",
    creatorHandle: "@pricingcreator",
    creatorAvatarUrl: null,
    creatorFollowers: 100_000,
    thumbnailUrl: null,
    videoUrl: null,
    caption: "3 pricing mistakes restaurant owners should stop making",
    transcript: null,
    hashtags: ["pricing"],
    publishedAt: new Date("2026-09-01T00:00:00Z"),
    views: 500_000,
    likes: 20_000,
    comments: 500,
    shares: null,
    saves: null,
    reachMultiplier: 5,
    engagementRate: 0.041,
    viewsPerHour: 10_000,
    trendStatus: "proven-format",
    relevanceHint: 75,
    contentPillar: "restaurant profitability",
    relevanceLabel: "Matches restaurant profitability",
    relevanceReason: "test",
    hook: "3 pricing mistakes restaurant owners should stop making",
    format: "list",
    hashtagKey: "pricing",
    rawProviderPayload: {},
    ...overrides,
  };
}

describe("viralPosts personalization", () => {
  it("adds no relevance when the user has no private signals", () => {
    expect(personalizationRelevanceBoost(candidate(), emptySignals())).toBe(0);
  });

  it("gives explicit creator and Collected affinity more weight than passive Radar", () => {
    const passive = emptySignals();
    passive.radarCreatorHandles.add("pricingcreator");

    const explicit = emptySignals();
    explicit.strongCreatorHandles.add("pricingcreator");
    explicit.collectedSourceKeys.add("instagram:abc123");

    const passiveBoost = personalizationRelevanceBoost(candidate(), passive);
    const explicitBoost = personalizationRelevanceBoost(candidate(), explicit);

    expect(passiveBoost).toBeGreaterThan(0);
    expect(explicitBoost).toBeGreaterThan(passiveBoost);
  });

  it("uses format/topic affinity but caps the total boost at 30 points", () => {
    const signals = emptySignals();
    signals.strongCreatorHandles.add("pricingcreator");
    signals.collectedSourceKeys.add("instagram:abc123");
    signals.preferredFormats.set("list", 5);
    signals.topicTerms.set("pricing", 6);
    signals.topicTerms.set("restaurant", 6);
    signals.topicTerms.set("mistakes", 6);

    expect(personalizationRelevanceBoost(candidate(), signals)).toBe(30);
  });

  it("treats platform + sourceId as the canonical recommendation identity", () => {
    expect(
      canonicalCandidateKey({ platform: "instagram", sourceId: "same-id" })
    ).toBe("instagram:same-id");
    expect(
      canonicalCandidateKey({ platform: "tiktok", sourceId: "same-id" })
    ).toBe("tiktok:same-id");
    expect(
      canonicalCandidateKey({ platform: "youtube", sourceId: "same-id" })
    ).toBe("youtube:same-id");
  });
});
