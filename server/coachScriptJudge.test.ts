import { describe, expect, it } from "vitest";
import {
  COACH_SCRIPT_JUDGE_PASS_SCORE,
  clampJudgeScore,
  coachScriptJudgePasses,
} from "@shared/coachScriptJudge";

describe("coachScriptJudge", () => {
  it("passes only when overall, viewer sense, and skip bars clear", () => {
    expect(
      coachScriptJudgePasses({
        overallScore: COACH_SCRIPT_JUDGE_PASS_SCORE,
        viewerSense: 7,
        skipRatePrediction: 6,
      })
    ).toBe(true);

    expect(
      coachScriptJudgePasses({
        overallScore: 9,
        viewerSense: 6,
        skipRatePrediction: 8,
      })
    ).toBe(false);

    expect(
      coachScriptJudgePasses({
        overallScore: 9,
        viewerSense: 8,
        skipRatePrediction: 5,
      })
    ).toBe(false);
  });

  it("clamps judge scores into 1-10", () => {
    expect(clampJudgeScore(0)).toBe(1);
    expect(clampJudgeScore(15)).toBe(10);
    expect(clampJudgeScore("8.2")).toBe(8);
  });
});
