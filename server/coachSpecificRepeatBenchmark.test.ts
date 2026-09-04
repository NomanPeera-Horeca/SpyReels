import { describe, expect, it } from "vitest";
import { classifyCoachIdeaSpecificity } from "@shared/coachIdeaSpecificity";
import { COACH_SPECIFIC_REPEAT_FIXTURES } from "@shared/coachSpecificRepeatFixtures";
import {
  buildBlindCoachSpecificRepeatJudgePrompt,
  parseCoachSpecificRepeatJudgment,
  rotateSpecificRepeatAssignment,
  summarizeCoachSpecificRepeatBenchmark,
  type CoachSpecificRepeatCaseResult,
  type CoachSpecificRepeatSample,
  type CoachSpecificRepeatScores,
} from "@shared/coachSpecificRepeatBenchmark";

function scores(overall: number, extras: Partial<CoachSpecificRepeatScores> = {}): CoachSpecificRepeatScores {
  return {
    intentFidelity: extras.intentFidelity ?? overall,
    instructionObedience: extras.instructionObedience ?? overall,
    hookStrength: extras.hookStrength ?? overall,
    originality: extras.originality ?? overall,
    clarity: extras.clarity ?? overall,
    naturalness: extras.naturalness ?? overall,
    narrativeQuality: extras.narrativeQuality ?? overall,
    overall,
  };
}

function sample(
  sampleId: CoachSpecificRepeatSample["sampleId"],
  overall: number,
  extras: Partial<CoachSpecificRepeatSample> = {}
): CoachSpecificRepeatSample {
  const path = sampleId.startsWith("strategy") ? "strategy" : "direct";
  return {
    sampleId,
    path,
    scores: scores(overall),
    latencyMs: path === "strategy" ? 54000 : 23000,
    constraints: { initialViolations: [], correctionCount: 0, unresolvedViolations: [] },
    judgeIntentViolations: [],
    judgeInstructionViolations: [],
    ...extras,
  };
}

describe("high-confidence specific-prompt benchmark", () => {
  it("uses 24 highly specific briefs across the requested categories", () => {
    expect(COACH_SPECIFIC_REPEAT_FIXTURES).toHaveLength(24);
    const tags = new Set(COACH_SPECIFIC_REPEAT_FIXTURES.flatMap((fixture) => fixture.tags));
    for (const required of [
      "delayed_name",
      "product_cta_only",
      "product_comparison",
      "product_demo",
      "contrarian",
      "exact_hook",
      "exact_cta",
      "story",
      "educational",
      "sales",
      "spyreels",
      "operator",
    ]) {
      expect(tags.has(required as never), required).toBe(true);
    }
    expect(COACH_SPECIFIC_REPEAT_FIXTURES.filter((fixture) => fixture.tags.includes("spyreels")).length).toBeGreaterThanOrEqual(5);
  });

  it("classifies every fixture as highly_specific", () => {
    const misses = COACH_SPECIFIC_REPEAT_FIXTURES.filter(
      (fixture) => classifyCoachIdeaSpecificity(fixture.rawIdea).classification !== "highly_specific"
    );
    expect(misses.map((fixture) => fixture.id)).toEqual([]);
  });

  it("keeps the 4-way evaluator blind to architecture and generation number", () => {
    const prompt = buildBlindCoachSpecificRepeatJudgePrompt({
      rawIdea: "Open with a named line and end with a named CTA.",
      niche: "Restaurant operations",
      targetAudience: "Owners",
      candidateW: "W",
      candidateX: "X",
      candidateY: "Y",
      candidateZ: "Z",
    });
    expect(prompt).toContain("CANDIDATE W");
    expect(prompt).toContain("You do not know which system produced any candidate");
    expect(prompt).toMatch(/hard gates/i);
    expect(prompt).not.toContain("strategy_a");
    expect(prompt).not.toContain("direct_a");
    expect(prompt).not.toContain("old_direct");
    expect(prompt).not.toContain("planner");
    expect(prompt).not.toContain("selector");
  });

  it("requires complete scores for all four candidates", () => {
    const valid = {
      candidates: {
        W: { scores: scores(8), intentViolations: [], instructionViolations: [] },
        X: { scores: scores(9), intentViolations: [], instructionViolations: [] },
        Y: { scores: scores(7), intentViolations: [], instructionViolations: [] },
        Z: { scores: scores(8), intentViolations: [], instructionViolations: [] },
      },
      winner: "X",
      rationale: "X obeys the brief.",
    };
    expect(parseCoachSpecificRepeatJudgment(valid)).not.toBeNull();
    expect(
      parseCoachSpecificRepeatJudgment({
        ...valid,
        candidates: {
          ...valid.candidates,
          Z: { scores: { overall: 8 }, intentViolations: [], instructionViolations: [] },
        },
      })
    ).toBeNull();
  });

  it("treats a material violation as a pairwise loss even if overall is higher", () => {
    const result: CoachSpecificRepeatCaseResult = {
      caseId: "kitchen-before-payroll",
      tags: ["operator", "contrarian", "exact_hook", "exact_cta"],
      assignment: rotateSpecificRepeatAssignment(0),
      judgment: {
        candidates: {
          W: { scores: scores(9), intentViolations: [], instructionViolations: [] },
          X: { scores: scores(8.8), intentViolations: [], instructionViolations: [] },
          Y: { scores: scores(8.2), intentViolations: [], instructionViolations: [] },
          Z: { scores: scores(8.1), intentViolations: [], instructionViolations: [] },
        },
        winner: "W",
        rationale: "W is strongest.",
      },
      samples: {
        strategy_a: sample("strategy_a", 9, {
          judgeInstructionViolations: ["Missing required closing line"],
        }),
        strategy_b: sample("strategy_b", 8.8),
        direct_a: sample("direct_a", 8.2),
        direct_b: sample("direct_b", 8.1),
      },
    };
    const summary = summarizeCoachSpecificRepeatBenchmark([result]);
    expect(summary.pairwise.directWins).toBe(1);
    expect(summary.pairwise.strategyWins).toBe(0);
  });

  it("reports within-architecture spread and constraint rates", () => {
    const result: CoachSpecificRepeatCaseResult = {
      caseId: "spyreels-delayed-story",
      tags: ["spyreels", "delayed_name", "story"],
      assignment: rotateSpecificRepeatAssignment(1),
      judgment: {
        candidates: {
          W: { scores: scores(8), intentViolations: [], instructionViolations: [] },
          X: { scores: scores(8.4), intentViolations: [], instructionViolations: [] },
          Y: { scores: scores(8.1), intentViolations: [], instructionViolations: [] },
          Z: { scores: scores(8.5), intentViolations: [], instructionViolations: [] },
        },
        winner: "tie",
        rationale: "Close.",
      },
      samples: {
        strategy_a: sample("strategy_a", 8.4, {
          latencyMs: 52000,
          constraints: { initialViolations: ["late name"], correctionCount: 1, unresolvedViolations: [] },
        }),
        strategy_b: sample("strategy_b", 8.6, { latencyMs: 56000 }),
        direct_a: sample("direct_a", 8.1, { latencyMs: 22000 }),
        direct_b: sample("direct_b", 8.3, { latencyMs: 24000 }),
      },
    };
    const summary = summarizeCoachSpecificRepeatBenchmark([result]);
    expect(summary.strategy.meanAbsOverallSpread).toBe(0.2);
    expect(summary.strategy.correctionRate).toBe(0.5);
    expect(summary.direct.meanAbsOverallSpread).toBe(0.2);
    expect(summary.latency.secondsSaved).toBe(31);
  });
});
