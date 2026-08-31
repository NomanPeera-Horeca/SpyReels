import { describe, expect, it, vi } from "vitest";
import {
  isLegacyCreativeBrief,
  normalizeStoredCarouselBriefEntries,
  normalizeStoredCarouselBriefs,
  scoreCarouselCreativeBrief,
  type CarouselCreativeBrief,
  type NormalizedCarouselBrief,
} from "@shared/carouselStudio";
import {
  buildStudioRemakeHandoff,
  orchestrateStudioGenerateAngles,
  orchestrateStudioGenerateCarousel,
  orchestrateStudioGenerateFromInput,
  planGenerateCarousel,
} from "../studioOrchestration";

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
  return {
    schemaVersion: 2,
    isLegacy: false,
    id: overrides.id ?? "brief_1",
    kicker: overrides.kicker ?? "Diagnostic",
    title: overrides.title ?? "Cash is a system",
    description: overrides.description ?? "Show why cash runs out before profit.",
    estimatedSlideCount,
    topic: overrides.topic ?? "small business cash flow",
    inferredAudience: overrides.inferredAudience ?? "small business owners",
    audienceReasoning:
      overrides.audienceReasoning ?? "The source names this audience.",
    contentGoal: overrides.contentGoal ?? "education",
    contentFormat: overrides.contentFormat ?? "breakdown",
    angleType: overrides.angleType ?? "diagnostic",
    hook: overrides.hook ?? "Profit on paper, empty in the bank.",
    corePromise: overrides.corePromise ?? "See the cash leaks before they compound.",
    centralInsight:
      overrides.centralInsight ?? "Cash timing is the silent killer.",
    keyPoints: overrides.keyPoints ?? sampleKeyPoints(),
    slideOutline: overrides.slideOutline ?? sampleOutline(estimatedSlideCount),
    layoutFamily: overrides.layoutFamily ?? "breakdown",
    visualDirection:
      overrides.visualDirection ?? "Simple numbered breakdown cards.",
    imageDirection: overrides.imageDirection ?? "Neutral desk and ledger photos.",
    claimRisk: overrides.claimRisk ?? "medium",
    researchMode: overrides.researchMode ?? "claim_verification",
    evidenceRequirements:
      overrides.evidenceRequirements ?? ["Verify cash-cycle claims"],
    prohibitedClaims:
      overrides.prohibitedClaims ?? ["Guaranteed profit in 30 days"],
    ctaDirection: overrides.ctaDirection ?? "Save this cash-check list",
    scores: scoreCarouselCreativeBrief({
      relevance: scoreInput.relevance ?? 80,
      usefulness: scoreInput.usefulness ?? 70,
      specificity: scoreInput.specificity ?? 60,
      visualPotential: scoreInput.visualPotential ?? 50,
      factualSafety: scoreInput.factualSafety ?? 90,
      originality: scoreInput.originality ?? 40,
    }),
    confidence: overrides.confidence ?? 0.8,
  };
}

