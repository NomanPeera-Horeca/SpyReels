import { describe, expect, it } from "vitest";
import {
  buildBlindCoachBenchmarkJudgePrompt,
  parseCoachBenchmarkJudgment,
  summarizeCoachBenchmark,
  type CoachBenchmarkCaseResult,
} from "@shared/coachStrategyBenchmark";

describe("AI Coach strategy benchmark", () => {
  it("keeps the evaluator blind to which architecture produced each candidate", () => {
    const prompt = buildBlindCoachBenchmarkJudgePrompt({
      rawIdea: "Make a Reel about restaurant menus.",
      niche: "Restaurant operations",
      targetAudience: "Independent restaurant owners",
      candidateX: "Hook: Your menu may be slowing your kitchen down.",
      candidateY: "Hook: More menu choices can create more kitchen chaos.",
    });

    expect(prompt).toContain("CANDIDATE X");
    expect(prompt).toContain("CANDIDATE Y");
    expect(prompt).toContain("You do not know which system produced either candidate");
    expect(prompt).not.toContain("old system");
    expect(prompt).not.toContain("new system");
    expect(prompt).not.toContain("direct-generation");
    expect(prompt).not.toContain("3-direction version");
  });

  it("requires complete scores for both candidates", () => {
    const valid = {
      candidates: {
        X: {
          scores: {
            intentFidelity: 9,
            hookStrength: 8,
            originality: 7,
            clarity: 9,
            overall: 8,
          },
          intentViolations: [],
        },
        Y: {
          scores: {
            intentFidelity: 10,
            hookStrength: 9,
            originality: 8,
            clarity: 9,
            overall: 9,
          },
          intentViolations: [],
        },
      },
      winner: "Y",
      rationale: "Y is more specific while preserving intent.",
    };

    expect(parseCoachBenchmarkJudgment(valid)).not.toBeNull();
    expect(
      parseCoachBenchmarkJudgment({
        ...valid,
        candidates: {
          ...valid.candidates,
          Y: {
            ...valid.candidates.Y,
            scores: { intentFidelity: 10, hookStrength: 9 },
          },
        },
      })
    ).toBeNull();
  });

  it("maps blind X/Y winners back to strategy vs direct correctly", () => {
    const results: CoachBenchmarkCaseResult[] = [
      {
        caseId: "one",
        specificity: "vague",
        strategyCandidate: "Y",
        judgment: {
          candidates: {
            X: {
              scores: { intentFidelity: 9, hookStrength: 7, originality: 7, clarity: 8, overall: 7.5 },
              intentViolations: [],
            },
            Y: {
              scores: { intentFidelity: 9, hookStrength: 9, originality: 9, clarity: 9, overall: 9 },
              intentViolations: [],
            },
          },
          winner: "Y",
          rationale: "Y is stronger.",
        },
      },
      {
        caseId: "two",
        specificity: "specific",
        strategyCandidate: "X",
        judgment: {
          candidates: {
            X: {
              scores: { intentFidelity: 10, hookStrength: 8, originality: 8, clarity: 9, overall: 9 },
              intentViolations: [],
            },
            Y: {
              scores: { intentFidelity: 9, hookStrength: 8, originality: 7, clarity: 8, overall: 8 },
              intentViolations: [],
            },
          },
          winner: "X",
          rationale: "X obeys the specific instruction better.",
        },
      },
    ];

    const summary = summarizeCoachBenchmark(results);
    expect(summary.strategyWins).toBe(2);
    expect(summary.directWins).toBe(0);
    expect(summary.specificStrategyIntentViolationCases).toBe(0);
    expect(summary.passed).toBe(true);
  });

  it("fails when a strategy script violates a specific creator instruction", () => {
    const results: CoachBenchmarkCaseResult[] = [
      {
        caseId: "specific",
        specificity: "specific",
        strategyCandidate: "Y",
        judgment: {
          candidates: {
            X: {
              scores: { intentFidelity: 9, hookStrength: 8, originality: 7, clarity: 8, overall: 8 },
              intentViolations: [],
            },
            Y: {
              scores: { intentFidelity: 8, hookStrength: 9, originality: 9, clarity: 9, overall: 9 },
              intentViolations: ["Talked about financing after the creator explicitly excluded it."],
            },
          },
          winner: "Y",
          rationale: "Y is more creative but broke an explicit constraint.",
        },
      },
    ];

    const summary = summarizeCoachBenchmark(results);
    expect(summary.specificStrategyIntentViolationCases).toBe(1);
    expect(summary.passCriteria.noSpecificIntentViolations).toBe(false);
    expect(summary.passed).toBe(false);
  });
});
