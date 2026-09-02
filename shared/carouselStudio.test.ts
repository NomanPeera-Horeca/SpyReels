import { describe, expect, it } from "vitest";
import {
  applyManualStudioSelection,
  applyStudioSelectionResponse,
  buildCreativeBriefSelectionTelemetry,
  buildReviewPlanViewModel,
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  clampCarouselBriefScore,
  deriveCarouselLibraryMeta,
  detectCarouselListContractFromBrief,
  detectExplicitCarouselListContract,
  expectedExplicitListicleSlideCount,
  findBriefByOriginalStoredIndex,
  formatApprovedCreativeBriefForCopy,
  formatCarouselListItemNumber,
  identityCarouselBriefEntries,
  isLegacyCreativeBrief,
  normalizeGeneratedCarouselBrief,
  normalizeGeneratedCarouselBriefs,
  normalizeStoredCarouselBriefEntries,
  normalizeStoredCarouselBriefs,
  normalizedIndexFromOriginalIndex,
  originalIndexFromNormalizedIndex,
  pendingStudioSelectionViewState,
  rankCarouselCreativeBriefs,
  researchModeLabel,
  resolveRecommendedStudioBrief,
  resolveUserSelectedStudioBrief,
  scoreCarouselCreativeBrief,
  selectRecommendedCreativeBrief,
  selectSemanticallyValidCarouselBriefs,
  stripSlideIntentMetadata,
  studioGenerateActionEnabled,
  validateCarouselBriefSemantics,
  validateCopyBriefAdherence,
  type CarouselCreativeBrief,
  type CarouselListContract,
} from "./carouselStudio";
import {
  CASH_DRAINS_REMAKE_67_BRIEF,
  OPEN_CASH_FLOW_USER_PROMPT,
} from "../server/carousel/tests/fixtures/cashDrainsRemake67";

const structure = [
  { id: "hook" },
  { id: "point_1" },
  { id: "cta" },
];

describe("deriveCarouselLibraryMeta", () => {
  it("prefers the first slide headline, then title, then kicker", () => {
    expect(
      deriveCarouselLibraryMeta({
        slideStructure: structure,
        slotValues: {
          hook: { headline: "Check weekly numbers", title: "Ignored", kicker: "Ignored" },
        },
        niche: "Restaurants",
      }).title
    ).toBe("Check weekly numbers");

    expect(
      deriveCarouselLibraryMeta({
        slideStructure: structure,
        slotValues: {
          hook: { title: "The 4 numbers", kicker: "Framework" },
        },
      }).title
    ).toBe("The 4 numbers");

    expect(
      deriveCarouselLibraryMeta({
        slideStructure: structure,
        slotValues: {
          hook: { kicker: "Contrarian" },
        },
      }).title
    ).toBe("Contrarian");
  });

  it("uses slideStructure order, not slotValues insertion order", () => {
    const result = deriveCarouselLibraryMeta({
      slideStructure: structure,
      slotValues: {
        cta: { headline: "Save this" },
        hook: { headline: "First slide wins" },
      },
    });
    expect(result.title).toBe("First slide wins");
    expect(result.slideCount).toBe(3);
  });

  it("falls back to niche, then Untitled carousel", () => {
    expect(
      deriveCarouselLibraryMeta({
        slideStructure: structure,
        slotValues: { hook: { body: "No title slots" } },
        niche: "Independent restaurants",
      }).title
    ).toBe("Independent restaurants");

    expect(
      deriveCarouselLibraryMeta({
        slideStructure: [],
        slotValues: {},
      }).title
    ).toBe("Untitled carousel");
  });

  it("counts only slides with ids in slideStructureJson", () => {
    expect(
      deriveCarouselLibraryMeta({
        slideStructure: [{ id: "a" }, { label: "skip" }, { id: "b" }, null],
        slotValues: {},
      }).slideCount
    ).toBe(2);

    expect(
      deriveCarouselLibraryMeta({
        slideStructure: null,
        slotValues: { hook: { headline: "x" } },
      }).slideCount
    ).toBe(0);
  });
});

function sampleOutline(count: number) {
  const middleRoles = [
    "hook",
    "context",
    "problem",
    "insight",
    "example",
    "takeaway",
  ] as const;
  return Array.from({ length: count }, (_, i) => {
    const isLast = i === count - 1;
    return {
      position: i + 1,
      role: isLast ? "cta" : middleRoles[Math.min(i, middleRoles.length - 1)]!,
      objective: `Cover beat ${i + 1} without repeating other slides.`,
      recommendedVisual: i === 0 ? "text" : "checklist",
    };
  });
}

function sampleKeyPoints(count = 4) {
  return Array.from({ length: count }, (_, i) => ({
    title: `Point ${i + 1}`,
    explanation: `Explain useful point ${i + 1} in one sentence.`,
    purpose: `Advance the argument at step ${i + 1}.`,
  }));
}

function sampleBrief(
  overrides: Partial<CarouselCreativeBrief> & {
    scores?: Partial<CarouselCreativeBrief["scores"]>;
  } = {}
): CarouselCreativeBrief {
  const estimatedSlideCount = overrides.estimatedSlideCount ?? 6;
  const scoreInput = overrides.scores ?? {};
  const scored = scoreCarouselCreativeBrief({
    relevance: scoreInput.relevance ?? 80,
    usefulness: scoreInput.usefulness ?? 70,
    specificity: scoreInput.specificity ?? 60,
    visualPotential: scoreInput.visualPotential ?? 50,
    factualSafety: scoreInput.factualSafety ?? 90,
    originality: scoreInput.originality ?? 40,
  });
  return {
    schemaVersion: CAROUSEL_CREATIVE_BRIEF_VERSION,
    isLegacy: false,
    id: overrides.id ?? "brief_1",
    kicker: overrides.kicker ?? "Diagnostic",
    title: overrides.title ?? "Cash is a system",
    description: overrides.description ?? "Show why cash runs out before profit.",
    estimatedSlideCount,
    topic: overrides.topic ?? "small business cash flow",
    inferredAudience: overrides.inferredAudience ?? "small business owners",
    audienceReasoning: overrides.audienceReasoning ?? "The source names this audience.",
    contentGoal: overrides.contentGoal ?? "education",
    contentFormat: overrides.contentFormat ?? "breakdown",
    angleType: overrides.angleType ?? "diagnostic",
    hook: overrides.hook ?? "Profit on paper, empty in the bank.",
    corePromise: overrides.corePromise ?? "See the cash leaks before they compound.",
    centralInsight: overrides.centralInsight ?? "Cash timing is the silent killer.",
    keyPoints: overrides.keyPoints ?? sampleKeyPoints(),
    slideOutline: overrides.slideOutline ?? sampleOutline(estimatedSlideCount),
    layoutFamily: overrides.layoutFamily ?? "breakdown",
    visualDirection: overrides.visualDirection ?? "Simple numbered breakdown cards.",
    imageDirection: overrides.imageDirection ?? "Neutral desk and ledger photos.",
    claimRisk: overrides.claimRisk ?? "medium",
    researchMode: overrides.researchMode ?? "claim_verification",
    evidenceRequirements: overrides.evidenceRequirements ?? ["Verify cash-cycle claims"],
    prohibitedClaims: overrides.prohibitedClaims ?? ["Guaranteed profit in 30 days"],
    ctaDirection: overrides.ctaDirection ?? "Save this cash-check list",
    scores: scored,
    confidence: overrides.confidence ?? 0.8,
  };
}