function threeCandidatesIndex2Highest(): CarouselCreativeBrief[] {
  return [
    sampleBrief({
      id: "brief_1",
      title: "Low score plan",
      scores: {
        relevance: 20,
        usefulness: 20,
        specificity: 20,
        visualPotential: 20,
        factualSafety: 20,
        originality: 20,
      },
    }),
    sampleBrief({
      id: "brief_2",
      title: "Mid score plan",
      scores: {
        relevance: 40,
        usefulness: 40,
        specificity: 40,
        visualPotential: 40,
        factualSafety: 40,
        originality: 40,
      },
    }),
    sampleBrief({
      id: "brief_3",
      title: "Highest score plan",
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
}

describe("studio orchestration (mocked, no network)", () => {
  it("generateAngles persists original order, recommends index 2, and does not fire remake", async () => {
    const briefs = threeCandidatesIndex2Highest();
    const proposeAngles = vi.fn(async () => briefs);
    const persistAngles = vi.fn(async (row) => {
      expect(row.selectedAngleIndex).toBeNull();
      expect(row.angleOptionsJson.map((brief) => brief.id)).toEqual([
        "brief_1",
        "brief_2",
        "brief_3",
      ]);
      return 11;
    });
    const fireRemake = vi.fn();

    const result = await orchestrateStudioGenerateAngles({
      proposeAngles,
      persistAngles,
    });

    expect(proposeAngles).toHaveBeenCalledTimes(1);
    expect(persistAngles).toHaveBeenCalledTimes(1);
    expect(fireRemake).not.toHaveBeenCalled();
    expect(result.recommendedBriefIndex).toBe(2);
    expect(result.selectedAngleIndex).toBeNull();
    expect(result.angles.map((brief) => brief.id)).toEqual([
      "brief_1",
      "brief_2",
      "brief_3",
    ]);
    expect(result.angles[2]?.title).toBe("Highest score plan");
  });

  it("generateFromInput selects brief 2, fires one remake, and does not re-plan", async () => {
    const briefs = threeCandidatesIndex2Highest();
    const proposeAngles = vi.fn(async () => briefs);
    const persistAngles = vi.fn(async (row) => {
      expect(row.selectedAngleIndex).toBe(2);
      return 22;
    });
    const fireRemake = vi.fn();

    const result = await orchestrateStudioGenerateFromInput({
      proposeAngles,
      persistAngles,
      fireRemake,
    });

    expect(proposeAngles).toHaveBeenCalledTimes(1);
    expect(persistAngles).toHaveBeenCalledTimes(1);
    expect(fireRemake).toHaveBeenCalledTimes(1);
    expect(result.selectedAngleIndex).toBe(2);
    expect(result.recommendedBriefIndex).toBe(2);
    const remakeArg = fireRemake.mock.calls[0]![0];
    expect(remakeArg.selected.id).toBe("brief_3");
    expect(remakeArg.selected.title).toBe("Highest score plan");
    expect(remakeArg.remakeHandoff.creativeBrief?.id).toBe("brief_3");
    expect(remakeArg.remakeHandoff.creativeBrief?.id).not.toBe("brief_1");
    expect(remakeArg.remakeHandoff.angleDirection).toBeUndefined();
  });

  it("generateCarousel persists the user pick and remakes that brief, not the recommended one", async () => {
    const briefs = threeCandidatesIndex2Highest();
    const loadAngles = vi.fn(async () => briefs);
    const persistSelection = vi.fn(async (selectedAngleIndex: number) => {
      expect(selectedAngleIndex).toBe(1);
      return 33;
    });
    const fireRemake = vi.fn();

    const result = await orchestrateStudioGenerateCarousel({
      loadAngles,
      selectedAngleIndex: 1,
      persistSelection,
      fireRemake,
    });

    expect(loadAngles).toHaveBeenCalledTimes(1);
    expect(persistSelection).toHaveBeenCalledTimes(1);
    expect(fireRemake).toHaveBeenCalledTimes(1);
    expect(result.selectedAngleIndex).toBe(1);
    expect(result.recommendedBriefIndex).toBe(2);
    const remakeArg = fireRemake.mock.calls[0]![0];
    expect(remakeArg.selected.id).toBe("brief_2");
    expect(remakeArg.selected.title).toBe("Mid score plan");
    expect(remakeArg.remakeHandoff.creativeBrief?.id).toBe("brief_2");
    expect(remakeArg.remakeHandoff.creativeBrief?.id).not.toBe("brief_3");
  });

  it("generateFromInput does not start without a valid recommendation", async () => {
    const persistAngles = vi.fn(async () => 44);
    const fireRemake = vi.fn();
    await expect(
      orchestrateStudioGenerateFromInput({
        proposeAngles: async () => [],
        persistAngles,
        fireRemake,
      })
    ).rejects.toThrow("Could not generate carousel angles.");
    expect(persistAngles).not.toHaveBeenCalled();
    expect(fireRemake).not.toHaveBeenCalled();
  });

  it("generateAngles does not persist when no valid recommendation exists", async () => {
    const persistAngles = vi.fn(async () => 55);
    await expect(
      orchestrateStudioGenerateAngles({
        proposeAngles: async () => [],
        persistAngles,
      })
    ).rejects.toThrow("Could not generate carousel angles.");
    expect(persistAngles).not.toHaveBeenCalled();
  });

  it("generateCarousel locates the selected brief by original stored index", () => {
    const entries = normalizeStoredCarouselBriefEntries([
      sampleBrief({ id: "brief_1", title: "Valid A" }),
      {
        kicker: "Diagnostic",
        title: "Broken modern plan",
        description: "Has modern fields but is incomplete.",
        estimatedSlideCount: 6,
        topic: "small business cash flow",
        contentGoal: "education",
      },
      sampleBrief({ id: "brief_3", title: "Valid B" }),
    ]);
    const plan = planGenerateCarousel(entries, 1);
    expect(plan.selected?.title).toBe("Valid B");
    expect(plan.selectedAngleIndex).toBe(2);
    expect(plan.recommendedBriefIndex).toBe(0);
  });

  it("legacy four-field uses angleDirection and does not invent a creativeBrief", () => {
    const [legacy] = normalizeStoredCarouselBriefs([
      {
        kicker: "Contrarian",
        title: "Stop chasing profit first",
        description: "Show the cash timing trap.",
        estimatedSlideCount: 7,
      },
    ]);
    expect(legacy).toBeDefined();
    expect(isLegacyCreativeBrief(legacy as NormalizedCarouselBrief)).toBe(true);
    const handoff = buildStudioRemakeHandoff(legacy as NormalizedCarouselBrief);
    expect(handoff.creativeBrief).toBeUndefined();
    expect(handoff.angleDirection).toBe(
      "Stop chasing profit first\n\nShow the cash timing trap."
    );
  });
});
