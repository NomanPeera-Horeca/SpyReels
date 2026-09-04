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
  contentFormat: "story" | "breakdown" | "comparison";
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
  relevance: 86,
  usefulness: 82,
  specificity: 78,
  visualPotential: 76,
  factualSafety: 92,
  originality: 84,
};

const COMPARISON_SCORES = {
  relevance: 82,
  usefulness: 80,
  specificity: 80,
  visualPotential: 88,
  factualSafety: 70,
  originality: 76,
};

const BREAKDOWN_SCORES = {
  relevance: 84,
  usefulness: 88,
  specificity: 80,
  visualPotential: 78,
  factualSafety: 86,
  originality: 70,
};

describe("generateCarouselAngles format-fit ranking", () => {
  beforeEach(() => {
    mockedInvokeLLM.mockReset();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("recommends Comparison over a higher-scoring Story on a strong contrast prompt", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmResult({
        angles: [
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
        ],
      })
    );

    const briefs = await generateCarouselAngles({
      sourceContent:
        "Cheap restaurant equipment vs buying the right equipment the first time",
      requiredValidBriefs: 3,
    });

    expect(briefs[0]?.contentFormat).toBe("comparison");
    expect(briefs[0]?.title).toBe("Cheap equipment versus buying it right");
  });

  it("still recommends Story for a narrative source with the same candidate mix", async () => {
    mockedInvokeLLM.mockResolvedValueOnce(
      llmResult({
        angles: [
          fullBrief({
            title: "Why I stopped buying the cheapest gear",
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
        ],
      })
    );

    const briefs = await generateCarouselAngles({
      sourceContent: "Why I stopped buying the cheapest restaurant equipment",
      requiredValidBriefs: 3,
    });

    expect(briefs[0]?.contentFormat).toBe("story");
  });
});
