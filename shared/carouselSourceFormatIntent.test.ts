import { describe, expect, it } from "vitest";
import {
  applyCarouselSourceFormatFitToBriefs,
  inferCarouselSourceFormatIntent,
  type CarouselSourceFormatIntent,
} from "./carouselSourceFormatIntent";
import {
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  rankCarouselCreativeBriefs,
  scoreCarouselCreativeBrief,
  selectRecommendedCreativeBrief,
  type CarouselContentFormat,
  type CarouselCreativeBrief,
} from "./carouselStudio";

export const CAROUSEL_STRATEGIST_BENCHMARK_V1: Array<{
  id: string;
  bucket: "comparison" | "story" | "breakdown" | "framework" | "ambiguous";
  prompt: string;
  expectedIntent: CarouselSourceFormatIntent;
}> = [
  {
    id: "cmp-cheap-equipment",
    bucket: "comparison",
    prompt:
      "Cheap restaurant equipment vs buying the right equipment the first time",
    expectedIntent: "comparison",
  },
  {
    id: "cmp-large-menu",
    bucket: "comparison",
    prompt: "Large restaurant menu vs focused restaurant menu",
    expectedIntent: "comparison",
  },
  {
    id: "cmp-repair-replace",
    bucket: "comparison",
    prompt: "Repair vs replace restaurant equipment",
    expectedIntent: "comparison",
  },
  {
    id: "cmp-delivery",
    bucket: "comparison",
    prompt: "In-house delivery vs third-party delivery",
    expectedIntent: "comparison",
  },
  {
    id: "cmp-discounting",
    bucket: "comparison",
    prompt: "Discounting vs adding value",
    expectedIntent: "comparison",
  },
  {
    id: "cmp-frozen-fresh",
    bucket: "comparison",
    prompt: "Frozen food vs fresh prep for margins",
    expectedIntent: "comparison",
  },
  {
    id: "story-stopped-cheap",
    bucket: "story",
    prompt: "Why I stopped buying the cheapest restaurant equipment",
    expectedIntent: "story",
  },
  {
    id: "story-nearly-shut-down",
    bucket: "story",
    prompt: "The mistake that nearly shut down my restaurant",
    expectedIntent: "story",
  },
  {
    id: "story-menu-change",
    bucket: "story",
    prompt: "How one menu change saved our kitchen",
    expectedIntent: "story",
  },
  {
    id: "story-cut-menu",
    bucket: "story",
    prompt: "What happened after we cut 30% of the menu",
    expectedIntent: "story",
  },
  {
    id: "brk-equipment-mistakes",
    bucket: "breakdown",
    prompt: "5 restaurant equipment mistakes",
    expectedIntent: "breakdown",
  },
  {
    id: "brk-pricing-mistakes",
    bucket: "breakdown",
    prompt: "7 menu pricing mistakes",
    expectedIntent: "breakdown",
  },
  {
    id: "brk-walk-in-signs",
    bucket: "breakdown",
    prompt: "4 signs your walk-in is failing",
    expectedIntent: "breakdown",
  },
  {
    id: "brk-labor-ways",
    bucket: "breakdown",
    prompt: "6 ways restaurants lose money on labor",
    expectedIntent: "breakdown",
  },
  {
    id: "fw-add-menu-item",
    bucket: "framework",
    prompt: "A 4-part framework for deciding whether to add a menu item",
    expectedIntent: "framework",
  },
  {
    id: "fw-repair-or-replace",
    bucket: "framework",
    prompt: "The framework I use to decide repair or replace",
    expectedIntent: "framework",
  },
  {
    id: "fw-expansion",
    bucket: "framework",
    prompt: "A simple restaurant expansion decision framework",
    expectedIntent: "framework",
  },
  {
    id: "amb-replace-fryer",
    bucket: "ambiguous",
    prompt: "Should I replace my fryer?",
    expectedIntent: "ambiguous",
  },
  {
    id: "amb-simplify-menu",
    bucket: "ambiguous",
    prompt: "How to simplify a restaurant menu",
    expectedIntent: "ambiguous",
  },
  {
    id: "amb-food-cost",
    bucket: "ambiguous",
    prompt: "The best way to reduce food cost",
    expectedIntent: "ambiguous",
  },
];

