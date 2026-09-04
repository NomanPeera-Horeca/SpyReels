import { describe, expect, it } from "vitest";
import {
  buildBlindCoachHybridJudgePrompt,
  parseCoachHybridJudgment,
  rotateHybridAssignment,
  summarizeCoachHybridBenchmark,
  type CoachHybridCaseResult,
} from "@shared/coachHybridBenchmark";
import { classifyCoachIdeaSpecificity } from "@shared/coachIdeaSpecificity";
import { COACH_HYBRID_BENCHMARK_FIXTURES } from "@shared/coachHybridBenchmarkFixtures";

function scores(overall: number, intent = overall) {
  return {
    intentFidelity: intent,
    hookStrength: overall,
    originality: overall,
    clarity: overall,
    naturalness: overall,
    overall,
  };
}

function caseResult(partial: Partial<CoachHybridCaseResult> & Pick<CoachHybridCaseResult, "caseId" | "goldSpecificity">): CoachHybridCaseResult {
  const classifier = classifyCoachIdeaSpecificity(
    COACH_HYBRID_BENCHMARK_FIXTURES.find((fixture) => fixture.id === partial.caseId)?.rawIdea ??
      "make a Reel about restaurant menus"
  );
  return {
    classifier,
    hybridSkippedStrategy: classifier.classification === "highly_specific",
    assignment: { X: "old_direct", Y: "current_new", Z: "hybrid" },
    judgment: {
      candidates: {
        X: { scores: scores(7), intentViolations: [] },
        Y: { scores: scores(8.6), intentViolations: [] },
        Z: { scores: scores(8.4), intentViolations: [] },
      },
      winner: "Y",
      rationale: "Y is strongest while staying on the request.",
    },
    constraintViolations: { old_direct: [], current_new: [], hybrid: [] },
    latencyMs: { old_direct: 25000, current_new: 54000, hybrid: 53000 },
    ...partial,
  };
}

describe("hybrid specificity experiment benchmark", () => {
  it("keeps the 3-way evaluator blind to path names", () => {
    const prompt = buildBlindCoachHybridJudgePrompt({
      rawIdea: "Make a Reel about restaurant menus.",
      niche: "Restaurant operations",
      targetAudience: "Independent restaurant owners",
      goldSpecificity: "vague",
      candidateX: "Hook: Your menu may be slowing your kitchen down.",
      candidateY: "Hook: More menu choices can create more kitchen chaos.",
      candidateZ: "Hook: A smaller menu can make Friday night calmer.",
    });
    expect(prompt).toContain("CANDIDATE X");
    expect(prompt).toContain("CANDIDATE Y");
    expect(prompt).toContain("CANDIDATE Z");
    expect(prompt).toContain("You do not know which system produced any candidate");
    expect(prompt).not.toContain("old_direct");
    expect(prompt).not.toContain("current_new");
    expect(prompt).not.toContain("hybrid");
    expect(prompt).not.toContain("3-direction");
    expect(prompt).not.toContain("planner");
  });

  it("weights obedience above novelty on highly specific prompts", () => {
    const prompt = buildBlindCoachHybridJudgePrompt({
      rawIdea: "Open with a named line and do not discuss food cost.",
      niche: "Restaurant operations",
      targetAudience: "Owners",
      goldSpecificity: "highly_specific",
      candidateX: "A",
      candidateY: "B",
      candidateZ: "C",
    });
    expect(prompt).toMatch(/intent fidelity and exact obedience/i);
    expect(prompt).not.toMatch(/Originality and strategic development matter more/);
  });

  it("requires complete scores for all three candidates", () => {
    const valid = {
      candidates: {
        X: { scores: scores(8), intentViolations: [] },
        Y: { scores: scores(9), intentViolations: [] },
        Z: { scores: scores(7), intentViolations: [] },
      },
      winner: "Y",
      rationale: "Y obeys the brief.",
    };
    expect(parseCoachHybridJudgment(valid)).not.toBeNull();
    expect(
      parseCoachHybridJudgment({
        ...valid,
        candidates: {
          ...valid.candidates,
          Z: { scores: { intentFidelity: 7, hookStrength: 7 }, intentViolations: [] },
        },
      })
    ).toBeNull();
  });

  it("maps rotated winners back to NEW vs HYBRID", () => {
    const results: CoachHybridCaseResult[] = [
      caseResult({
        caseId: "vague-menus",
        goldSpecificity: "vague",
        assignment: { X: "hybrid", Y: "old_direct", Z: "current_new" },
        judgment: {
          candidates: {
            X: { scores: scores(8.2), intentViolations: [] },
            Y: { scores: scores(7.1), intentViolations: [] },
            Z: { scores: scores(8.5), intentViolations: [] },
          },
          winner: "Z",
          rationale: "Z developed the vague idea more usefully.",
        },
        latencyMs: { old_direct: 24000, current_new: 54000, hybrid: 55000 },
      }),
      caseResult({
        caseId: "high-menu-staff",
        goldSpecificity: "highly_specific",
        assignment: { X: "current_new", Y: "hybrid", Z: "old_direct" },
        judgment: {
          candidates: {
            X: { scores: scores(8.7, 8.8), intentViolations: [] },
            Y: { scores: scores(8.6, 8.9), intentViolations: [] },
            Z: { scores: scores(8.1, 8.2), intentViolations: [] },
          },
          winner: "tie",
          rationale: "X and Y both obey the brief.",
        },
        latencyMs: { old_direct: 26000, current_new: 54000, hybrid: 28000 },
        hybridSkippedStrategy: true,
      }),
    ];

    const summary = summarizeCoachHybridBenchmark(results);
    expect(summary.byGold.vague.newWins).toBe(1);
    expect(summary.byGold.vague.newVsHybrid.newWins).toBe(1);
    expect(summary.byGold.highly_specific.ties).toBe(1);
    expect(summary.byGold.highly_specific.newVsHybrid.ties).toBe(1);
    expect(summary.latency.highly_specific.secondsSaved).toBe(26);
  });

  it("rotates blind positions so no path owns X", () => {
    const first = rotateHybridAssignment(0);
    const second = rotateHybridAssignment(1);
    expect(first.X).not.toBe(second.X);
    expect(new Set(Object.values(first)).size).toBe(3);
  });

  it("covers 21 fixtures split evenly across gold labels", () => {
    expect(COACH_HYBRID_BENCHMARK_FIXTURES).toHaveLength(21);
    const counts = COACH_HYBRID_BENCHMARK_FIXTURES.reduce(
      (acc, fixture) => {
        acc[fixture.goldSpecificity] += 1;
        return acc;
      },
      { vague: 0, moderately_specific: 0, highly_specific: 0 }
    );
    expect(counts).toEqual({ vague: 7, moderately_specific: 7, highly_specific: 7 });
  });
});