describe("scoreCarouselCreativeBrief", () => {
  it("computes overall server-side with the approved weights", () => {
    const scores = scoreCarouselCreativeBrief({
      relevance: 100,
      usefulness: 50,
      specificity: 25,
      visualPotential: 0,
      factualSafety: 100,
      originality: 50,
    });
    expect(scores.overall).toBe(
      Math.round(100 * 0.24 + 50 * 0.2 + 25 * 0.16 + 0 * 0.14 + 100 * 0.16 + 50 * 0.1)
    );
    expect(scores).not.toHaveProperty("overallFromModel");
  });

  it("clamps component scores to 0-100 and ignores an LLM overall", () => {
    const scores = scoreCarouselCreativeBrief({
      relevance: 140,
      usefulness: -20,
      specificity: 10,
      visualPotential: 10,
      factualSafety: 10,
      originality: 10,
      // @ts-expect-error overall must be computed server-side
      overall: 99,
    });
    expect(scores.relevance).toBe(100);
    expect(scores.usefulness).toBe(0);
    expect(scores.overall).not.toBe(99);
    expect(scores.overall).toBe(
      Math.round(100 * 0.24 + 0 * 0.2 + 10 * 0.16 + 10 * 0.14 + 10 * 0.16 + 10 * 0.1)
    );
  });

  it("treats NaN-like, Infinity, missing, and non-numeric strings as 0", () => {
    const scores = scoreCarouselCreativeBrief({
      relevance: Number.NaN,
      usefulness: Number.POSITIVE_INFINITY,
      specificity: Number.NEGATIVE_INFINITY,
      visualPotential: "not-a-score",
      factualSafety: undefined,
      originality: null,
    });
    expect(scores).toEqual({
      relevance: 0,
      usefulness: 0,
      specificity: 0,
      visualPotential: 0,
      factualSafety: 0,
      originality: 0,
      overall: 0,
    });
  });

  it("accepts only finite JS numbers and never Number() coerces strings", () => {
    expect(clampCarouselBriefScore(80)).toBe(80);
    expect(clampCarouselBriefScore(-10)).toBe(0);
    expect(clampCarouselBriefScore(140)).toBe(100);
    expect(clampCarouselBriefScore(Number.NaN)).toBe(0);
    expect(clampCarouselBriefScore(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampCarouselBriefScore(undefined)).toBe(0);
    expect(clampCarouselBriefScore(null)).toBe(0);
    expect(clampCarouselBriefScore("80")).toBe(0);
    expect(clampCarouselBriefScore("999")).toBe(0);
    expect(clampCarouselBriefScore({ value: 80 })).toBe(0);
    expect(clampCarouselBriefScore([80])).toBe(0);
  });
});

describe("selectRecommendedCreativeBrief", () => {
  it("does not pick array position zero when a later brief scores higher", () => {
    const briefs = [
      sampleBrief({ id: "brief_1", scores: { overall: 40, relevance: 40 } }),
      sampleBrief({ id: "brief_2", scores: { overall: 88, relevance: 90 } }),
      sampleBrief({ id: "brief_3", scores: { overall: 70, relevance: 70 } }),
    ];
    const picked = selectRecommendedCreativeBrief(briefs);
    expect(picked.index).toBe(1);
    expect(picked.brief?.id).toBe("brief_2");
    expect(briefs.map((brief) => brief.id)).toEqual([
      "brief_1",
      "brief_2",
      "brief_3",
    ]);
  });

  it("breaks ties with factualSafety, then usefulness, then relevance, then lower index", () => {
    const tied = scoreCarouselCreativeBrief({
      relevance: 80,
      usefulness: 80,
      specificity: 80,
      visualPotential: 80,
      factualSafety: 80,
      originality: 80,
    });
    const a = { ...sampleBrief({ id: "brief_1" }), scores: tied };
    const b = {
      ...sampleBrief({ id: "brief_2" }),
      scores: { ...tied, factualSafety: 95 },
    };
    expect(selectRecommendedCreativeBrief([a, b]).index).toBe(1);

    const c = {
      ...sampleBrief({ id: "brief_1" }),
      scores: { ...tied, usefulness: 60 },
    };
    const d = {
      ...sampleBrief({ id: "brief_2" }),
      scores: { ...tied, usefulness: 90 },
    };
    expect(selectRecommendedCreativeBrief([c, d]).index).toBe(1);

    const e = { ...sampleBrief({ id: "brief_1" }), scores: tied };
    const f = { ...sampleBrief({ id: "brief_2" }), scores: tied };
    expect(selectRecommendedCreativeBrief([e, f]).index).toBe(0);
  });

  it("does not let malformed scores beat a finite scored brief", () => {
    const malformed = {
      ...sampleBrief({ id: "brief_1" }),
      scores: scoreCarouselCreativeBrief({
        relevance: Number.NaN,
        usefulness: Number.POSITIVE_INFINITY,
        specificity: "999",
        visualPotential: -50,
        factualSafety: 140,
        originality: "abc",
        // @ts-expect-error overall must be computed server-side
        overall: 100,
      }),
    };
    const valid = sampleBrief({
      id: "brief_2",
      scores: {
        relevance: 70,
        usefulness: 70,
        specificity: 70,
        visualPotential: 70,
        factualSafety: 70,
        originality: 70,
      },
    });
    const picked = selectRecommendedCreativeBrief([malformed, valid]);
    expect(malformed.scores.overall).toBeLessThan(valid.scores.overall);
    expect(picked.index).toBe(1);
    expect(picked.brief?.id).toBe("brief_2");
    expect([malformed.id, valid.id]).toEqual(["brief_1", "brief_2"]);
  });

  it("returns null index and null brief for an empty array", () => {
    expect(selectRecommendedCreativeBrief([])).toEqual({
      index: null,
      brief: null,
    });
  });

  it("ranks briefs with the same comparison used for recommendation", () => {
    const briefs = [
      sampleBrief({ id: "brief_1", scores: { overall: 40, relevance: 40 } }),
      sampleBrief({ id: "brief_2", scores: { overall: 88, relevance: 90 } }),
      sampleBrief({ id: "brief_3", scores: { overall: 70, relevance: 70 } }),
    ];
    expect(rankCarouselCreativeBriefs(briefs).map((brief) => brief.id)).toEqual([
      "brief_2",
      "brief_3",
      "brief_1",
    ]);
  });

  it("keeps original order when overall scores are equal and later tie-breaks decide", () => {
    const base = scoreCarouselCreativeBrief({
      relevance: 70,
      usefulness: 70,
      specificity: 70,
      visualPotential: 70,
      factualSafety: 70,
      originality: 70,
    });
    const first = { ...sampleBrief({ id: "brief_1" }), scores: base };
    const second = {
      ...sampleBrief({ id: "brief_2" }),
      scores: { ...base, relevance: 90 },
    };
    const picked = selectRecommendedCreativeBrief([first, second]);
    expect(first.scores.overall).toBe(second.scores.overall);
    expect(picked.index).toBe(1);
    expect([first.id, second.id]).toEqual(["brief_1", "brief_2"]);
  });
});

describe("legacy angleOptionsJson normalize", () => {
  const validLegacy = {
    kicker: "Contrarian",
    title: "Stop chasing profit first",
    description: "Show the cash timing trap.",
    estimatedSlideCount: 7,
  };

  it("normalizes valid historic four-field angles as schemaVersion 1", () => {
    const briefs = normalizeStoredCarouselBriefs([validLegacy]);
    expect(briefs).toHaveLength(1);
    expect(briefs[0]?.title).toBe("Stop chasing profit first");
    expect(briefs[0]?.kicker).toBe("Contrarian");
    expect(briefs[0]?.description).toBe("Show the cash timing trap.");
    expect(briefs[0]?.estimatedSlideCount).toBe(7);
    expect(briefs[0]?.schemaVersion).toBe(1);
    expect(briefs[0]?.isLegacy).toBe(true);
    expect(isLegacyCreativeBrief(briefs[0]!)).toBe(true);
  });

  it("keeps a valid modern schemaVersion 2 brief", () => {
    const modern = sampleBrief({ title: "Modern cash system" });
    const briefs = normalizeStoredCarouselBriefs([modern]);
    expect(briefs).toHaveLength(1);
    expect(briefs[0]?.schemaVersion).toBe(2);
    expect(briefs[0]?.isLegacy).toBe(false);
    expect(isLegacyCreativeBrief(briefs[0]!)).toBe(false);
    expect(briefs[0]?.title).toBe("Modern cash system");
  });

  it("drops malformed modern records instead of downgrading them to legacy", () => {
    const malformedModern = {
      kicker: "Diagnostic",
      title: "Broken modern plan",
      description: "Has modern fields but is incomplete.",
      estimatedSlideCount: 6,
      topic: "small business cash flow",
      contentGoal: "education",
    };
    const briefs = normalizeStoredCarouselBriefs([malformedModern]);
    expect(briefs).toHaveLength(0);
  });

  it("drops garbage records", () => {
    expect(
      normalizeStoredCarouselBriefs([{ notABrief: true, scores: { overall: 100 } }])
    ).toEqual([]);
  });

  it("does not treat missing estimatedSlideCount as valid legacy", () => {
    let briefs: ReturnType<typeof normalizeStoredCarouselBriefs> = [];
    expect(() => {
      briefs = normalizeStoredCarouselBriefs([
        { kicker: "A", title: "B", description: "C" },
      ]);
    }).not.toThrow();
    expect(briefs).toHaveLength(0);
  });

  it("keeps a mixed stored array of all four shapes without throwing", () => {
    const modern = sampleBrief({
      id: "model_id_ignored",
      title: "Modern cash system",
    });
    const malformedModern = {
      kicker: "Diagnostic",
      title: "Broken modern plan",
      description: "Has modern fields but is incomplete.",
      estimatedSlideCount: 6,
      topic: "small business cash flow",
      contentGoal: "education",
    };
    const mixed = [
      validLegacy,
      modern,
      malformedModern,
      { notABrief: true, scores: { overall: 100 } },
    ];

    let briefs: ReturnType<typeof normalizeStoredCarouselBriefs> = [];
    expect(() => {
      briefs = normalizeStoredCarouselBriefs(mixed);
    }).not.toThrow();
    expect(briefs).toHaveLength(2);
    expect(briefs[0]?.title).toBe("Stop chasing profit first");
    expect(isLegacyCreativeBrief(briefs[0]!)).toBe(true);
    expect(briefs[0]?.schemaVersion).toBe(1);
    expect(briefs[1]?.title).toBe("Modern cash system");
    expect(isLegacyCreativeBrief(briefs[1]!)).toBe(false);
    expect(briefs[1]?.schemaVersion).toBe(2);
    expect(briefs[1]?.id).toBe("brief_2");
    expect(briefs.map((brief) => brief.title)).toEqual([
      "Stop chasing profit first",
      "Modern cash system",
    ]);
  });
});

describe("generated brief validation", () => {
  it("requires slideOutline length to match estimatedSlideCount", () => {
    const raw = {
      ...sampleBrief({ estimatedSlideCount: 6 }),
      slideOutline: sampleOutline(4),
    };
    expect(normalizeGeneratedCarouselBrief(raw, 0)).toBeNull();
  });

  it("requires 4-8 keyPoints", () => {
    expect(
      normalizeGeneratedCarouselBrief(
        { ...sampleBrief(), keyPoints: sampleKeyPoints(2) },
        0
      )
    ).toBeNull();
    expect(
      normalizeGeneratedCarouselBrief(
        { ...sampleBrief(), keyPoints: sampleKeyPoints(4) },
        0
      )
    ).not.toBeNull();
  });

  it("requires contentFormat to match layoutFamily", () => {
    expect(
      normalizeGeneratedCarouselBrief(
        sampleBrief({ contentFormat: "story", layoutFamily: "story" }),
        0
      )
    ).not.toBeNull();
    expect(
      normalizeGeneratedCarouselBrief(
        sampleBrief({ contentFormat: "breakdown", layoutFamily: "breakdown" }),
        0
      )
    ).not.toBeNull();
    expect(
      normalizeGeneratedCarouselBrief(
        sampleBrief({ contentFormat: "story", layoutFamily: "framework" }),
        0
      )
    ).toBeNull();
  });

  it("drops a format/layout mismatch instead of accepting it among three candidates", () => {
    const briefs = normalizeGeneratedCarouselBriefs([
      sampleBrief({
        title: "Story plan",
        contentFormat: "story",
        layoutFamily: "story",
      }),
      sampleBrief({
        title: "Mismatched plan",
        contentFormat: "story",
        layoutFamily: "framework",
      }),
      sampleBrief({
        title: "Breakdown plan",
        contentFormat: "breakdown",
        layoutFamily: "breakdown",
      }),
    ]);
    expect(briefs).toHaveLength(2);
    expect(briefs.map((brief) => brief.title)).toEqual([
      "Story plan",
      "Breakdown plan",
    ]);
  });

  it("assigns brief ids and schemaVersion server-side and computes overall", () => {
    const raw = {
      ...sampleBrief(),
      id: "model_made_this",
      schemaVersion: 99,
      isLegacy: true,
      scores: {
        relevance: 80,
        usefulness: 80,
        specificity: 80,
        visualPotential: 80,
        factualSafety: 80,
        originality: 80,
        overall: 12,
      },
    };
    const brief = normalizeGeneratedCarouselBrief(raw, 2);
    expect(brief?.id).toBe("brief_3");
    expect(brief?.schemaVersion).toBe(2);
    expect(brief?.isLegacy).toBe(false);
    expect(brief?.scores.overall).toBe(80);
  });
});

describe("Review Plan view-model helpers", () => {
  it("renders one recommended card and no alternatives for a single brief", () => {
    const briefs = [sampleBrief({ id: "brief_1", title: "Only plan" })];
    const model = buildReviewPlanViewModel({
      briefs,
      recommendedBriefIndex: 0,
      selectedIndex: 0,
    });
    expect(model.recommended?.index).toBe(0);
    expect(model.recommended?.brief.title).toBe("Only plan");
    expect(model.alternatives).toHaveLength(0);
    expect(model.cards).toHaveLength(1);
  });

  it("renders one recommended card and one alternative for two briefs", () => {
    const briefs = [
      sampleBrief({ id: "brief_1", title: "First plan" }),
      sampleBrief({ id: "brief_2", title: "Second plan" }),
    ];
    const model = buildReviewPlanViewModel({
      briefs,
      recommendedBriefIndex: 1,
      selectedIndex: 1,
    });
    expect(model.recommended?.index).toBe(1);
    expect(model.alternatives).toHaveLength(1);
    expect(model.alternatives[0]?.index).toBe(0);
    expect(model.cards).toHaveLength(2);
  });

  it("marks recommended and selected plans correctly", () => {
    const briefs = [
      sampleBrief({ id: "brief_1", title: "Low" }),
      sampleBrief({ id: "brief_2", title: "High" }),
      sampleBrief({ id: "brief_3", title: "Mid" }),
    ];
    const model = buildReviewPlanViewModel({
      briefs,
      recommendedBriefIndex: 1,
      selectedIndex: 2,
    });
    expect(model.recommended?.index).toBe(1);
    expect(model.recommended?.isRecommended).toBe(true);
    expect(model.recommended?.isSelected).toBe(false);
    expect(model.alternatives).toHaveLength(2);
    expect(model.cards[2]?.isSelected).toBe(true);
    expect(model.cards[2]?.isRecommended).toBe(false);
  });

  it("labels a legacy brief as not evaluated", () => {
    const [legacy] = normalizeStoredCarouselBriefs([
      {
        kicker: "Contrarian",
        title: "Stop chasing profit first",
        description: "Show the cash timing trap.",
        estimatedSlideCount: 7,
      },
    ]);
    expect(isLegacyCreativeBrief(legacy!)).toBe(true);
    expect(legacy!.schemaVersion).toBe(1);
    expect(legacy!.researchMode).toBe("none");
    expect(researchModeLabel(legacy!)).toBe("Not evaluated");
    const model = buildReviewPlanViewModel({
      briefs: [legacy!],
      recommendedBriefIndex: 0,
      selectedIndex: 0,
    });
    expect(model.cards[0]?.researchLabel).toBe("Not evaluated");
  });

  it("labels a modern none brief as no research required", () => {
    const brief = sampleBrief({ researchMode: "none" });
    expect(isLegacyCreativeBrief(brief)).toBe(false);
    expect(researchModeLabel(brief)).toBe("No research required");
    const model = buildReviewPlanViewModel({
      briefs: [brief],
      recommendedBriefIndex: 0,
      selectedIndex: 0,
    });
    expect(model.cards[0]?.researchLabel).toBe("No research required");
  });

  it("labels a modern claim_verification brief as claims should be verified", () => {
    const brief = sampleBrief({ researchMode: "claim_verification" });
    expect(isLegacyCreativeBrief(brief)).toBe(false);
    expect(researchModeLabel(brief)).toBe("Claims should be verified");
    const model = buildReviewPlanViewModel({
      briefs: [brief],
      recommendedBriefIndex: 0,
      selectedIndex: 0,
    });
    expect(model.cards[0]?.researchLabel).toBe("Claims should be verified");
  });

  it("labels a modern research_required brief as research required before publishing", () => {
    const brief = sampleBrief({ researchMode: "research_required" });
    expect(isLegacyCreativeBrief(brief)).toBe(false);
    expect(researchModeLabel(brief)).toBe(
      "Research required before publishing"
    );
    const model = buildReviewPlanViewModel({
      briefs: [brief],
      recommendedBriefIndex: 0,
      selectedIndex: 0,
    });
    expect(model.cards[0]?.researchLabel).toBe(
      "Research required before publishing"
    );
  });
});

describe("studio brief selection helpers", () => {
  it("generateFromInput helper uses recommendedBriefIndex rather than index zero", () => {
    const briefs = [
      sampleBrief({ id: "brief_1", scores: { relevance: 20, usefulness: 20, specificity: 20, visualPotential: 20, factualSafety: 20, originality: 20 } }),
      sampleBrief({ id: "brief_2", scores: { relevance: 95, usefulness: 95, specificity: 95, visualPotential: 95, factualSafety: 95, originality: 95 } }),
      sampleBrief({ id: "brief_3", scores: { relevance: 40, usefulness: 40, specificity: 40, visualPotential: 40, factualSafety: 40, originality: 40 } }),
    ];
    const resolved = resolveRecommendedStudioBrief(briefs);
    expect(resolved.selectedAngleIndex).toBe(1);
    expect(resolved.recommendedBriefIndex).toBe(1);
    expect(resolved.selected?.id).toBe("brief_2");
    expect(resolved.selectedAngleIndex).not.toBe(0);
  });

  it("generateCarousel helper respects the user-selected index", () => {
    const briefs = [
      sampleBrief({ id: "brief_1", scores: { relevance: 20 } }),
      sampleBrief({ id: "brief_2", scores: { relevance: 95, usefulness: 95, specificity: 95, visualPotential: 95, factualSafety: 95, originality: 95 } }),
      sampleBrief({ id: "brief_3", title: "User pick" }),
    ];
    const resolved = resolveUserSelectedStudioBrief(briefs, 2);
    expect(resolved.selectedAngleIndex).toBe(2);
    expect(resolved.recommendedBriefIndex).toBe(1);
    expect(resolved.selected?.title).toBe("User pick");
  });
});

describe("creative brief copy handoff", () => {
  it("formats the brief separately from source facts and includes prohibited claims plus CTA", () => {
    const brief = sampleBrief({
      ctaDirection: "Download the cash calendar",
      prohibitedClaims: ["You will never run out of cash"],
    });
    const text = formatApprovedCreativeBriefForCopy(brief);
    expect(text).toContain("Download the cash calendar");
    expect(text).toContain("You will never run out of cash");
    expect(text).toContain("Ordered key points:");
    expect(text).not.toContain("Make me a carousel about");
  });
});

describe("studio selection view-model", () => {
  it("stays pending until the server response, then never labels 0 as recommended", () => {
    const pending = pendingStudioSelectionViewState();
    expect(pending.selectedIndex).toBeNull();
    expect(pending.recommendedBriefIndex).toBeNull();
    expect(studioGenerateActionEnabled(pending)).toBe(false);

    const pendingView = buildReviewPlanViewModel({
      briefs: [
        sampleBrief({ id: "brief_1", title: "Low" }),
        sampleBrief({ id: "brief_2", title: "Mid" }),
        sampleBrief({ id: "brief_3", title: "High" }),
      ],
      recommendedBriefIndex: pending.recommendedBriefIndex,
      selectedIndex: pending.selectedIndex,
    });
    expect(pendingView.recommended).toBeNull();
    expect(pendingView.cards.every((card) => !card.isRecommended)).toBe(true);
    expect(pendingView.cards.every((card) => !card.isSelected)).toBe(true);
    expect(pendingView.cards[0]?.isRecommended).toBe(false);
    expect(pendingView.cards[0]?.isSelected).toBe(false);

    const afterResponse = applyStudioSelectionResponse({
      recommendedBriefIndex: 2,
      selectedAngleIndex: null,
      mode: "review",
    });
    expect(afterResponse.recommendedBriefIndex).toBe(2);
    expect(afterResponse.selectedIndex).toBe(2);
    expect(studioGenerateActionEnabled(afterResponse)).toBe(true);

    const responseView = buildReviewPlanViewModel({
      briefs: [
        sampleBrief({ id: "brief_1", title: "Low" }),
        sampleBrief({ id: "brief_2", title: "Mid" }),
        sampleBrief({ id: "brief_3", title: "High" }),
      ],
      recommendedBriefIndex: afterResponse.recommendedBriefIndex,
      selectedIndex: afterResponse.selectedIndex,
    });
    expect(responseView.recommended?.index).toBe(2);
    expect(responseView.cards[0]?.isRecommended).toBe(false);
    expect(responseView.cards[2]?.isRecommended).toBe(true);
    expect(responseView.cards[2]?.isSelected).toBe(true);

    const afterManual = applyManualStudioSelection(afterResponse, 1);
    expect(afterManual.selectedIndex).toBe(1);
    expect(afterManual.recommendedBriefIndex).toBe(2);
    const manualView = buildReviewPlanViewModel({
      briefs: [
        sampleBrief({ id: "brief_1", title: "Low" }),
        sampleBrief({ id: "brief_2", title: "Mid" }),
        sampleBrief({ id: "brief_3", title: "High" }),
      ],
      recommendedBriefIndex: afterManual.recommendedBriefIndex,
      selectedIndex: afterManual.selectedIndex,
    });
    expect(manualView.cards[1]?.isSelected).toBe(true);
    expect(manualView.cards[1]?.isRecommended).toBe(false);
    expect(manualView.cards[2]?.isRecommended).toBe(true);
    expect(manualView.cards[0]?.isSelected).toBe(false);
  });
});

describe("creative brief telemetry payload", () => {
  it("logs candidate scores without the full brief or user request", () => {
    const payload = buildCreativeBriefSelectionTelemetry({
      briefs: [sampleBrief()],
      recommendedBriefIndex: 0,
      selectedAngleIndex: 0,
    });
    expect(payload.candidateIds).toEqual(["brief_1"]);
    expect(payload.selection).toBe("recommended");
    expect(JSON.stringify(payload)).not.toContain("Cash is a system");
    expect(JSON.stringify(payload)).not.toContain("Guaranteed profit");
  });

  it("does not invent a fake recommended index for an empty candidate list", () => {
    const payload = buildCreativeBriefSelectionTelemetry({
      briefs: [],
      recommendedBriefIndex: null,
      selectedAngleIndex: null,
    });
    expect(payload.recommendedBriefIndex).toBeNull();
    expect(payload.selectedAngleIndex).toBeNull();
    expect(payload.selection).toBe("unselected");
  });
});

describe("stored vs display brief indexes", () => {
  const malformed = {
    kicker: "Diagnostic",
    title: "Broken modern plan",
    description: "Has modern fields but is incomplete.",
    estimatedSlideCount: 6,
    topic: "small business cash flow",
    contentGoal: "education",
  };

  it("maps persisted stored index 2 to display index 1 and brief B", () => {
    const stored = [
      sampleBrief({ id: "brief_1", title: "Valid A" }),
      malformed,
      sampleBrief({ id: "brief_3", title: "Valid B" }),
    ];
    const entries = normalizeStoredCarouselBriefEntries(stored);
    expect(entries.map((entry) => entry.originalIndex)).toEqual([0, 2]);
    expect(entries.map((entry) => entry.brief.title)).toEqual([
      "Valid A",
      "Valid B",
    ]);
    expect(normalizedIndexFromOriginalIndex(entries, 2)).toBe(1);
    expect(findBriefByOriginalStoredIndex(entries, 2)?.title).toBe("Valid B");
    const restored = applyStudioSelectionResponse({
      recommendedBriefIndex: selectRecommendedCreativeBrief(
        entries.map((entry) => entry.brief)
      ).index,
      selectedAngleIndex: normalizedIndexFromOriginalIndex(entries, 2),
      mode: "restore",
    });
    expect(restored.selectedIndex).toBe(1);
    expect(entries[restored.selectedIndex!]?.brief.title).toBe("Valid B");
  });

  it("converts a display selection back to the original stored index", () => {
    const stored = [
      sampleBrief({ id: "brief_1", title: "Valid A" }),
      malformed,
      sampleBrief({ id: "brief_3", title: "Valid B" }),
    ];
    const entries = normalizeStoredCarouselBriefEntries(stored);
    expect(originalIndexFromNormalizedIndex(entries, 1)).toBe(2);
  });

  it("returns a null selected index when the persisted item was dropped", () => {
    const stored = [
      sampleBrief({ id: "brief_1", title: "Valid A" }),
      malformed,
      sampleBrief({ id: "brief_3", title: "Valid B" }),
    ];
    const entries = normalizeStoredCarouselBriefEntries(stored);
    expect(normalizedIndexFromOriginalIndex(entries, 1)).toBeNull();
    expect(findBriefByOriginalStoredIndex(entries, 1)).toBeNull();
    const restored = applyStudioSelectionResponse({
      recommendedBriefIndex: selectRecommendedCreativeBrief(
        entries.map((entry) => entry.brief)
      ).index,
      selectedAngleIndex: normalizedIndexFromOriginalIndex(entries, 1),
      mode: "restore",
    });
    expect(restored.selectedIndex).toBeNull();
    expect(studioGenerateActionEnabled(restored)).toBe(false);
  });

  it("keeps identity mapping for a fully valid three-brief array", () => {
    const briefs = [
      sampleBrief({ id: "brief_1", title: "One" }),
      sampleBrief({ id: "brief_2", title: "Two" }),
      sampleBrief({ id: "brief_3", title: "Three" }),
    ];
    const entries = identityCarouselBriefEntries(briefs);
    expect(normalizedIndexFromOriginalIndex(entries, 0)).toBe(0);
    expect(normalizedIndexFromOriginalIndex(entries, 1)).toBe(1);
    expect(normalizedIndexFromOriginalIndex(entries, 2)).toBe(2);
    expect(originalIndexFromNormalizedIndex(entries, 0)).toBe(0);
    expect(originalIndexFromNormalizedIndex(entries, 1)).toBe(1);
    expect(originalIndexFromNormalizedIndex(entries, 2)).toBe(2);
  });

  it("scores only valid normalized briefs and returns the display index", () => {
    const stored = [
      sampleBrief({
        id: "brief_1",
        title: "Valid A",
        scores: {
          relevance: 20,
          usefulness: 20,
          specificity: 20,
          visualPotential: 20,
          factualSafety: 20,
          originality: 20,
        },
      }),
      malformed,
      sampleBrief({
        id: "brief_3",
        title: "Valid B",
        scores: {
          relevance: 95,
          usefulness: 95,
          specificity: 95,
          visualPotential: 95,
          factualSafety: 95,
          originality: 95,
        },
      }),
    ];
    const entries = normalizeStoredCarouselBriefEntries(stored);
    const briefs = entries.map((entry) => entry.brief);
    const recommended = selectRecommendedCreativeBrief(briefs);
    expect(recommended.index).toBe(1);
    expect(recommended.brief?.title).toBe("Valid B");
    expect(entries[recommended.index!]?.originalIndex).toBe(2);
  });
});

describe("empty recommendation callers", () => {
  it("does not start generateFromInput without a valid recommendation", () => {
    const resolved = resolveRecommendedStudioBrief([]);
    expect(resolved.recommendedBriefIndex).toBeNull();
    expect(resolved.selectedAngleIndex).toBeNull();
    expect(resolved.selected).toBeNull();
    expect(
      studioGenerateActionEnabled({
        recommendedBriefIndex: resolved.recommendedBriefIndex,
        selectedIndex: resolved.selectedAngleIndex,
      })
    ).toBe(false);
  });

  it("keeps Review Plan generate disabled when no briefs exist", () => {
    const pending = pendingStudioSelectionViewState();
    const view = buildReviewPlanViewModel({
      briefs: [],
      recommendedBriefIndex: pending.recommendedBriefIndex,
      selectedIndex: pending.selectedIndex,
    });
    expect(view.recommended).toBeNull();
    expect(view.cards).toEqual([]);
    expect(studioGenerateActionEnabled(pending)).toBe(false);
  });
});

function listicleOutline(
  noun: "Reason" | "Mistake",
  count: number
): CarouselCreativeBrief["slideOutline"] {
  return [
    {
      position: 1,
      role: "hook",
      objective: `Promise ${count} ${noun.toLowerCase()}s without a matching fix for each.`,
      recommendedVisual: "text",
    },
    ...Array.from({ length: count }, (_, i) => ({
      position: i + 2,
      role: "insight" as const,
      objective: `${noun} ${i + 1} explains a distinct cash-flow beat.`,
      recommendedVisual: "checklist" as const,
    })),
    {
      position: count + 2,
      role: "cta",
      objective: `Ask readers to save the ${count} ${noun.toLowerCase()}s and audit cash this week.`,
      recommendedVisual: "text",
    },
  ];
}

describe("slideIntent metadata", () => {
  it("strips slideIntent and closingType so they are not visible slide text", () => {
    expect(
      stripSlideIntentMetadata({
        slide_01: {
          headline: "Five leaks, five matching plugs",
          body: "Each leak has a plug you can use this week.",
          slideIntent: "content",
        },
        slide_02: {
          headline: "Which leak will you plug first?",
          body: "Pick one drain and handle it this week.",
          slideIntent: "closing",
          closingType: "question",
        },
      })
    ).toEqual({
      slide_01: {
        headline: "Five leaks, five matching plugs",
        body: "Each leak has a plug you can use this week.",
      },
      slide_02: {
        headline: "Which leak will you plug first?",
        body: "Pick one drain and handle it this week.",
      },
    });
  });
});

describe("carousel brief semantic validation", () => {
  it("rejects Fix N without Leak N and a CTA that is not last", () => {
    const brief = sampleBrief({
      title: "Five leaks and how to plug them",
      hook: "Five leaks are draining cash. Fix each one.",
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Promise five leaks and five plugs.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "cta",
          objective: "Ask them to save the list now.",
          recommendedVisual: "text",
        },
        {
          position: 3,
          role: "insight",
          objective: "Present Fix 1 with no matching problem slide.",
          recommendedVisual: "checklist",
        },
        {
          position: 4,
          role: "problem",
          objective: "Introduce Leak 2 inventory later.",
          recommendedVisual: "diagram",
        },
        {
          position: 5,
          role: "insight",
          objective: "Present Fix 2 demand-led ordering.",
          recommendedVisual: "data",
        },
        {
          position: 6,
          role: "takeaway",
          objective: "Claim all five plugged after two fixes.",
          recommendedVisual: "comparison",
        },
      ],
    });
    const issues = validateCarouselBriefSemantics(brief);
    expect(issues).toContain("Fix 1 exists without Problem/Leak 1");
    expect(issues).toContain("Brief has multiple competing endings");
    expect(issues.some((issue) => /5 solutions/.test(issue))).toBe(true);
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toEqual([]);
  });

  it("keeps a generic diagnostic sample brief that is not a numbered sequence", () => {
    expect(validateCarouselBriefSemantics(sampleBrief())).toEqual([]);
  });

  it("accepts a strong takeaway ending with no CTA role", () => {
    const brief = sampleBrief({
      estimatedSlideCount: 5,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Open on the cash warning.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "context",
          objective: "Frame profit versus cash.",
          recommendedVisual: "comparison",
        },
        {
          position: 3,
          role: "problem",
          objective: "Name the timing trap.",
          recommendedVisual: "diagram",
        },
        {
          position: 4,
          role: "insight",
          objective: "Show a weekly cash habit.",
          recommendedVisual: "checklist",
        },
        {
          position: 5,
          role: "takeaway",
          objective: "Leave them with one cash-check habit to keep.",
          recommendedVisual: "text",
        },
      ],
    });
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toHaveLength(1);
  });

  it("accepts a question ending as the final closing", () => {
    const brief = sampleBrief({
      estimatedSlideCount: 5,
      ctaDirection: "Ask which leak they will plug first.",
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Open on the cash warning.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "context",
          objective: "Frame profit versus cash.",
          recommendedVisual: "comparison",
        },
        {
          position: 3,
          role: "problem",
          objective: "Name the timing trap.",
          recommendedVisual: "diagram",
        },
        {
          position: 4,
          role: "insight",
          objective: "Show a weekly cash habit.",
          recommendedVisual: "checklist",
        },
        {
          position: 5,
          role: "takeaway",
          objective: "Ask which leak they will plug first this week.",
          recommendedVisual: "text",
        },
      ],
    });
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
  });

  it("accepts a follow CTA as the final closing", () => {
    expect(validateCarouselBriefSemantics(sampleBrief())).toEqual([]);
  });

  it("rejects a brief with no intentional final closing", () => {
    const brief = sampleBrief({
      estimatedSlideCount: 5,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Open on the cash warning.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "context",
          objective: "Frame profit versus cash.",
          recommendedVisual: "comparison",
        },
        {
          position: 3,
          role: "problem",
          objective: "Name the timing trap.",
          recommendedVisual: "diagram",
        },
        {
          position: 4,
          role: "insight",
          objective: "Show a weekly cash habit.",
          recommendedVisual: "checklist",
        },
        {
          position: 5,
          role: "example",
          objective: "Walk one missed deposit.",
          recommendedVisual: "timeline",
        },
      ],
    });
    expect(validateCarouselBriefSemantics(brief)).toContain(
      "Brief must contain exactly one final closing"
    );
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toEqual([]);
  });

  it("rejects two competing endings", () => {
    const brief = sampleBrief({
      estimatedSlideCount: 5,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Open on the cash warning.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "cta",
          objective: "Ask them to follow for the next cash check.",
          recommendedVisual: "text",
        },
        {
          position: 3,
          role: "insight",
          objective: "Show a weekly cash habit.",
          recommendedVisual: "checklist",
        },
        {
          position: 4,
          role: "example",
          objective: "Walk one missed deposit.",
          recommendedVisual: "timeline",
        },
        {
          position: 5,
          role: "takeaway",
          objective: "Leave them with one cash-check habit to keep.",
          recommendedVisual: "text",
        },
      ],
    });
    const issues = validateCarouselBriefSemantics(brief);
    expect(issues).toContain("Brief has multiple competing endings");
    expect(issues).not.toContain("Brief must contain exactly one CTA");
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toEqual([]);
  });

  it("rejects a non-final takeaway plus a final CTA", () => {
    const brief = sampleBrief({
      estimatedSlideCount: 5,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Open on the cash warning.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "context",
          objective: "Frame profit versus cash.",
          recommendedVisual: "comparison",
        },
        {
          position: 3,
          role: "insight",
          objective: "Show a weekly cash habit.",
          recommendedVisual: "checklist",
        },
        {
          position: 4,
          role: "takeaway",
          objective: "Leave them with one cash-check habit to keep.",
          recommendedVisual: "text",
        },
        {
          position: 5,
          role: "cta",
          objective: "Ask them to save the list this week.",
          recommendedVisual: "text",
        },
      ],
    });
    expect(validateCarouselBriefSemantics(brief)).toContain(
      "Brief has multiple competing endings"
    );
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toEqual([]);
  });

  it("rejects a non-final CTA plus a final takeaway", () => {
    const brief = sampleBrief({
      estimatedSlideCount: 5,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Open on the cash warning.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "cta",
          objective: "Ask them to follow for the next cash check.",
          recommendedVisual: "text",
        },
        {
          position: 3,
          role: "insight",
          objective: "Show a weekly cash habit.",
          recommendedVisual: "checklist",
        },
        {
          position: 4,
          role: "example",
          objective: "Walk one missed deposit.",
          recommendedVisual: "timeline",
        },
        {
          position: 5,
          role: "takeaway",
          objective: "Leave them with one cash-check habit to keep.",
          recommendedVisual: "text",
        },
      ],
    });
    expect(validateCarouselBriefSemantics(brief)).toContain(
      "Brief has multiple competing endings"
    );
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toEqual([]);
  });

  it("rejects two takeaway roles", () => {
    const brief = sampleBrief({
      estimatedSlideCount: 5,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Open on the cash warning.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "context",
          objective: "Frame profit versus cash.",
          recommendedVisual: "comparison",
        },
        {
          position: 3,
          role: "insight",
          objective: "Show a weekly cash habit.",
          recommendedVisual: "checklist",
        },
        {
          position: 4,
          role: "takeaway",
          objective: "Leave them with one cash-check habit to keep.",
          recommendedVisual: "text",
        },
        {
          position: 5,
          role: "takeaway",
          objective: "Ask which leak they will plug first this week.",
          recommendedVisual: "text",
        },
      ],
    });
    expect(validateCarouselBriefSemantics(brief)).toContain(
      "Brief has multiple competing endings"
    );
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toEqual([]);
  });

  it("rejects a brief with no closing role", () => {
    const brief = sampleBrief({
      estimatedSlideCount: 5,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Open on the cash warning.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "context",
          objective: "Frame profit versus cash.",
          recommendedVisual: "comparison",
        },
        {
          position: 3,
          role: "problem",
          objective: "Name the timing trap.",
          recommendedVisual: "diagram",
        },
        {
          position: 4,
          role: "insight",
          objective: "Show a weekly cash habit.",
          recommendedVisual: "checklist",
        },
        {
          position: 5,
          role: "example",
          objective: "Walk one missed deposit.",
          recommendedVisual: "timeline",
        },
      ],
    });
    expect(validateCarouselBriefSemantics(brief)).toContain(
      "Brief must contain exactly one final closing"
    );
    expect(validateCarouselBriefSemantics(brief)).not.toContain(
      "Brief has multiple competing endings"
    );
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toEqual([]);
  });

  it("rejects duplicated closing language on the final slide", () => {
    const brief = sampleBrief({
      estimatedSlideCount: 5,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Open on the cash warning.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "context",
          objective: "Leave them with one cash-check habit to keep.",
          recommendedVisual: "comparison",
        },
        {
          position: 3,
          role: "problem",
          objective: "Name the timing trap.",
          recommendedVisual: "diagram",
        },
        {
          position: 4,
          role: "insight",
          objective: "Show a weekly cash habit.",
          recommendedVisual: "checklist",
        },
        {
          position: 5,
          role: "takeaway",
          objective: "Leave them with one cash-check habit to keep.",
          recommendedVisual: "text",
        },
      ],
    });
    expect(validateCarouselBriefSemantics(brief)).toContain(
      "Duplicated closing language"
    );
  });

  it("accepts a 5 Reasons listicle with Reason 1-5 and one final closing", () => {
    const brief = sampleBrief({
      title: "5 Reasons Small Businesses Run Out of Cash",
      hook: "Five reasons small businesses run out of cash.",
      corePromise: "Walk through five reasons cash disappears.",
      estimatedSlideCount: 7,
      slideOutline: listicleOutline("Reason", 5),
    });
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toHaveLength(1);
  });

  it("accepts a 5 Mistakes listicle with Mistake 1-5", () => {
    const brief = sampleBrief({
      title: "5 Mistakes That Empty a Business Account",
      hook: "Five mistakes that empty a business account.",
      corePromise: "Name five mistakes owners can stop repeating.",
      estimatedSlideCount: 7,
      slideOutline: listicleOutline("Mistake", 5),
    });
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
  });

  it("rejects 5 Leaks that promise a fix for each but outline only two fixes", () => {
    const brief = sampleBrief({
      title: "Five leaks and how to plug them",
      hook: "Five leaks are draining cash. Fix each one.",
      estimatedSlideCount: 6,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Promise five leaks and a fix for each.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "problem",
          objective: "Introduce Leak 1 invoice timing.",
          recommendedVisual: "timeline",
        },
        {
          position: 3,
          role: "insight",
          objective: "Present Fix 1 shorter payment cycles.",
          recommendedVisual: "checklist",
        },
        {
          position: 4,
          role: "problem",
          objective: "Introduce Leak 2 inventory overstock.",
          recommendedVisual: "diagram",
        },
        {
          position: 5,
          role: "insight",
          objective: "Present Fix 2 demand-led ordering.",
          recommendedVisual: "data",
        },
        {
          position: 6,
          role: "cta",
          objective: "Ask them to screenshot the five leaks this week.",
          recommendedVisual: "text",
        },
      ],
    });
    const issues = validateCarouselBriefSemantics(brief);
    expect(issues.some((issue) => /5 solutions/.test(issue))).toBe(true);
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toEqual([]);
  });

  it("rejects Fix 1 without Leak or Problem 1", () => {
    const brief = sampleBrief({
      title: "Plug the first leak",
      hook: "Start with Fix 1.",
      estimatedSlideCount: 5,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Promise a first fix.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "insight",
          objective: "Present Fix 1 shorter payment cycles.",
          recommendedVisual: "checklist",
        },
        {
          position: 3,
          role: "example",
          objective: "Walk a deposit example.",
          recommendedVisual: "timeline",
        },
        {
          position: 4,
          role: "takeaway",
          objective: "Recap the first fix.",
          recommendedVisual: "text",
        },
        {
          position: 5,
          role: "cta",
          objective: "Ask them to apply Fix 1 this week.",
          recommendedVisual: "text",
        },
      ],
    });
    expect(validateCarouselBriefSemantics(brief)).toContain(
      "Fix 1 exists without Problem/Leak 1"
    );
  });

  it("accepts Leak 1 followed by Fix 1", () => {
    const brief = sampleBrief({
      title: "Leak 1 and Fix 1",
      hook: "Name Leak 1, then Fix 1.",
      estimatedSlideCount: 5,
      slideOutline: [
        {
          position: 1,
          role: "hook",
          objective: "Promise Leak 1 and Fix 1.",
          recommendedVisual: "text",
        },
        {
          position: 2,
          role: "problem",
          objective: "Introduce Leak 1 invoice timing.",
          recommendedVisual: "timeline",
        },
        {
          position: 3,
          role: "insight",
          objective: "Present Fix 1 shorter payment cycles.",
          recommendedVisual: "checklist",
        },
        {
          position: 4,
          role: "example",
          objective: "Recap the paired leak and fix.",
          recommendedVisual: "text",
        },
        {
          position: 5,
          role: "cta",
          objective: "Ask them to apply the first plug this week.",
          recommendedVisual: "text",
        },
      ],
    });
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
  });
});

