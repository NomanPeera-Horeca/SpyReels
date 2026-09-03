import { describe, expect, it } from "vitest";
import {
  assembleCarouselCreativeBriefFromExpansion,
  buildCarouselAngleExpansionJsonSchema,
  buildCarouselAngleExpansionSystemPrompt,
  buildCarouselAngleExpansionUserPrompt,
  type CarouselAngleCandidate,
} from "../generateCarouselAngles";
import {
  detectExplicitCarouselListContract,
  normalizeGeneratedCarouselBrief,
  selectSemanticallyValidCarouselBriefs,
  validateCarouselBriefSemantics,
} from "@shared/carouselStudio";

const CASH_DRAINS_SOURCE = "The 6 Silent Cash Drains Killing Small Businesses";

function sampleCandidate(
  overrides: Partial<CarouselAngleCandidate> = {}
): CarouselAngleCandidate {
  return {
    kicker: "Diagnostic",
    title: "The 6 Silent Cash Drains Killing Small Businesses",
    description: "Name the six cash drains owners miss.",
    estimatedSlideCount: 8,
    topic: "cash drains",
    inferredAudience: "small business owners",
    contentGoal: "education",
    contentFormat: "breakdown",
    angleType: "diagnostic",
    hook: "The 6 Silent Cash Drains Killing Small Businesses",
    corePromise: "Name the six cash drains owners miss.",
    centralInsight: "Cash timing is the silent killer.",
    layoutFamily: "breakdown",
    claimRisk: "medium",
    researchMode: "claim_verification",
    scores: {
      relevance: 80,
      usefulness: 70,
      specificity: 60,
      visualPotential: 50,
      factualSafety: 90,
      originality: 40,
      overall: 65,
    },
    confidence: 0.8,
    ...overrides,
  };
}

function sampleKeyPoints() {
  return Array.from({ length: 6 }, (_, i) => ({
    title: `Cash drain ${i + 1}`,
    explanation: `Explain cash drain ${i + 1} in one sentence.`,
    purpose: `Name drain ${i + 1} so owners can audit it.`,
  }));
}

function cashDrainsOutline(options?: { includeContext?: boolean }) {
  const items = Array.from({ length: 6 }, (_, i) => ({
    position: i + 2,
    role: "problem" as const,
    objective: `Introduce cash drain ${i + 1} with a concrete owner scenario.`,
    recommendedVisual: "checklist" as const,
    listItemIndex: i + 1,
  }));
  if (options?.includeContext) {
    return [
      {
        position: 1,
        role: "hook" as const,
        objective: "Stop the scroll with the cash timing paradox.",
        recommendedVisual: "text" as const,
        listItemIndex: null,
      },
      {
        position: 2,
        role: "context" as const,
        objective: "Explain profit versus cash before naming the drains.",
        recommendedVisual: "text" as const,
        listItemIndex: null,
      },
      ...items.map((item, i) => ({ ...item, position: i + 3 })),
      {
        position: 9,
        role: "takeaway" as const,
        objective: "Close with one next cash check.",
        recommendedVisual: "text" as const,
        listItemIndex: null,
      },
    ];
  }
  return [
    {
      position: 1,
      role: "hook" as const,
      objective: "Stop the scroll with the cash timing paradox.",
      recommendedVisual: "text" as const,
      listItemIndex: null,
    },
    ...items,
    {
      position: 8,
      role: "takeaway" as const,
      objective: "Close with one next cash check.",
      recommendedVisual: "text" as const,
      listItemIndex: null,
    },
  ];
}

function validExpansionPayload() {
  return {
    audienceReasoning: "The source names small business owners.",
    keyPoints: sampleKeyPoints(),
    slideOutline: cashDrainsOutline(),
    visualDirection: "Numbered breakdown cards with one drain per slide.",
    imageDirection: "Neutral desk and ledger photos.",
    evidenceRequirements: ["Verify cash-cycle claims"],
    prohibitedClaims: ["Guaranteed profit in 30 days"],
    ctaDirection: "Save this cash-check list",
  };
}

