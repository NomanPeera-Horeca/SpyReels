import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANGLE_GENERATION_COMPLETED,
  ANGLE_GENERATION_FAILED,
  ANGLE_GENERATION_STARTED,
} from "../angleGenerationObservability";

vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../../_core/llm";
import { generateCarouselAngles } from "../generateCarouselAngles";

const mockedInvokeLLM = vi.mocked(invokeLLM);

const SECRET_SOURCE =
  "UNIQUE_SECRET_SOURCE_TEXT_about_my_private_product_recipe";

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

function sampleKeyPoints() {
  return Array.from({ length: 4 }, (_, i) => ({
    title: `Point ${i + 1}`,
    explanation: `Explain useful point ${i + 1} in one sentence.`,
    purpose: `Advance the argument at step ${i + 1}.`,
  }));
}

function rawBrief(title: string, angleType: "diagnostic" | "story" | "how_to") {
  return {
    kicker: "Diagnostic",
    title,
    description: "Show why cash runs out before profit.",
    estimatedSlideCount: 6,
    topic: "small business cash flow",
    inferredAudience: "small business owners",
    audienceReasoning: "The source names this audience.",
    contentGoal: "education",
    contentFormat: "breakdown",
    angleType,
    hook: "Profit on paper, empty in the bank.",
    corePromise: "See the cash leaks before they compound.",
    centralInsight: "Cash timing is the silent killer.",
    keyPoints: sampleKeyPoints(),
    slideOutline: sampleOutline(6),
    layoutFamily: "breakdown",
    visualDirection: "Simple numbered breakdown cards.",
    imageDirection: "Neutral desk and ledger photos.",
    claimRisk: "medium",
    researchMode: "claim_verification",
    evidenceRequirements: ["Verify cash-cycle claims"],
    prohibitedClaims: ["Guaranteed profit in 30 days"],
    ctaDirection: "Save this cash-check list",
    scores: {
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

function llmResult(angles: unknown[]) {
  return {
    id: "msg_test",
    created: 0,
    model: "claude-sonnet-4-6",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant" as const,
          content: JSON.stringify({ angles }),
        },
        finish_reason: "stop",
      },
    ],
  };
}

function flattenLogCalls(spy: { mock: { calls: unknown[][] } }): string {
  return spy.mock.calls
    .map((args) =>
      args
        .map((arg) =>
          typeof arg === "string" ? arg : JSON.stringify(arg)
        )
        .join(" ")
    )
    .join("\n");
}

describe("generateCarouselAngles observability", () => {
  let info: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockedInvokeLLM.mockReset();
    info = vi.spyOn(console, "info").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs start and completion on success and returns three briefs", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmResult([
        rawBrief("Cash is a system", "diagnostic"),
        rawBrief("A cash story", "story"),
        rawBrief("A cash how-to", "how_to"),
      ])
    );

    const briefs = await generateCarouselAngles({
      sourceContent: SECRET_SOURCE,
      niche: "restaurant owners",
      brandVoice: "Direct and practical",
      correlationId: "corr-success",
      entryPoint: "carouselStudio.generateFromInput",
    });

    expect(briefs).toHaveLength(3);
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
    expect(mockedInvokeLLM.mock.calls[0]?.[0]?.operation).toBe(
      "angle_generation"
    );

    const dumped = flattenLogCalls(info);
    expect(dumped).toContain(ANGLE_GENERATION_STARTED);
    expect(dumped).toContain(ANGLE_GENERATION_COMPLETED);
    expect(dumped).toContain("corr-success");
    expect(dumped).toContain("carouselStudio.generateFromInput");
    expect(dumped).toContain('"repairRan":false');
    expect(dumped).toContain('"acceptedSemanticCandidateCount":3');
    expect(dumped).not.toContain(SECRET_SOURCE);
    expect(dumped).not.toContain("Direct and practical");
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs the original invokeLLM error and rethrows it unchanged", async () => {
    const original = Object.assign(
      new Error("tools.0.custom: compiled grammar is too large"),
      { name: "BadRequestError", status: 400, requestID: "req_angles" }
    );
    mockedInvokeLLM.mockRejectedValueOnce(original);

    await expect(
      generateCarouselAngles({
        sourceContent: SECRET_SOURCE,
        correlationId: "corr-gen-fail",
      })
    ).rejects.toBe(original);

    const dumped = flattenLogCalls(errorSpy);
    expect(dumped).toContain(ANGLE_GENERATION_FAILED);
    expect(dumped).toContain("tools.0.custom: compiled grammar is too large");
    expect(dumped).toContain("BadRequestError");
    expect(dumped).toContain("req_angles");
    expect(dumped).toContain('"statusCode":400');
    expect(dumped).toContain("corr-gen-fail");
    expect(dumped).not.toContain(SECRET_SOURCE);
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
  });
});
