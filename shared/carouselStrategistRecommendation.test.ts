import { describe, expect, it } from "vitest";
import {
  applyCarouselFormatRecommendation,
  CAROUSEL_FORMAT_RECOMMENDATION_MIN_CONFIDENCE,
  firstValidCarouselFormatRecommendation,
  normalizeCarouselFormatRecommendation,
  selectRecommendedCreativeBriefWithFormat,
} from "./carouselStrategistRecommendation";
import {
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  scoreCarouselCreativeBrief,
  selectRecommendedCreativeBrief,
  type CarouselContentFormat,
  type CarouselCreativeBrief,
} from "./carouselStudio";

function sampleOutline(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    role: i === 0 ? ("hook" as const) : i === count - 1 ? ("cta" as const) : ("insight" as const),
    objective: `Advance point ${i + 1} in one sentence.`,
    recommendedVisual: "text" as const,
    listItemIndex: null,
  }));
}

function sampleBrief(
  format: CarouselContentFormat,
  overallLead: "low" | "mid" | "high"
): CarouselCreativeBrief {
  const scoreSets = {
    low: {
      relevance: 70,
      usefulness: 70,
      specificity: 70,
      visualPotential: 70,
      factualSafety: 70,
      originality: 70,
    },
    mid: {
      relevance: 80,
      usefulness: 80,
      specificity: 80,
      visualPotential: 80,
      factualSafety: 80,
      originality: 80,
    },
    high: {
      relevance: 92,
      usefulness: 90,
      specificity: 88,
      visualPotential: 86,
      factualSafety: 94,
      originality: 88,
    },
  } as const;
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: `brief_${format}`,
    kicker: format,
    title: `${format} direction`,
    description: `A ${format} strategy.`,
    estimatedSlideCount: 7,
    topic: "restaurant operations",
    inferredAudience: "restaurant owners",
    audienceReasoning: "The source names restaurant operators.",
    contentGoal: "education",
    contentFormat: format,
    angleType: format === "story" ? "story" : format === "comparison" ? "contrarian" : "diagnostic",
    hook: `${format} hook`,
    corePromise: `${format} promise`,
    centralInsight: `${format} insight`,
    keyPoints: [
      { title: "One", explanation: "First useful point.", purpose: "Open the case." },
      { title: "Two", explanation: "Second useful point.", purpose: "Build proof." },
      { title: "Three", explanation: "Third useful point.", purpose: "Show the cost." },
      { title: "Four", explanation: "Fourth useful point.", purpose: "Close the loop." },
    ],
    slideOutline: sampleOutline(7),
    layoutFamily: format,
    visualDirection: "Clear cards.",
    imageDirection: "Neutral kitchen photos.",
    claimRisk: "medium",
    researchMode: "claim_verification",
    evidenceRequirements: ["Verify operational claims"],
    prohibitedClaims: ["Guaranteed profit"],
    ctaDirection: "Save this for the next decision",
    scores: scoreCarouselCreativeBrief(scoreSets[overallLead]),
    confidence: 0.8,
  };
}

function mixedSet() {
  return [
    sampleBrief("story", "high"),
    sampleBrief("breakdown", "mid"),
    sampleBrief("comparison", "low"),
  ];
}

describe("normalizeCarouselFormatRecommendation", () => {
  it("accepts a valid contentFormat and clamped confidence", () => {
    expect(
      normalizeCarouselFormatRecommendation({
        recommendedFormat: "comparison",
        formatConfidence: 0.86,
      })
    ).toEqual({ recommendedFormat: "comparison", formatConfidence: 0.86 });
    expect(
      normalizeCarouselFormatRecommendation({
        recommendedFormat: "story",
        formatConfidence: 1.4,
      })
    ).toEqual({ recommendedFormat: "story", formatConfidence: 1 });
  });

  it("rejects malformed LLM metadata", () => {
    expect(normalizeCarouselFormatRecommendation(null)).toBeNull();
    expect(normalizeCarouselFormatRecommendation("comparison")).toBeNull();
    expect(
      normalizeCarouselFormatRecommendation({
        recommendedFormat: "listicle",
        formatConfidence: 0.9,
      })
    ).toBeNull();
    expect(
      normalizeCarouselFormatRecommendation({
        recommendedFormat: "comparison",
        formatConfidence: "high",
      })
    ).toBeNull();
    expect(
      normalizeCarouselFormatRecommendation({
        recommendedFormat: "comparison",
      })
    ).toBeNull();
  });
});

