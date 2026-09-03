import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../../_core/llm";
import {
  ANGLE_COMPACT_CANDIDATE_MODEL,
  ANGLE_EXPANSION_MODEL,
  ANGLE_HAIKU_MODEL,
  ANGLE_REVIEW_PLAN_MODEL,
  generateCarouselAngles,
  resolveCompactCandidateModel,
} from "../generateCarouselAngles";

const mockedInvokeLLM = vi.mocked(invokeLLM);

function sampleOutline(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    role: i === 0 ? "hook" : i === count - 1 ? "takeaway" : "problem",
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

function compactCandidate() {
  return {
    kicker: "Diagnostic",
    title: "Cash timing kills profit",
    description: "Show why cash runs out before profit.",
    estimatedSlideCount: 6,
    topic: "small business cash flow",
    inferredAudience: "small business owners",
    contentGoal: "education",
    contentFormat: "breakdown",
    angleType: "diagnostic",
    hook: "Profit on paper, empty in the bank.",
    corePromise: "See the cash leaks before they compound.",
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
    },
    confidence: 0.8,
  };
}

function listCompactCandidate() {
  return {
    ...compactCandidate(),
    title: "The 6 Silent Cash Drains Killing Small Businesses",
    hook: "The 6 Silent Cash Drains Killing Small Businesses",
    corePromise: "Name the six cash drains owners miss.",
    estimatedSlideCount: 8,
  };
}

function expansionPayload(slideCount = 6) {
  return {
    audienceReasoning: "The source names this audience.",
    keyPoints: sampleKeyPoints(),
    slideOutline: sampleOutline(slideCount),
    visualDirection: "Simple numbered breakdown cards.",
    imageDirection: "Neutral desk and ledger photos.",
    evidenceRequirements: ["Verify cash-cycle claims"],
    prohibitedClaims: ["Guaranteed profit in 30 days"],
    ctaDirection: "Save this cash-check list",
  };
}

function rawBrief() {
  return {
    ...compactCandidate(),
    ...expansionPayload(),
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

describe("generateCarouselAngles model routing", () => {
  beforeEach(() => {
    mockedInvokeLLM.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps Review Plan on the existing Sonnet model", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmResult({
        angles: [rawBrief(), { ...rawBrief(), title: "Story", angleType: "story", contentFormat: "story", layoutFamily: "story" }, { ...rawBrief(), title: "How to", angleType: "how_to", contentFormat: "framework", layoutFamily: "framework" }],
      })
    );

    await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 3,
    });

    expect(mockedInvokeLLM.mock.calls[0]?.[0]?.model).toBeUndefined();
    expect(ANGLE_REVIEW_PLAN_MODEL).toBe("claude-sonnet-4-6");
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
  });

  it("routes explicit-list compact to Haiku and expansion to Sonnet", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult({ angles: [listCompactCandidate()] }))
      .mockResolvedValueOnce(llmResult({ expansion: expansionPayload(8) }));

    await generateCarouselAngles({
      sourceContent: "The 6 Silent Cash Drains Killing Small Businesses",
      requiredValidBriefs: 1,
    });

    expect(ANGLE_COMPACT_CANDIDATE_MODEL).toBe(ANGLE_HAIKU_MODEL);
    expect(ANGLE_EXPANSION_MODEL).toBe(ANGLE_REVIEW_PLAN_MODEL);
    expect(
      resolveCompactCandidateModel(
        "The 6 Silent Cash Drains Killing Small Businesses"
      )
    ).toBe(ANGLE_HAIKU_MODEL);
    expect(mockedInvokeLLM.mock.calls[0]?.[0]?.model).toBe(ANGLE_HAIKU_MODEL);
    expect(mockedInvokeLLM.mock.calls[1]?.[0]?.model).toBe(
      ANGLE_REVIEW_PLAN_MODEL
    );
  });

  it("routes open-ended story compact to Sonnet and expansion to Sonnet", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult({ angles: [compactCandidate()] }))
      .mockResolvedValueOnce(llmResult({ expansion: expansionPayload() }));

    await generateCarouselAngles({
      sourceContent:
        "How I lost my first company and rebuilt from scratch as a solo founder",
      requiredValidBriefs: 1,
    });

    expect(
      resolveCompactCandidateModel(
        "How I lost my first company and rebuilt from scratch as a solo founder"
      )
    ).toBe(ANGLE_REVIEW_PLAN_MODEL);
    expect(mockedInvokeLLM.mock.calls[0]?.[0]?.model).toBe(
      ANGLE_REVIEW_PLAN_MODEL
    );
    expect(mockedInvokeLLM.mock.calls[1]?.[0]?.model).toBe(
      ANGLE_REVIEW_PLAN_MODEL
    );
  });

  it("keeps compact Haiku and expansion Sonnet constants explicit", () => {
    expect(ANGLE_COMPACT_CANDIDATE_MODEL).toBe(ANGLE_HAIKU_MODEL);
    expect(ANGLE_EXPANSION_MODEL).toBe(ANGLE_REVIEW_PLAN_MODEL);
    expect(ANGLE_HAIKU_MODEL).toBe("claude-haiku-4-5-20251001");
    expect(ANGLE_REVIEW_PLAN_MODEL).toBe("claude-sonnet-4-6");
  });

  it("honors compact and expansion model overrides", async () => {
    mockedInvokeLLM
      .mockResolvedValueOnce(llmResult({ angles: [compactCandidate()] }))
      .mockResolvedValueOnce(llmResult({ expansion: expansionPayload() }));

    await generateCarouselAngles({
      sourceContent: "Why small businesses run out of cash.",
      requiredValidBriefs: 1,
      compactModel: ANGLE_HAIKU_MODEL,
      expansionModel: ANGLE_REVIEW_PLAN_MODEL,
    });

    expect(mockedInvokeLLM.mock.calls[0]?.[0]?.model).toBe(ANGLE_HAIKU_MODEL);
    expect(mockedInvokeLLM.mock.calls[1]?.[0]?.model).toBe(
      ANGLE_REVIEW_PLAN_MODEL
    );
  });
});
