import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CREATIVE_BRIEF_NOT_FACTUAL_SOURCE_RULE,
  selectRecommendedCreativeBrief,
  validateCarouselBriefSemantics,
} from "@shared/carouselStudio";
import { ANGLE_GENERATION_COMPLETED } from "../angleGenerationObservability";
import { buildCarouselRemakePrompt } from "../generateCarouselRemake";

vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../../_core/llm";
import { generateCarouselAngles } from "../generateCarouselAngles";
import { CASH_LEAKS_REMAKE_64_BRIEF } from "./fixtures/cashLeaksRemake64";

const mockedInvokeLLM = vi.mocked(invokeLLM);

function sampleOutline(count: number, lastRole: "takeaway" | "insight" = "takeaway") {
  const roles = [
    "hook",
    "context",
    "problem",
    "insight",
    "example",
    lastRole,
  ] as const;
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    role: roles[Math.min(i, roles.length - 1)]!,
    objective: `Cover beat ${i + 1} without repeating other slides.`,
    recommendedVisual: i === 0 ? "text" : "checklist",
  }));
}

function sampleKeyPoints() {
  return Array.from({ length: 4 }, (_, i) => ({
    title: `Point ${i + 1}`,
    explanation: `Explain useful point ${i + 1} in one sentence.`,
    purpose: `Advance the argument at step ${i + 1}.`,
  }));
}

function rawBrief(
  overrides: {
    title: string;
    angleType: "diagnostic" | "story" | "how_to";
    contentFormat?: "breakdown" | "story" | "framework";
    centralInsight?: string;
    scores?: {
      relevance: number;
      usefulness: number;
      specificity: number;
      visualPotential: number;
      factualSafety: number;
      originality: number;
    };
    lastRole?: "takeaway" | "insight";
  }
) {
  const contentFormat =
    overrides.contentFormat ??
    (overrides.angleType === "story"
      ? "story"
      : overrides.angleType === "how_to"
        ? "framework"
        : "breakdown");
  return {
    kicker: "Diagnostic",
    title: overrides.title,
    description: "Show why cash runs out before profit.",
    estimatedSlideCount: 6,
    topic: "small business cash flow",
    inferredAudience: "small business owners",
    audienceReasoning: "The source names this audience.",
    contentGoal: "education",
    contentFormat,
    angleType: overrides.angleType,
    hook: "Profit on paper, empty in the bank.",
    corePromise: "See the cash leaks before they compound.",
    centralInsight: overrides.centralInsight ?? `${overrides.title} insight.`,
    keyPoints: sampleKeyPoints(),
    slideOutline: sampleOutline(6, overrides.lastRole),
    layoutFamily: contentFormat,
    visualDirection: "Simple numbered breakdown cards.",
    imageDirection: "Neutral desk and ledger photos.",
    claimRisk: "medium",
    researchMode: "claim_verification",
    evidenceRequirements: ["Verify cash-cycle claims"],
    prohibitedClaims: ["Guaranteed profit in 30 days"],
    ctaDirection: "Save this cash-check list",
    scores: overrides.scores ?? {
      relevance: 80,
      usefulness: 70,
      specificity: 60,
      visualPotential: 50,
      factualSafety: 90,
      originality: 40,
    },
    confidence: 0.8,
  };
}

function invalidBrief(title: string) {
  return rawBrief({
    title,
    angleType: "diagnostic",
    lastRole: "insight",
  });
}

function compactCandidate(overrides: {
  title: string;
  angleType: "diagnostic" | "story" | "how_to";
  scores?: {
    relevance: number;
    usefulness: number;
    specificity: number;
    visualPotential: number;
    factualSafety: number;
    originality: number;
  };
}) {
  const contentFormat =
    overrides.angleType === "story"
      ? "story"
      : overrides.angleType === "how_to"
        ? "framework"
        : "breakdown";
  return {
    kicker: "Diagnostic",
    title: overrides.title,
    description: "Show why cash runs out before profit.",
    estimatedSlideCount: 6,
    topic: "small business cash flow",
    inferredAudience: "small business owners",
    contentGoal: "education",
    contentFormat,
    angleType: overrides.angleType,
    hook: "Profit on paper, empty in the bank.",
    corePromise: "See the cash leaks before they compound.",
    centralInsight: `${overrides.title} insight.`,
    layoutFamily: contentFormat,
    claimRisk: "medium",
    researchMode: "claim_verification",
    scores: overrides.scores ?? {
      relevance: 80,
      usefulness: 70,
      specificity: 60,
      visualPotential: 50,
      factualSafety: 90,
      originality: 40,
    },
    confidence: 0.8,
  };
}

function llmResult(payload: Record<string, unknown>) {
  return {
    id: "msg_test",
    created: 0,
    model: "claude-sonnet-4-6",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as const,
          content: JSON.stringify(payload),
        },
        finish_reason: "stop",
      },
    ],
  };
}