const CASH_DRAINS_SOURCE = "The 6 Silent Cash Drains Killing Small Businesses";
const MISTAKES_SOURCE = "5 mistakes restaurant owners make";
const SIGNS_SOURCE = "7 signs your restaurant is losing money";
const OPEN_TOPIC_SOURCE = "cash flow problems for small businesses";

function explicitListContract(
  source: string
): CarouselListContract {
  const contract = detectExplicitCarouselListContract(source);
  if (!contract) {
    throw new Error(`expected an explicit list contract for: ${source}`);
  }
  return contract;
}

function numberedItemOutline(args: {
  itemLabel: string;
  count: number;
  includeContext?: boolean;
  contextConsumesFirstItem?: boolean;
  itemCountOverride?: number;
  taxonomyLabel?: string;
}): CarouselCreativeBrief["slideOutline"] {
  const itemCount = args.itemCountOverride ?? args.count;
  const slides: CarouselCreativeBrief["slideOutline"] = [
    {
      position: 1,
      role: "hook",
      objective: `Promise ${args.count} ${args.itemLabel} on the cover.`,
      recommendedVisual: "text",
      listItemIndex: null,
    },
  ];
  if (args.includeContext) {
    slides.push({
      position: 2,
      role: "context",
      objective: args.contextConsumesFirstItem
        ? "Why owners look away from the first item."
        : "Cover setup stays on the cover; this is extra framing only.",
      recommendedVisual: "text",
      listItemIndex: args.contextConsumesFirstItem ? 1 : null,
    });
  }
  const startPosition = slides.length + 1;
  for (let i = 0; i < itemCount; i += 1) {
    const label = args.taxonomyLabel ?? args.itemLabel;
    slides.push({
      position: startPosition + i,
      role: "insight",
      objective: `${label} ${i + 1} names a distinct beat.`,
      recommendedVisual: "checklist",
      listItemIndex: args.contextConsumesFirstItem ? i + 2 : i + 1,
    });
  }
  slides.push({
    position: slides.length + 1,
    role: "cta",
    objective: `Ask them to save the ${args.count} ${args.itemLabel} this week.`,
    recommendedVisual: "text",
    listItemIndex: null,
  });
  return slides;
}