describe("applyCarouselFormatRecommendation", () => {
  it("uses a valid high-confidence recommendation without rewriting scores", () => {
    const briefs = mixedSet();
    const storyOverall = briefs[0]!.scores.overall;
    const picked = selectRecommendedCreativeBriefWithFormat({
      briefs,
      recommendation: { recommendedFormat: "comparison", formatConfidence: 0.88 },
    });
    expect(picked.brief?.contentFormat).toBe("comparison");
    expect(briefs.find((brief) => brief.contentFormat === "story")?.scores.overall).toBe(
      storyOverall
    );
    expect(selectRecommendedCreativeBrief(briefs).brief?.contentFormat).toBe("story");
  });

  it("falls back to score ranking when confidence is below the gate", () => {
    const briefs = mixedSet();
    const picked = selectRecommendedCreativeBriefWithFormat({
      briefs,
      recommendation: {
        recommendedFormat: "comparison",
        formatConfidence: CAROUSEL_FORMAT_RECOMMENDATION_MIN_CONFIDENCE - 0.05,
      },
    });
    expect(picked.brief?.contentFormat).toBe("story");
  });

  it("falls back when recommendation metadata is missing", () => {
    const briefs = mixedSet();
    const picked = selectRecommendedCreativeBriefWithFormat({
      briefs,
      recommendation: null,
    });
    expect(picked.brief?.contentFormat).toBe(
      selectRecommendedCreativeBrief(briefs).brief?.contentFormat
    );
  });

  it("falls back when the recommended format is not among the candidates", () => {
    const briefs = mixedSet();
    const picked = selectRecommendedCreativeBriefWithFormat({
      briefs,
      recommendation: { recommendedFormat: "framework", formatConfidence: 0.95 },
    });
    expect(picked.brief?.contentFormat).toBe("story");
  });

  it("protects an explicit numbered list contract over a contrast recommendation", () => {
    const briefs = mixedSet();
    const picked = selectRecommendedCreativeBriefWithFormat({
      briefs,
      recommendation: { recommendedFormat: "comparison", formatConfidence: 0.99 },
      sourceContent: "5 restaurant equipment mistakes",
    });
    expect(picked.brief?.contentFormat).toBe("breakdown");
  });

  it("keeps Story when the strategist recommends Story despite higher Comparison temptation in scores", () => {
    const briefs = [
      sampleBrief("comparison", "high"),
      sampleBrief("story", "mid"),
      sampleBrief("breakdown", "low"),
    ];
    const picked = selectRecommendedCreativeBriefWithFormat({
      briefs,
      recommendation: { recommendedFormat: "story", formatConfidence: 0.9 },
    });
    expect(picked.brief?.contentFormat).toBe("story");
  });

  it("keeps Roadmap when the strategist recommends Roadmap", () => {
    const briefs = [
      sampleBrief("comparison", "high"),
      sampleBrief("roadmap", "mid"),
      sampleBrief("framework", "low"),
    ];
    const picked = selectRecommendedCreativeBriefWithFormat({
      briefs,
      recommendation: { recommendedFormat: "roadmap", formatConfidence: 0.83 },
    });
    expect(picked.brief?.contentFormat).toBe("roadmap");
  });

  it("keeps Framework when the strategist recommends Framework", () => {
    const briefs = [
      sampleBrief("comparison", "high"),
      sampleBrief("framework", "mid"),
      sampleBrief("story", "low"),
    ];
    const picked = selectRecommendedCreativeBriefWithFormat({
      briefs,
      recommendation: { recommendedFormat: "framework", formatConfidence: 0.84 },
    });
    expect(picked.brief?.contentFormat).toBe("framework");
  });

  it("does not mutate brief scores while reordering", () => {
    const briefs = mixedSet();
    const before = briefs.map((brief) => brief.scores.overall);
    const ranked = applyCarouselFormatRecommendation(briefs, {
      recommendedFormat: "comparison",
      formatConfidence: 0.9,
    });
    expect(ranked.map((brief) => brief.scores.overall)).toEqual(
      expect.arrayContaining(before)
    );
    expect(briefs.map((brief) => brief.scores.overall)).toEqual(before);
  });
});

describe("firstValidCarouselFormatRecommendation", () => {
  it("keeps the first valid recommendation through a later empty repair", () => {
    expect(
      firstValidCarouselFormatRecommendation(
        { recommendedFormat: "story", formatConfidence: 0.81 },
        null
      )
    ).toEqual({ recommendedFormat: "story", formatConfidence: 0.81 });
    expect(
      firstValidCarouselFormatRecommendation(null, {
        recommendedFormat: "breakdown",
        formatConfidence: 0.77,
      })
    ).toEqual({ recommendedFormat: "breakdown", formatConfidence: 0.77 });
  });
});