function anglesResult(angles: unknown[]) {
  return llmResult({ angles });
}

function briefResult(brief: unknown) {
  return llmResult({ brief });
}

function flattenLogCalls(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls
    .map((args) =>
      args
        .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
        .join(" ")
    )
    .join("\n");
}

function completionPayload(): Record<string, unknown> {
  const call = (console.info as unknown as { mock: { calls: unknown[][] } }).mock
    .calls
    .find((entry) => entry[0] === ANGLE_GENERATION_COMPLETED);
  expect(call).toBeDefined();
  return call?.[1] as Record<string, unknown>;
}

describe("generateCarouselAngles graceful degradation", () => {
  let info: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedInvokeLLM.mockReset();
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("auto mode repairs a compact shortfall then expands the surviving candidates", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(
        anglesResult([
          compactCandidate({ title: "Cash is a system", angleType: "diagnostic" }),
        ])
      )
      .mockResolvedValueOnce(anglesResult([]))
      .mockResolvedValueOnce(
        briefResult(rawBrief({ title: "Cash is a system", angleType: "diagnostic" }))
      );

    const { briefs } = await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 1,
    });

    expect(briefs).toHaveLength(1);
    expect(briefs[0]?.title).toBe("Cash is a system");
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(3);
    const compactRepairPrompt = String(
      mockedInvokeLLM.mock.calls[1]?.[0]?.messages?.[1]?.content ?? ""
    );
    expect(compactRepairPrompt).toContain(
      "Target exactly 3 distinct compact candidates before expansion."
    );
    expect(compactRepairPrompt).toContain("Need 2 additional distinct compact candidates.");
    expect(compactRepairPrompt).toContain('Already accepted: "Cash is a system" (diagnostic).');
    expect(compactRepairPrompt).toContain("Do not duplicate an existing strategy.");
    const payload = completionPayload();
    expect(payload.firstAttemptValidCount).toBe(1);
    expect(payload.repairAttemptValidCount).toBe(0);
    expect(payload.mergedValidCount).toBe(1);
    expect(payload.requiredValidBriefs).toBe(1);
    expect(payload.compactRepairRan).toBe(true);
    expect(payload.completeFullBriefCount).toBe(1);
    expect(payload.fewerThanThreeCompleteFullBriefs).toBe(true);
    expect(payload.rankedFullBriefCount).toBe(1);
    expect(payload.proceededWithGracefulDegradation).toBe(true);
    expect(payload.angleGenerationMode).toBe("parallel_full_expansions");
  });

  it("auto mode repairs only when an expansion first pass is invalid", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(
        anglesResult([
          compactCandidate({ title: "Cash is a system", angleType: "diagnostic" }),
        ])
      )
      .mockResolvedValueOnce(anglesResult([]))
      .mockResolvedValueOnce(briefResult(invalidBrief("Broken A")))
      .mockResolvedValueOnce(
        briefResult(rawBrief({ title: "Repaired cash plan", angleType: "diagnostic" }))
      );

    const { briefs } = await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 1,
    });

    expect(briefs).toHaveLength(1);
    expect(briefs[0]?.title).toBe("Repaired cash plan");
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(4);
    const payload = completionPayload();
    expect(payload.firstAttemptValidCount).toBe(0);
    expect(payload.repairAttemptValidCount).toBe(1);
    expect(payload.repairRan).toBe(true);
    expect(payload.proceededWithGracefulDegradation).toBe(true);
  });

  it("auto mode fails when first and repair both have zero valid briefs", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(
        anglesResult([
          compactCandidate({ title: "Broken A", angleType: "diagnostic" }),
        ])
      )
      .mockResolvedValueOnce(anglesResult([]))
      .mockResolvedValueOnce(briefResult(invalidBrief("Broken A")))
      .mockResolvedValueOnce(briefResult(invalidBrief("Broken B")));

    await expect(
      generateCarouselAngles({
        sourceContent: "Why small businesses run out of cash.",
        requiredValidBriefs: 1,
      })
    ).rejects.toThrow("Expected at least 1 carousel briefs, got 0.");
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(4);
  });

  it("review mode merges a preserved first brief with two distinct repaired briefs", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(
        anglesResult([
          rawBrief({
            title: "Cash is a system",
            angleType: "diagnostic",
            centralInsight: "Cash timing is the silent killer.",
          }),
          invalidBrief("Broken story"),
          invalidBrief("Broken how-to"),
        ])
      )
      .mockResolvedValueOnce(
        anglesResult([
          rawBrief({
            title: "A cash story",
            angleType: "story",
            centralInsight: "Owners hide the leak in a weekly scene.",
          }),
          rawBrief({
            title: "A cash how-to",
            angleType: "how_to",
            centralInsight: "A weekly cash check prevents surprise shortages.",
          }),
          invalidBrief("Still broken"),
        ])
      );

    const { briefs } = await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 3,
    });

    expect(briefs).toHaveLength(3);
    expect(briefs.map((brief) => brief.title)).toEqual(
      expect.arrayContaining([
        "Cash is a system",
        "A cash story",
        "A cash how-to",
      ])
    );
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(2);
    const repairPrompt = String(
      mockedInvokeLLM.mock.calls[1]?.[0]?.messages?.[1]?.content ?? ""
    );
    expect(repairPrompt).toContain("Need 2 additional distinct briefs.");
    expect(repairPrompt).toContain('Already accepted: "Cash is a system" (diagnostic).');
    expect(repairPrompt).toContain("Generate distinct replacements.");
    const payload = completionPayload();
    expect(payload.firstAttemptValidCount).toBe(1);
    expect(payload.repairAttemptValidCount).toBe(2);
    expect(payload.mergedValidCount).toBe(3);
    expect(payload.requiredValidBriefs).toBe(3);
    expect(payload.repairRan).toBe(true);
    expect(payload.proceededWithGracefulDegradation).toBe(false);
  });

  it("review mode preserves the first-attempt valid brief", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(
        anglesResult([
          rawBrief({
            title: "Keep this first brief",
            angleType: "diagnostic",
            centralInsight: "Preserve the accepted first plan.",
          }),
          invalidBrief("Broken extra"),
        ])
      )
      .mockResolvedValueOnce(anglesResult([invalidBrief("Repair failed")]));

    const { briefs } = await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 3,
    });

    expect(briefs.map((brief) => brief.title)).toContain("Keep this first brief");
    expect(briefs).toHaveLength(1);
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(2);
    const payload = completionPayload();
    expect(payload.firstAttemptValidCount).toBe(1);
    expect(payload.mergedValidCount).toBe(1);
    expect(payload.proceededWithGracefulDegradation).toBe(true);
  });

  it("does not count a duplicate repaired brief twice", async () => {
    const shared = rawBrief({
      title: "Cash is a system",
      angleType: "diagnostic",
      contentFormat: "breakdown",
      centralInsight: "Cash timing is the silent killer.",
    });
    mockedInvokeLLM
      .mockResolvedValueOnce(anglesResult([shared, invalidBrief("Broken extra")]))
      .mockResolvedValueOnce(
        anglesResult([
          shared,
          rawBrief({
            title: "A cash story",
            angleType: "story",
            centralInsight: "Owners hide the leak in a weekly scene.",
          }),
        ])
      );

    const { briefs } = await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 3,
    });

    expect(briefs.filter((brief) => brief.title === "Cash is a system")).toHaveLength(
      1
    );
    expect(briefs).toHaveLength(2);
    const payload = completionPayload();
    expect(payload.mergedValidCount).toBe(2);
  });

  it("recommends the highest-scoring valid brief", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(
        anglesResult([
          compactCandidate({
            title: "Low score plan",
            angleType: "diagnostic",
            scores: {
              relevance: 99,
              usefulness: 99,
              specificity: 99,
              visualPotential: 99,
              factualSafety: 99,
              originality: 99,
            },
          }),
          compactCandidate({
            title: "Highest score plan",
            angleType: "story",
            scores: {
              relevance: 10,
              usefulness: 10,
              specificity: 10,
              visualPotential: 10,
              factualSafety: 10,
              originality: 10,
            },
          }),
          compactCandidate({
            title: "Mid score plan",
            angleType: "how_to",
            scores: {
              relevance: 50,
              usefulness: 50,
              specificity: 50,
              visualPotential: 50,
              factualSafety: 50,
              originality: 50,
            },
          }),
        ])
      )
      .mockResolvedValueOnce(
        briefResult(
          rawBrief({
            title: "Low score plan",
            angleType: "diagnostic",
            scores: {
              relevance: 20,
              usefulness: 20,
              specificity: 20,
              visualPotential: 20,
              factualSafety: 20,
              originality: 20,
            },
          })
        )
      )
      .mockResolvedValueOnce(
        briefResult(
          rawBrief({
            title: "Highest score plan",
            angleType: "story",
            scores: {
              relevance: 95,
              usefulness: 95,
              specificity: 95,
              visualPotential: 95,
              factualSafety: 95,
              originality: 95,
            },
          })
        )
      )
      .mockResolvedValueOnce(
        briefResult(
          rawBrief({
            title: "Mid score plan",
            angleType: "how_to",
            scores: {
              relevance: 40,
              usefulness: 40,
              specificity: 40,
              visualPotential: 40,
              factualSafety: 40,
              originality: 40,
            },
          })
        )
      );

    const { briefs } = await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 1,
    });

    expect(briefs[0]?.title).toBe("Highest score plan");
    expect(selectRecommendedCreativeBrief(briefs).brief?.title).toBe(
      "Highest score plan"
    );
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(4);
  });

  it("still rejects semantically invalid briefs", async () => {
    const invalid = invalidBrief("Invalid closer");
    expect(validateCarouselBriefSemantics(invalid as never).length).toBeGreaterThan(
      0
    );
    expect(validateCarouselBriefSemantics(CASH_LEAKS_REMAKE_64_BRIEF).length).toBeGreaterThan(
      0
    );
    mockedInvokeLLM
      .mockResolvedValueOnce(
        anglesResult([
          compactCandidate({ title: "Invalid closer", angleType: "diagnostic" }),
          compactCandidate({
            title: CASH_LEAKS_REMAKE_64_BRIEF.title,
            angleType: "story",
          }),
          compactCandidate({ title: "Valid cash plan", angleType: "how_to" }),
        ])
      )
      .mockResolvedValueOnce(briefResult(invalid))
      .mockResolvedValueOnce(briefResult(CASH_LEAKS_REMAKE_64_BRIEF))
      .mockResolvedValueOnce(
        briefResult(rawBrief({ title: "Valid cash plan", angleType: "diagnostic" }))
      )
      .mockResolvedValueOnce(briefResult(invalid))
      .mockResolvedValueOnce(briefResult(CASH_LEAKS_REMAKE_64_BRIEF));

    const { briefs } = await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 1,
    });

    expect(briefs.map((brief) => brief.title)).toEqual(["Valid cash plan"]);
    expect(briefs.map((brief) => brief.title)).not.toContain("Invalid closer");
    expect(briefs.map((brief) => brief.title)).not.toContain(
      CASH_LEAKS_REMAKE_64_BRIEF.title
    );
    const payload = completionPayload();
    const issues = payload.semanticIssuesByCandidate as Array<{
      candidateIndex: number;
      codes: string[];
    }>;
    expect(issues.some((row) => row.codes.includes("missing_final_closing"))).toBe(
      true
    );
    expect(flattenLogCalls(info)).not.toContain("Invalid closer");
    expect(flattenLogCalls(info)).not.toContain(
      "Why small businesses run out of cash."
    );
  });

  it("defaults to Review Plan repair when requiredValidBriefs is omitted", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(
        anglesResult([
          rawBrief({ title: "Only first brief", angleType: "diagnostic" }),
          invalidBrief("Broken extra"),
        ])
      )
      .mockResolvedValueOnce(
        anglesResult([
          rawBrief({
            title: "Repaired story",
            angleType: "story",
            centralInsight: "A weekly scene makes the leak visible.",
          }),
          rawBrief({
            title: "Repaired how-to",
            angleType: "how_to",
            centralInsight: "A weekly cash check prevents surprise shortages.",
          }),
        ])
      );

    const { briefs } = await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
    });

    expect(mockedInvokeLLM).toHaveBeenCalledTimes(2);
    expect(briefs).toHaveLength(3);
    expect(briefs.map((brief) => brief.title)).toEqual(
      expect.arrayContaining([
        "Only first brief",
        "Repaired story",
        "Repaired how-to",
      ])
    );
  });

  it("never makes a third LLM call", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(anglesResult([invalidBrief("Broken A")]))
      .mockResolvedValueOnce(anglesResult([invalidBrief("Broken B")]));

    await expect(
      generateCarouselAngles({
        sourceContent: "Why small businesses run out of cash.",
        requiredValidBriefs: 3,
      })
    ).rejects.toThrow("Expected 3 carousel briefs, got 0.");
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(2);
  });

  it("leaves copy-generation prompt construction unchanged", () => {
    const slides = [
      {
        id: "slide_01",
        role: "hook" as const,
        viralWhy: "Stop the scroll",
        layoutId: "hook_bold_center",
        slots: [
          {
            id: "headline",
            role: "headline" as const,
            label: "Headline",
            budget: { min: 8, max: 60 },
            defaultText: "Headline here",
          },
        ],
      },
    ];
    const source = "Make me a carousel about why small businesses run out of cash.";
    const prompt = buildCarouselRemakePrompt(
      "Photo story",
      "Photo-led carousel",
      slides,
      "infer from source",
      new Map(),
      source,
      CASH_LEAKS_REMAKE_64_BRIEF
    );

    expect(prompt).toContain("A. ORIGINAL SOURCE MATERIAL");
    expect(prompt).toContain(source);
    expect(prompt).toContain("B. APPROVED CREATIVE BRIEF");
    expect(prompt).toContain(CREATIVE_BRIEF_NOT_FACTUAL_SOURCE_RULE);
    expect(prompt).not.toContain("Chosen carousel angle (follow this direction):");
  });
});