describe("carousel angle expansion contract", () => {
  it("does not ask the model to regenerate selected strategy fields", () => {
    const schema = buildCarouselAngleExpansionJsonSchema();
    const expansion = (
      schema.schema.properties as {
        expansion: { required: string[]; properties: Record<string, unknown> };
      }
    ).expansion;
    const strategyFields = [
      "title",
      "hook",
      "corePromise",
      "centralInsight",
      "estimatedSlideCount",
      "inferredAudience",
      "contentFormat",
      "layoutFamily",
      "angleType",
      "researchMode",
      "scores",
    ];
    for (const field of strategyFields) {
      expect(expansion.required).not.toContain(field);
      expect(expansion.properties).not.toHaveProperty(field);
    }
    const system = buildCarouselAngleExpansionSystemPrompt();
    const user = buildCarouselAngleExpansionUserPrompt({
      sourceContent: CASH_DRAINS_SOURCE,
      candidate: sampleCandidate(),
    });
    expect(system).toContain("Do not regenerate title, hook, corePromise");
    expect(user).toContain("Do not regenerate title, hook, corePromise");
    expect(user).not.toContain("Preserve its title, angleType");
    expect(user).not.toContain("Score relevance, usefulness");
  });

  it("copies selected strategy fields onto the assembled brief", () => {
    const candidate = sampleCandidate({
      title: "Selected cash drain title",
      hook: "Selected cash drain hook",
      corePromise: "Selected cash drain promise.",
      centralInsight: "Selected cash drain insight.",
    });
    const assembled = assembleCarouselCreativeBriefFromExpansion(candidate, {
      ...validExpansionPayload(),
      title: "Expansion tried to rename this",
      hook: "Expansion tried to rewrite the hook",
      corePromise: "Expansion tried to change the promise.",
      estimatedSlideCount: 11,
      angleType: "story",
    });

    expect(assembled.title).toBe("Selected cash drain title");
    expect(assembled.hook).toBe("Selected cash drain hook");
    expect(assembled.corePromise).toBe("Selected cash drain promise.");
    expect(assembled.centralInsight).toBe("Selected cash drain insight.");
    expect(assembled.estimatedSlideCount).toBe(8);
    expect(assembled.angleType).toBe("diagnostic");
    expect(assembled.contentFormat).toBe("breakdown");
    expect(assembled.layoutFamily).toBe("breakdown");
    expect(assembled.inferredAudience).toBe("small business owners");
    expect(assembled.researchMode).toBe("claim_verification");
    expect(assembled.ctaDirection).toBe("Save this cash-check list");
    expect(assembled.audienceReasoning).toBe(
      "The source names small business owners."
    );
  });

  it("enforces list outline rules on the assembled brief", () => {
    const candidate = sampleCandidate();
    const listContract = detectExplicitCarouselListContract(CASH_DRAINS_SOURCE);
    expect(listContract?.promisedCount).toBe(6);
    expect(listContract?.promisedItemType).toBe("cash drains");

    const validAssembled = assembleCarouselCreativeBriefFromExpansion(
      candidate,
      validExpansionPayload()
    );
    const validBrief = normalizeGeneratedCarouselBrief(validAssembled, 0);
    expect(validBrief).not.toBeNull();
    expect(validateCarouselBriefSemantics(validBrief!, listContract)).toEqual([]);
    expect(
      selectSemanticallyValidCarouselBriefs([validBrief!], listContract).briefs
    ).toHaveLength(1);
    expect(validBrief?.slideOutline.map((slide) => slide.listItemIndex)).toEqual([
      null,
      1,
      2,
      3,
      4,
      5,
      6,
      null,
    ]);

    const tooLongAssembled = assembleCarouselCreativeBriefFromExpansion(
      candidate,
      {
        ...validExpansionPayload(),
        slideOutline: cashDrainsOutline({ includeContext: true }),
      }
    );
    expect(tooLongAssembled.estimatedSlideCount).toBe(8);
    const truncatedBrief = normalizeGeneratedCarouselBrief(tooLongAssembled, 0);
    expect(truncatedBrief).not.toBeNull();
    expect(validateCarouselBriefSemantics(truncatedBrief!, listContract).length).toBeGreaterThan(
      0
    );
    expect(
      selectSemanticallyValidCarouselBriefs([truncatedBrief!], listContract).briefs
    ).toEqual([]);

    const contextOnEight = [
      {
        position: 1,
        role: "hook",
        objective: "Stop the scroll with the cash timing paradox.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      {
        position: 2,
        role: "context",
        objective: "Explain profit versus cash before naming the drains.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
      ...Array.from({ length: 5 }, (_, i) => ({
        position: i + 3,
        role: "problem",
        objective: `Introduce cash drain ${i + 1} with a concrete owner scenario.`,
        recommendedVisual: "checklist",
        listItemIndex: i + 1,
      })),
      {
        position: 8,
        role: "takeaway",
        objective: "Close with one next cash check.",
        recommendedVisual: "text",
        listItemIndex: null,
      },
    ];
    const invalidAssembled = assembleCarouselCreativeBriefFromExpansion(
      candidate,
      {
        ...validExpansionPayload(),
        slideOutline: contextOnEight,
      }
    );
    const invalidBrief = normalizeGeneratedCarouselBrief(invalidAssembled, 0);
    expect(invalidBrief).not.toBeNull();
    expect(validateCarouselBriefSemantics(invalidBrief!, listContract)).toContain(
      "Simple listicles should not include a standalone context slide"
    );
    expect(
      selectSemanticallyValidCarouselBriefs([invalidBrief!], listContract).briefs
    ).toEqual([]);
  });
});
