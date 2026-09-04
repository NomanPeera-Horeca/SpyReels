import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "../../_core/llm";
import { generateCarouselAngles } from "../generateCarouselAngles";

const mockedInvokeLLM = vi.mocked(invokeLLM);

function sampleOutline(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    position: i + 1,
    role: i === 0 ? "hook" : i === count - 1 ? "cta" : "insight",
    objective: `Cover beat ${i + 1} without repeating other slides.`,
    recommendedVisual: "text",
    listItemIndex: null,
  }));
}

function fullBrief(args: {
  title: string;
  contentFormat: "story" | "breakdown" | "comparison" | "framework";
  scores: {
    relevance: number;
    usefulness: number;
    specificity: number;
    visualPotential: number;
    factualSafety: number;
    originality: number;
  };
}) {
  return {
    kicker: args.contentFormat,
    title: args.title,
    description: `A ${args.contentFormat} strategy for the source.`,
    estimatedSlideCount: 6,
    topic: "restaurant equipment",
    inferredAudience: "restaurant owners",
    audienceReasoning: "The source names restaurant operators.",
    contentGoal: "education",
    contentFormat: args.contentFormat,
    angleType:
      args.contentFormat === "story"
        ? "story"
        : args.contentFormat === "comparison"
          ? "contrarian"
          : args.contentFormat === "framework"
            ? "how_to"
            : "mistakes",
    hook: `${args.title} hook`,
    corePromise: `${args.title} promise`,
    centralInsight: `${args.title} insight`,
    keyPoints: [
      { title: "One", explanation: "First useful point.", purpose: "Open." },
      { title: "Two", explanation: "Second useful point.", purpose: "Prove." },
      { title: "Three", explanation: "Third useful point.", purpose: "Cost." },
      { title: "Four", explanation: "Fourth useful point.", purpose: "Close." },
    ],
    slideOutline: sampleOutline(6),
    layoutFamily: args.contentFormat,
    visualDirection: "Clear cards.",
    imageDirection: "Neutral kitchen photos.",
    claimRisk: "medium",
    researchMode: args.contentFormat === "story" ? "none" : "claim_verification",
    evidenceRequirements: ["Verify operational claims"],
    prohibitedClaims: ["Guaranteed profit"],
    ctaDirection: "Save this for the next decision",
    scores: args.scores,
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

const STORY_SCORES = {
  relevance: 92,
  usefulness: 90,
  specificity: 88,
  visualPotential: 86,
  factualSafety: 94,
  originality: 88,
};

const COMPARISON_SCORES = {
  relevance: 78,
  usefulness: 76,
  specificity: 80,
  visualPotential: 88,
  factualSafety: 70,
  originality: 74,
};

const BREAKDOWN_SCORES = {
  relevance: 84,
  usefulness: 86,
  specificity: 82,
  visualPotential: 80,
  factualSafety: 86,
  originality: 72,
};

const ANGLE_MIX = [
  fullBrief({
    title: "Why cheap equipment wrecked my kitchen",
    contentFormat: "story",
    scores: STORY_SCORES,
  }),
  fullBrief({
    title: "Equipment buying mistakes operators repeat",
    contentFormat: "breakdown",
    scores: BREAKDOWN_SCORES,
  }),
  fullBrief({
    title: "Cheap equipment versus buying it right",
    contentFormat: "comparison",
    scores: COMPARISON_SCORES,
  }),
];

describe("generateCarouselAngles format recommendation", () => {
  beforeEach(() => {
    mockedInvokeLLM.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recommends Comparison when the strategist returns a high-confidence comparison format", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmResult({
        recommendedFormat: "comparison",
        formatConfidence: 0.88,
        angles: ANGLE_MIX,
      })
    );

    const { briefs, formatRecommendation } = await generateCarouselAngles({
      sourceContent:
        "Cheap restaurant equipment vs buying the right equipment the first time",
      requiredValidBriefs: 3,
    });

    expect(formatRecommendation).toEqual({
      recommendedFormat: "comparison",
      formatConfidence: 0.88,
    });
    expect(briefs[0]?.contentFormat).toBe("comparison");
    expect(briefs.find((brief) => brief.contentFormat === "story")?.scores.factualSafety).toBe(94);
  });

  it("keeps Story when the strategist recommends Story", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmResult({
        recommendedFormat: "story",
        formatConfidence: 0.91,
        angles: ANGLE_MIX,
      })
    );

    const { briefs } = await generateCarouselAngles({
      sourceContent: "Why I stopped buying the cheapest restaurant equipment",
      requiredValidBriefs: 3,
    });

    expect(briefs[0]?.contentFormat).toBe("story");
  });

  it("falls back to score ranking when recommendation metadata is missing", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmResult({
        angles: ANGLE_MIX,
      })
    );

    const { briefs, formatRecommendation } = await generateCarouselAngles({
      sourceContent:
        "Cheap restaurant equipment vs buying the right equipment the first time",
      requiredValidBriefs: 3,
    });

    expect(formatRecommendation).toBeNull();
    expect(briefs[0]?.contentFormat).toBe("story");
  });

  it("falls back when recommendation metadata is malformed", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmResult({
        recommendedFormat: "listicle",
        formatConfidence: "sure",
        angles: ANGLE_MIX,
      })
    );

    const { briefs, formatRecommendation } = await generateCarouselAngles({
      sourceContent: "Should I replace my fryer?",
      requiredValidBriefs: 3,
    });

    expect(formatRecommendation).toBeNull();
    expect(briefs[0]?.contentFormat).toBe("story");
  });

  it("falls back to score ranking when formatConfidence is below the gate", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmResult({
        recommendedFormat: "comparison",
        formatConfidence: 0.4,
        angles: ANGLE_MIX,
      })
    );

    const { briefs, formatRecommendation } = await generateCarouselAngles({
      sourceContent: "Should I replace my fryer?",
      requiredValidBriefs: 3,
    });

    expect(formatRecommendation).toEqual({
      recommendedFormat: "comparison",
      formatConfidence: 0.4,
    });
    expect(briefs[0]?.contentFormat).toBe("story");
  });

  it("keeps Framework when the strategist recommends Framework", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmResult({
        recommendedFormat: "framework",
        formatConfidence: 0.87,
        angles: [
          fullBrief({
            title: "Repair versus replace side by side",
            contentFormat: "comparison",
            scores: STORY_SCORES,
          }),
          fullBrief({
            title: "The repair or replace decision system",
            contentFormat: "framework",
            scores: COMPARISON_SCORES,
          }),
          fullBrief({
            title: "Why I replaced too late",
            contentFormat: "story",
            scores: BREAKDOWN_SCORES,
          }),
        ],
      })
    );

    const { briefs } = await generateCarouselAngles({
      sourceContent: "The framework I use to decide repair vs replace",
      requiredValidBriefs: 3,
    });

    expect(briefs[0]?.contentFormat).toBe("framework");
  });
});
