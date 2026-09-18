import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

vi.mock("../_core/llm", () => ({
  invokeLLM: mocks.invokeLLM,
}));

import { generateRemakeContent } from "./generateRemakeContent";

const structure = {
  hook: {
    type: "Question",
    text: "Why does this happen?",
    technique: "curiosity gap",
  },
  body: {
    pacing: "Story arc",
    structure: "setup -> contrast -> lesson",
    keyPoints: ["setup", "contrast", "lesson"],
  },
  transition: {
    type: "pivot",
    text: "But here is the thing",
  },
  cta: {
    type: "engagement",
    text: "Follow for more",
  },
  overallTone: "educational",
  estimatedPace: "medium",
};

describe("generateRemakeContent hardening", () => {
  beforeEach(() => {
    mocks.invokeLLM.mockReset();
  });

  it("uses deterministic readability without a separate readability LLM call", async () => {
    mocks.invokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              "Your menu is not just a list. It is a sales tool. Make the profitable choices easy to notice.",
          },
        },
      ],
    });

    const result = await generateRemakeContent({
      originalTranscript: "Original source transcript.",
      caption: "Original caption",
      sourceKey: "ABC123",
      topic: "Creator's chosen angle (GROUND TRUTH — this defines WHAT the video is about):\n\"menu engineering for profit\"",
      gradeLevel: "auto",
      addCues: false,
      researchGroundingBlock:
        "1. Menu engineering basics\n   Fact/detail: Menu engineering compares popularity and profitability.\n   Source: https://example.com",
      trustedResearchTexts: [
        "Menu engineering compares popularity and profitability.",
      ],
      platformLabel: "Instagram Reel",
      viralStructureOverride: structure,
    });

    expect(mocks.invokeLLM).toHaveBeenCalledTimes(1);
    expect(result.readabilityAnalysis.wordCount).toBeGreaterThan(10);
    expect(result.factIntegrity.repaired).toBe(false);
  });

  it("repairs invented named facts before returning the script", async () => {
    mocks.invokeLLM
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                "His name is Marcus. He opened a restaurant in 2019 and doubled profit in 30 days. The lesson is to know your numbers.",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                "Imagine a first-time restaurant owner who ignores the numbers. The lesson is simple: understand your costs before problems compound.",
            },
          },
        ],
      });

    const result = await generateRemakeContent({
      originalTranscript: "A source story with a strong curiosity hook.",
      caption: "",
      sourceKey: "ABC123",
      topic: "No custom angle from the creator. Choose a specific topic using profile + audience research.",
      gradeLevel: "auto",
      addCues: false,
      researchGroundingBlock:
        "1. Restaurant costs\n   Fact/detail: Operators track food and labor costs to understand performance.\n   Source: https://example.com/costs",
      trustedResearchTexts: [
        "Operators track food and labor costs to understand performance.",
      ],
      platformLabel: "Instagram Reel",
      viralStructureOverride: structure,
    });

    expect(mocks.invokeLLM).toHaveBeenCalledTimes(2);
    expect(result.factIntegrity.repaired).toBe(true);
    expect(result.factIntegrity.initialRiskCount).toBeGreaterThan(0);
    expect(result.generatedScript).not.toContain("Marcus");
    expect(result.generatedScript).not.toContain("2019");
  });
});
