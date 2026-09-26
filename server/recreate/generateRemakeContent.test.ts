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
    const writerCall = mocks.invokeLLM.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const system = writerCall.messages.find((m) => m.role === "system")?.content ?? "";
    const user = writerCall.messages.find((m) => m.role === "user")?.content ?? "";
    expect(system).toContain("Always write the spoken remake script in English");
    expect(user).toContain("OUTPUT LANGUAGE (HARD RULE)");
    expect(user).toContain("may be non-English");
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

  it("rebuilds a same-topic remake when deterministic overlap is too high", async () => {
    const source =
      "Start early and write the plan down before the day gets noisy. Start early and write the plan down before the day gets noisy.";

    mocks.invokeLLM
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                "Start early and write the plan down before the day gets noisy. Start early and write the plan down before the day gets noisy.",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content:
                "Before your notifications take over, decide the three outcomes that would make today count. Put them somewhere visible, then protect the first hour for the hardest one.",
            },
          },
        ],
      });

    const result = await generateRemakeContent({
      originalTranscript: source,
      caption: "",
      sourceKey: "SAME123",
      topic: "SAME_TOPIC",
      gradeLevel: "auto",
      addCues: false,
      platformLabel: "Instagram Reel",
      viralStructureOverride: structure,
    });

    expect(mocks.invokeLLM).toHaveBeenCalledTimes(2);
    expect(result.generatedScript).toContain("notifications");
    expect(result.generatedScript).not.toContain(
      "Start early and write the plan down"
    );
  });

  it("makes interaction-led source format explicit in the writer prompt", async () => {
    const interactionStructure = {
      ...structure,
      hook: {
        type: "In-action drop-in",
        text: "Yeah, put it over there.",
        technique: "starts mid-conversation",
      },
      body: {
        pacing: "Very fast clipped exchanges",
        structure:
          "Implied multi-clip compilation of candid workplace dialogue with an escalating payoff",
        keyPoints: ["setup", "repeat beat", "payoff"],
      },
      overallTone: "candid comedic workplace humor",
    };

    mocks.invokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content:
              "\"You priced it there?\"\\n\\n\"Yeah. Why?\"\\n\\n\"Because now every buyer is waiting for the drop.\"\\n\\n\"...so we fix it today.\"",
          },
        },
      ],
    });

    await generateRemakeContent({
      originalTranscript: "Short candid source dialogue.",
      caption: "",
      sourceKey: "FORMAT123",
      topic:
        "Creator's chosen angle (GROUND TRUTH — this defines WHAT the video is about):\\n\\\"pricing a listing correctly\\\"",
      gradeLevel: "auto",
      addCues: false,
      platformLabel: "Instagram Reel",
      viralStructureOverride: interactionStructure,
    });

    const call = mocks.invokeLLM.mock.calls[0]?.[0];
    const userMessage = String(call?.messages?.[1]?.content ?? "");
    expect(userMessage).toContain("FORMAT FIDELITY");
    expect(userMessage).toContain("multiple short candid beats or dialogue clips");
    expect(userMessage).toContain(
      "Keep editorial explanation out of the body"
    );
  });

});
