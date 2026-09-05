import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { invokeLLM } from "./_core/llm";
import { analyzeCoachIdea, COACH_ANALYZE_LLM_TIMEOUT_MS } from "./studioAnalyze";

const mockedInvokeLLM = vi.mocked(invokeLLM);

function analysisJson(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    confidence: 92,
    understood: "A Reel about starting from a proven idea instead of a blank page.",
    gaps: [],
    questions: [],
    factCheck: {
      hasClaim: false,
      status: "unverified",
      claimSummary: null,
      warning: null,
      safeAngle: null,
    },
    ...overrides,
  });
}

describe("analyzeCoachIdea", () => {
  beforeEach(() => {
    mockedInvokeLLM.mockReset();
  });

  it("returns a normal analysis and asks the LLM with the hard timeout", async () => {
    mockedInvokeLLM.mockResolvedValue({
      id: "1",
      created: 0,
      model: "claude-sonnet-4-6",
      choices: [{ index: 0, message: { role: "assistant", content: analysisJson() }, finish_reason: "stop" }],
    });

    const result = await analyzeCoachIdea({
      description: "I want a Reel about restaurant owners staring at a blank caption box.",
      niche: "Restaurant operations",
      targetAudience: "independent restaurant owners",
    });

    expect(result.confidence).toBe(92);
    expect(result.questions).toEqual([]);
    expect(result.factCheck.hasClaim).toBe(false);
    expect(result.understood).toContain("blank page");
    expect(mockedInvokeLLM).toHaveBeenCalledTimes(1);
    expect(mockedInvokeLLM.mock.calls[0]?.[0]?.timeoutMs).toBe(COACH_ANALYZE_LLM_TIMEOUT_MS);
    expect(COACH_ANALYZE_LLM_TIMEOUT_MS).toBe(25_000);
  });

  it("keeps lifestyle clarification filtering unchanged", async () => {
    mockedInvokeLLM.mockResolvedValue({
      id: "1",
      created: 0,
      model: "claude-sonnet-4-6",
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: analysisJson({
              confidence: 70,
              questions: [
                "Should this connect back to your restaurant equipment brand?",
                "What vibe do you want?",
              ],
            }),
          },
          finish_reason: "stop",
        },
      ],
    });

    const result = await analyzeCoachIdea({
      description: "Behind the scenes holiday content with music",
      niche: "Restaurant operations",
      targetAudience: "independent restaurant owners",
    });

    expect(result.questions).toEqual([]);
    expect(result.confidence).toBeGreaterThanOrEqual(88);
  });

  it("surfaces a provider error so the existing analyze onError path can run", async () => {
    mockedInvokeLLM.mockRejectedValue(new Error("Something went wrong while writing your script."));

    await expect(
      analyzeCoachIdea({
        description: "I want a Reel about restaurant owners staring at a blank caption box.",
        niche: "Restaurant operations",
        targetAudience: "independent restaurant owners",
      })
    ).rejects.toThrow("Something went wrong while writing your script.");
  });

  it("surfaces a hung-provider timeout so generate can start", async () => {
    mockedInvokeLLM.mockRejectedValue(new Error("The AI request timed out."));

    await expect(
      analyzeCoachIdea({
        description: "I want a Reel about restaurant owners staring at a blank caption box.",
        niche: "Restaurant operations",
        targetAudience: "independent restaurant owners",
      })
    ).rejects.toThrow("The AI request timed out.");
  });
});
