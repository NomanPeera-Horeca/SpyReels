import { describe, expect, it } from "vitest";
import {
  applyManualStudioSelection,
  applyStudioSelectionResponse,
  buildCreativeBriefSelectionTelemetry,
  buildReviewPlanViewModel,
  CAROUSEL_CREATIVE_BRIEF_VERSION,
  clampCarouselBriefScore,
  deriveCarouselLibraryMeta,
  formatApprovedCreativeBriefForCopy,
  isLegacyCreativeBrief,
  normalizeGeneratedCarouselBrief,
  normalizeStoredCarouselBriefs,
  pendingStudioSelectionViewState,
  researchModeLabel,
  resolveRecommendedStudioBrief,
  resolveUserSelectedStudioBrief,
  scoreCarouselCreativeBrief,
  selectRecommendedCreativeBrief,
  studioGenerateActionEnabled,
  type CarouselCreativeBrief,
} from "./carouselStudio";

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
  const roles = [
    "hook",
    "context",
    "problem",
    "insight",
    "example",
    "takeaway",
    "cta",
  ] as const;
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    role: roles[Math.min(i, roles.length - 1)]!,
    objective: `Cover beat ${i + 1} without repeating other slides.`,
    recommendedVisual: i === 0 ? "text" : "checklist",
  }));
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

  it("labels researchMode for the Review Plan", () => {
    expect(researchModeLabel("none")).toBe("No research required");
    expect(researchModeLabel("claim_verification")).toBe(
      "Claims should be verified"
    );
    expect(researchModeLabel("research_required")).toBe(
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
});