describe("explicit carousel list contract", () => {
  it("extracts six cash drains from an enumerated title", () => {
    expect(detectExplicitCarouselListContract(CASH_DRAINS_SOURCE)).toEqual({
      explicitListContract: true,
      promisedCount: 6,
      promisedItemType: "cash drains",
    });
  });

  it("extracts five mistakes from an enumerated title", () => {
    expect(detectExplicitCarouselListContract(MISTAKES_SOURCE)).toEqual({
      explicitListContract: true,
      promisedCount: 5,
      promisedItemType: "mistakes",
    });
  });

  it("extracts seven signs from an enumerated title", () => {
    expect(detectExplicitCarouselListContract(SIGNS_SOURCE)).toEqual({
      explicitListContract: true,
      promisedCount: 7,
      promisedItemType: "signs",
    });
  });

  it("does not lock an open topic with no enumerated framing", () => {
    expect(detectExplicitCarouselListContract(OPEN_TOPIC_SOURCE)).toBeNull();
  });

  it("accepts six drain items and rejects a myth rewrite", () => {
    const contract = explicitListContract(CASH_DRAINS_SOURCE);
    const drainBrief = sampleBrief({
      title: "6 Cash Drains Quietly Bleeding Your Business",
      hook: "6 Cash Drains Quietly Bleeding Your Business",
      corePromise: "Name the six cash drains owners miss.",
      estimatedSlideCount: 8,
      slideOutline: numberedItemOutline({
        itemLabel: "cash drain",
        count: 6,
      }),
    });
    expect(drainBrief.slideOutline).toHaveLength(8);
    expect(expectedExplicitListicleSlideCount(6)).toBe(8);
    expect(validateCarouselBriefSemantics(drainBrief, contract)).toEqual([]);
    expect(
      selectSemanticallyValidCarouselBriefs([drainBrief], contract).briefs
    ).toHaveLength(1);

    const mythBrief = sampleBrief({
      title: "6 Cash Myths Killing Your Business",
      hook: "6 Cash Myths Killing Your Business",
      corePromise: "Bust six cash myths owners still believe.",
      estimatedSlideCount: 8,
      angleType: "myth_busting",
      slideOutline: numberedItemOutline({
        itemLabel: "cash drain",
        count: 6,
        taxonomyLabel: "Myth",
      }),
    });
    const mythIssues = validateCarouselBriefSemantics(mythBrief, contract);
    expect(mythIssues).toContain("The brief changed the promised item type");
    expect(mythIssues).toContain(
      "Slide titles use a different item type than the hook promised"
    );
    expect(
      selectSemanticallyValidCarouselBriefs([mythBrief], contract).briefs
    ).toEqual([]);
  });

  it("accepts five mistake items", () => {
    const contract = explicitListContract(MISTAKES_SOURCE);
    const brief = sampleBrief({
      title: "5 Mistakes Restaurant Owners Still Make",
      hook: "5 mistakes restaurant owners still make on a busy night.",
      corePromise: "Name five mistakes owners can stop repeating.",
      estimatedSlideCount: 7,
      slideOutline: numberedItemOutline({
        itemLabel: "mistake",
        count: 5,
      }),
    });
    expect(validateCarouselBriefSemantics(brief, contract)).toEqual([]);
  });

  it("accepts seven sign items", () => {
    const contract = explicitListContract(SIGNS_SOURCE);
    const brief = sampleBrief({
      title: "7 Signs Your Restaurant Is Losing Money",
      hook: "7 signs your restaurant is losing money.",
      corePromise: "Spot seven signs before cash gets tighter.",
      estimatedSlideCount: 9,
      slideOutline: numberedItemOutline({
        itemLabel: "sign",
        count: 7,
      }),
    });
    expect(validateCarouselBriefSemantics(brief, contract)).toEqual([]);
  });

  it("keeps myth-busting allowed on an open topic", () => {
    const contract = detectExplicitCarouselListContract(OPEN_TOPIC_SOURCE);
    const brief = sampleBrief({
      title: "6 Cash Myths Owners Still Believe",
      hook: "6 Cash Myths Owners Still Believe",
      corePromise: "Bust six cash myths with clearer habits.",
      angleType: "myth_busting",
      estimatedSlideCount: 8,
      slideOutline: numberedItemOutline({
        itemLabel: "myth",
        count: 6,
        taxonomyLabel: "Myth",
      }),
    });
    expect(contract).toBeNull();
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
    expect(validateCarouselBriefSemantics(brief, contract)).toEqual([]);
    expect(brief.angleType).toBe("myth_busting");
  });

  it("rejects a context slide that consumes item 01", () => {
    const contract = explicitListContract(CASH_DRAINS_SOURCE);
    const brief = sampleBrief({
      title: "6 Cash Drains Quietly Bleeding Your Business",
      hook: "6 Cash Drains Quietly Bleeding Your Business",
      corePromise: "Name the six cash drains owners miss.",
      estimatedSlideCount: 8,
      slideOutline: numberedItemOutline({
        itemLabel: "cash drain",
        count: 6,
        includeContext: true,
        contextConsumesFirstItem: true,
        itemCountOverride: 5,
      }),
    });
    const issues = validateCarouselBriefSemantics(brief, contract);
    expect(issues).toContain(
      "A context or closing slide consumed a list item number"
    );
  });

  it("uses cover plus six items plus CTA for a basic six-item listicle", () => {
    const contract = explicitListContract(CASH_DRAINS_SOURCE);
    const brief = sampleBrief({
      title: "6 Cash Drains Quietly Bleeding Your Business",
      hook: "6 Cash Drains Quietly Bleeding Your Business",
      corePromise: "Name the six cash drains owners miss.",
      estimatedSlideCount: 8,
      slideOutline: numberedItemOutline({
        itemLabel: "cash drain",
        count: 6,
      }),
    });
    expect(brief.estimatedSlideCount).toBe(8);
    expect(brief.slideOutline).toHaveLength(8);
    expect(brief.slideOutline[0]?.role).toBe("hook");
    expect(brief.slideOutline[7]?.role).toBe("cta");
    expect(
      brief.slideOutline.filter((slide) => slide.listItemIndex != null)
    ).toHaveLength(6);
    expect(validateCarouselBriefSemantics(brief, contract)).toEqual([]);
  });

  it("rejects five item slides when the hook promises six", () => {
    const contract = explicitListContract(CASH_DRAINS_SOURCE);
    const brief = sampleBrief({
      title: "6 Cash Drains Quietly Bleeding Your Business",
      hook: "6 Cash Drains Quietly Bleeding Your Business",
      corePromise: "Name the six cash drains owners miss.",
      estimatedSlideCount: 7,
      slideOutline: numberedItemOutline({
        itemLabel: "cash drain",
        count: 6,
        itemCountOverride: 5,
      }),
    });
    expect(validateCarouselBriefSemantics(brief, contract)).toContain(
      "The hook promises 6 items but fewer than 6 are outlined"
    );
  });

  it("keeps item numbers 01-06 when a context slide sits at position 2", () => {
    const contract = explicitListContract(CASH_DRAINS_SOURCE);
    const brief = sampleBrief({
      title: "6 Cash Drains Quietly Bleeding Your Business",
      hook: "6 Cash Drains Quietly Bleeding Your Business",
      corePromise: "Name the six cash drains owners miss.",
      estimatedSlideCount: 9,
      slideOutline: numberedItemOutline({
        itemLabel: "cash drain",
        count: 6,
        includeContext: true,
      }),
    });
    expect(brief.slideOutline[1]?.role).toBe("context");
    expect(brief.slideOutline[1]?.listItemIndex).toBeNull();
    expect(brief.slideOutline[1]?.position).toBe(2);
    const itemIndexes = brief.slideOutline
      .filter((slide) => slide.listItemIndex != null)
      .map((slide) => slide.listItemIndex);
    expect(itemIndexes).toEqual([1, 2, 3, 4, 5, 6]);
    expect(itemIndexes.map((index) => formatCarouselListItemNumber(index!))).toEqual(
      ["01", "02", "03", "04", "05", "06"]
    );
    expect(brief.slideOutline[2]?.position).toBe(3);
    expect(brief.slideOutline[2]?.listItemIndex).toBe(1);
    expect(
      validateCarouselBriefSemantics(brief, {
        ...contract,
        allowStandaloneContext: true,
      })
    ).toEqual([]);

    const slideIds = brief.slideOutline.map(
      (_, i) => `slide_${String(i + 1).padStart(2, "0")}`
    );
    const values = Object.fromEntries(
      brief.slideOutline.map((slide, i) => [
        slideIds[i]!,
        {
          headline: slide.objective,
          body: slide.objective,
          kicker:
            slide.listItemIndex != null
              ? formatCarouselListItemNumber(slide.listItemIndex)
              : "NOTE",
          slideIntent: i === brief.slideOutline.length - 1 ? "closing" : "content",
          ...(i === brief.slideOutline.length - 1
            ? { closingType: "save" }
            : {}),
        },
      ])
    );
    const copyIssues = validateCopyBriefAdherence({
      brief,
      slideIds,
      values,
    });
    expect(copyIssues).toEqual([]);
    expect(values.slide_02?.kicker).toBe("NOTE");
    expect(values.slide_03?.kicker).toBe("01");
    expect(values.slide_08?.kicker).toBe("06");
  });

  it("derives a brief-level contract from an open prompt plus a 6 cash drains title", () => {
    const userContract = detectExplicitCarouselListContract(OPEN_CASH_FLOW_USER_PROMPT);
    const brief = sampleBrief({
      title: "The 6 Silent Cash Drains Killing Small Businesses",
      hook: "6 Silent Cash Drains Killing Small Businesses",
      corePromise: "Name the six cash drains owners miss.",
      centralInsight: "The drains hide in timing, not in sales.",
      estimatedSlideCount: 8,
      slideOutline: numberedItemOutline({
        itemLabel: "cash drain",
        count: 6,
      }),
    });
    expect(userContract).toBeNull();
    expect(detectCarouselListContractFromBrief(brief)).toEqual({
      explicitListContract: true,
      promisedCount: 6,
      promisedItemType: "cash drains",
    });
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
    expect(validateCarouselBriefSemantics(brief, userContract)).toEqual([]);
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toHaveLength(1);
  });

  it("rejects remake 67 when the strategist promised six drains and delivered five", () => {
    const userContract = detectExplicitCarouselListContract(OPEN_CASH_FLOW_USER_PROMPT);
    expect(userContract).toBeNull();
    expect(detectCarouselListContractFromBrief(CASH_DRAINS_REMAKE_67_BRIEF)).toEqual({
      explicitListContract: true,
      promisedCount: 6,
      promisedItemType: "cash drains",
    });
    const issues = validateCarouselBriefSemantics(CASH_DRAINS_REMAKE_67_BRIEF);
    expect(issues).toContain("The hook promises 6 items but fewer than 6 are outlined");
    expect(issues).toContain(
      "Simple listicles should not include a standalone context slide"
    );
    expect(
      validateCarouselBriefSemantics(CASH_DRAINS_REMAKE_67_BRIEF, userContract)
    ).toEqual(issues);
    expect(
      selectSemanticallyValidCarouselBriefs([CASH_DRAINS_REMAKE_67_BRIEF]).briefs
    ).toEqual([]);
  });

  it("accepts an open prompt plus a generated 6 myths brief with six myth items", () => {
    const userContract = detectExplicitCarouselListContract(OPEN_CASH_FLOW_USER_PROMPT);
    const brief = sampleBrief({
      title: "6 Cash Myths Owners Still Believe",
      hook: "6 Cash Myths Owners Still Believe",
      corePromise: "Bust six cash myths with clearer habits.",
      centralInsight: "The myths hide in habits, not in sales.",
      angleType: "myth_busting",
      estimatedSlideCount: 8,
      slideOutline: numberedItemOutline({
        itemLabel: "myth",
        count: 6,
        taxonomyLabel: "Myth",
      }),
    });
    expect(userContract).toBeNull();
    expect(detectCarouselListContractFromBrief(brief)).toEqual({
      explicitListContract: true,
      promisedCount: 6,
      promisedItemType: "cash myths",
    });
    expect(brief.slideOutline).toHaveLength(8);
    expect(brief.slideOutline.some((slide) => slide.role === "context")).toBe(
      false
    );
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
    expect(validateCarouselBriefSemantics(brief, userContract)).toEqual([]);
  });

  it("keeps an explicit user drain contract from becoming myths", () => {
    const contract = explicitListContract(CASH_DRAINS_SOURCE);
    const brief = sampleBrief({
      title: "6 Cash Myths Killing Your Business",
      hook: "6 Cash Myths Killing Your Business",
      corePromise: "Bust six cash myths owners still believe.",
      angleType: "myth_busting",
      estimatedSlideCount: 8,
      slideOutline: numberedItemOutline({
        itemLabel: "cash drain",
        count: 6,
        taxonomyLabel: "Myth",
      }),
    });
    const issues = validateCarouselBriefSemantics(brief, contract);
    expect(issues).toContain("The brief changed the promised item type");
    expect(issues).toContain(
      "Slide titles use a different item type than the hook promised"
    );
    expect(selectSemanticallyValidCarouselBriefs([brief], contract).briefs).toEqual(
      []
    );
  });

  it("defaults a simple six-item listicle to exactly 8 slides with no context", () => {
    const brief = sampleBrief({
      title: "The 6 Silent Cash Drains Killing Small Businesses",
      hook: "The 6 Silent Cash Drains Killing Small Businesses",
      corePromise: "Name the six cash drains owners miss.",
      estimatedSlideCount: expectedExplicitListicleSlideCount(6),
      slideOutline: numberedItemOutline({
        itemLabel: "cash drain",
        count: 6,
      }),
    });
    expect(expectedExplicitListicleSlideCount(6)).toBe(8);
    expect(brief.estimatedSlideCount).toBe(8);
    expect(brief.slideOutline).toHaveLength(8);
    expect(brief.slideOutline.map((slide) => slide.role)).toEqual([
      "hook",
      "insight",
      "insight",
      "insight",
      "insight",
      "insight",
      "insight",
      "cta",
    ]);
    expect(brief.slideOutline.some((slide) => slide.role === "context")).toBe(
      false
    );
    expect(validateCarouselBriefSemantics(brief)).toEqual([]);
  });

  it("rejects a standalone context slide on a simple six-drain listicle", () => {
    const brief = sampleBrief({
      title: "The 6 Silent Cash Drains Killing Small Businesses",
      hook: "The 6 Silent Cash Drains Killing Small Businesses",
      corePromise: "Name the six cash drains owners miss.",
      estimatedSlideCount: 9,
      slideOutline: numberedItemOutline({
        itemLabel: "cash drain",
        count: 6,
        includeContext: true,
      }),
    });
    const issues = validateCarouselBriefSemantics(brief);
    expect(issues).toContain(
      "Simple listicles should not include a standalone context slide"
    );
    expect(selectSemanticallyValidCarouselBriefs([brief]).briefs).toEqual([]);
  });
});
