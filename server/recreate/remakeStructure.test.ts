import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invokeLLM: vi.fn(),
}));

vi.mock("../_core/llm", () => ({
  invokeLLM: mocks.invokeLLM,
}));

import {
  analyzeRemakeStructure,
  resetRemakeStructureCacheForTest,
} from "./remakeStructure";

describe("analyzeRemakeStructure", () => {
  beforeEach(() => {
    resetRemakeStructureCacheForTest();
    mocks.invokeLLM.mockReset();
    mocks.invokeLLM.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              hook: {
                type: "Question",
                text: "Why does this work?",
                technique: "curiosity gap",
              },
              body: {
                pacing: "Story arc",
                structure: "setup -> decision -> payoff",
                keyPoints: ["setup", "decision", "payoff"],
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
            }),
          },
        },
      ],
    });
  });

  it("caches the structure by source and transcript hash", async () => {
    const first = await analyzeRemakeStructure({
      sourceKey: "ABC123",
      originalTranscript: "Why does this work? Here is the story.",
      caption: "caption",
      platformLabel: "Instagram Reel",
    });
    const second = await analyzeRemakeStructure({
      sourceKey: "ABC123",
      originalTranscript: "Why does this work? Here is the story.",
      caption: "caption",
      platformLabel: "Instagram Reel",
    });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(mocks.invokeLLM).toHaveBeenCalledTimes(1);
  });

  it("does not reuse cache after transcript changes", async () => {
    await analyzeRemakeStructure({
      sourceKey: "ABC123",
      originalTranscript: "Version one",
      caption: "caption",
    });
    await analyzeRemakeStructure({
      sourceKey: "ABC123",
      originalTranscript: "Version two",
      caption: "caption",
    });

    expect(mocks.invokeLLM).toHaveBeenCalledTimes(2);
  });
});