/** Typical LLM self-scores where Story/Framework beat Comparison on overall. */
const PRODUCTION_LIKE_SCORES = {
  story: {
    relevance: 86,
    usefulness: 82,
    specificity: 78,
    visualPotential: 76,
    factualSafety: 92,
    originality: 84,
  },
  framework: {
    relevance: 88,
    usefulness: 86,
    specificity: 82,
    visualPotential: 74,
    factualSafety: 88,
    originality: 72,
  },
  breakdown: {
    relevance: 84,
    usefulness: 88,
    specificity: 80,
    visualPotential: 78,
    factualSafety: 86,
    originality: 70,
  },
  comparison: {
    relevance: 82,
    usefulness: 80,
    specificity: 80,
    visualPotential: 88,
    factualSafety: 70,
    originality: 76,
  },
} as const;

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
  overrides: Partial<Pick<CarouselCreativeBrief, "id" | "title" | "description">> = {}
): CarouselCreativeBrief {
  const scoreKey = format === "roadmap" ? "breakdown" : format;
  const scores = scoreCarouselCreativeBrief(PRODUCTION_LIKE_SCORES[scoreKey]);
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: overrides.id ?? `brief_${format}`,
    kicker: format,
    title: overrides.title ?? `${format} direction`,
    description: overrides.description ?? `A ${format} strategy.`,
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
    researchMode: format === "story" ? "none" : "claim_verification",
    evidenceRequirements: ["Verify operational claims"],
    prohibitedClaims: ["Guaranteed profit"],
    ctaDirection: "Save this for the next decision",
    scores,
    confidence: 0.8,
  };
}

function mixedCandidateSet() {
  return [
    sampleBrief("story", { id: "brief_story" }),
    sampleBrief("breakdown", { id: "brief_breakdown" }),
    sampleBrief("comparison", { id: "brief_comparison" }),
  ];
}

function recommendedFormat(source: string, briefs = mixedCandidateSet()) {
  const ranked = rankCarouselCreativeBriefs(
    applyCarouselSourceFormatFitToBriefs(briefs, source)
  );
  return ranked[0]?.contentFormat ?? null;
}

describe("inferCarouselSourceFormatIntent", () => {
  it("classifies the 20-prompt strategist benchmark", () => {
    const rows = CAROUSEL_STRATEGIST_BENCHMARK_V1.map((row) => ({
      id: row.id,
      expected: row.expectedIntent,
      actual: inferCarouselSourceFormatIntent(row.prompt).format,
    }));
    expect(rows).toEqual(
      CAROUSEL_STRATEGIST_BENCHMARK_V1.map((row) => ({
        id: row.id,
        expected: row.expectedIntent,
        actual: row.expectedIntent,
      }))
    );
  });

  it("does not treat vs wording as automatic comparison when the core idea is narrative", () => {
    const intent = inferCarouselSourceFormatIntent(
      "Why I switched from Android to iPhone after 10 years"
    );
    expect(intent.format).toBe("story");
    expect(intent.strength).toBe("strong");
  });

  it("favors comparison when two alternatives are the decision, not a story", () => {
    const intent = inferCarouselSourceFormatIntent(
      "Android vs iPhone: which is better for restaurant owners?"
    );
    expect(intent.format).toBe("comparison");
    expect(intent.strength).toBe("strong");
  });

  it("keeps an explicit numbered list as breakdown even if one item sounds better", () => {
    expect(
      inferCarouselSourceFormatIntent("5 reasons Android is better").format
    ).toBe("breakdown");
  });
});

describe("carousel strategist ranking with format-fit", () => {
  it("lets a strong semantic comparison outrank Story on production-like scores", () => {
    const source =
      "Cheap restaurant equipment vs buying the right equipment the first time";
    const briefs = mixedCandidateSet();

    const before = selectRecommendedCreativeBrief(briefs);
    expect(before.brief?.contentFormat).toBe("story");
    expect(briefs.find((brief) => brief.contentFormat === "comparison")?.scores.overall)
      .toBeLessThan(briefs.find((brief) => brief.contentFormat === "story")!.scores.overall);

    const after = selectRecommendedCreativeBrief(
      applyCarouselSourceFormatFitToBriefs(briefs, source)
    );
    expect(after.brief?.contentFormat).toBe("comparison");
    expect(after.brief?.id).toBe("brief_comparison");
  });

  it("still allows Story when the wording is narrative", () => {
    const briefs = mixedCandidateSet();
    const after = selectRecommendedCreativeBrief(
      applyCarouselSourceFormatFitToBriefs(
        briefs,
        "Why I stopped buying the cheapest restaurant equipment"
      )
    );
    expect(after.brief?.contentFormat).toBe("story");
  });

  it("keeps an explicit numbered list as Breakdown", () => {
    const briefs = [
      sampleBrief("story", { id: "brief_story" }),
      sampleBrief("breakdown", { id: "brief_breakdown" }),
      sampleBrief("comparison", { id: "brief_comparison" }),
    ];
    const after = selectRecommendedCreativeBrief(
      applyCarouselSourceFormatFitToBriefs(briefs, "5 restaurant equipment mistakes")
    );
    expect(after.brief?.contentFormat).toBe("breakdown");
  });

  it("does not steal a Framework prompt for Comparison", () => {
    const briefs = [
      sampleBrief("framework", { id: "brief_framework" }),
      sampleBrief("story", { id: "brief_story" }),
      sampleBrief("comparison", { id: "brief_comparison" }),
    ];
    const after = selectRecommendedCreativeBrief(
      applyCarouselSourceFormatFitToBriefs(
        briefs,
        "The framework I use to decide repair or replace"
      )
    );
    expect(after.brief?.contentFormat).toBe("framework");
  });

  it("leaves ambiguous prompts flexible to raw scores", () => {
    const briefs = mixedCandidateSet();
    const before = selectRecommendedCreativeBrief(briefs);
    const after = selectRecommendedCreativeBrief(
      applyCarouselSourceFormatFitToBriefs(briefs, "Should I replace my fryer?")
    );
    expect(after.brief?.contentFormat).toBe(before.brief?.contentFormat);
    expect(after.brief?.scores.overall).toBe(before.brief?.scores.overall);
  });
});

describe("carousel strategist 20-prompt benchmark ranking", () => {
  it("recommends Comparison for at least 5 of 6 strong contrast prompts", () => {
    const comparisonPrompts = CAROUSEL_STRATEGIST_BENCHMARK_V1.filter(
      (row) => row.bucket === "comparison"
    );
    const hits = comparisonPrompts.filter(
      (row) => recommendedFormat(row.prompt) === "comparison"
    );
    expect(hits.map((row) => row.id)).toHaveLength(comparisonPrompts.length);
    expect(hits.length).toBeGreaterThanOrEqual(5);
  });

  it("does not reduce Story selection on narrative prompts", () => {
    const storyPrompts = CAROUSEL_STRATEGIST_BENCHMARK_V1.filter(
      (row) => row.bucket === "story"
    );
    for (const row of storyPrompts) {
      expect(recommendedFormat(row.prompt)).toBe("story");
    }
  });

  it("keeps numbered-list prompts on Breakdown", () => {
    const listPrompts = CAROUSEL_STRATEGIST_BENCHMARK_V1.filter(
      (row) => row.bucket === "breakdown"
    );
    for (const row of listPrompts) {
      expect(recommendedFormat(row.prompt)).toBe("breakdown");
    }
  });

  it("keeps named framework prompts on Framework", () => {
    const frameworkPrompts = CAROUSEL_STRATEGIST_BENCHMARK_V1.filter(
      (row) => row.bucket === "framework"
    );
    const briefs = [
      sampleBrief("framework", { id: "brief_framework" }),
      sampleBrief("story", { id: "brief_story" }),
      sampleBrief("comparison", { id: "brief_comparison" }),
    ];
    for (const row of frameworkPrompts) {
      expect(recommendedFormat(row.prompt, briefs)).toBe("framework");
    }
  });

  it("does not force Comparison on ambiguous prompts", () => {
    const ambiguousPrompts = CAROUSEL_STRATEGIST_BENCHMARK_V1.filter(
      (row) => row.bucket === "ambiguous"
    );
    for (const row of ambiguousPrompts) {
      const fitted = applyCarouselSourceFormatFitToBriefs(
        mixedCandidateSet(),
        row.prompt
      );
      const raw = mixedCandidateSet();
      expect(fitted.map((brief) => brief.scores.overall)).toEqual(
        raw.map((brief) => brief.scores.overall)
      );
    }
  });
});
