import { describe, expect, it } from "vitest";
import {
  detectsClearCreativeFormat,
  filterCoachClarificationQuestions,
  shouldSkipCoachAnalyze,
} from "@shared/coachAnalyze";

describe("coachAnalyze", () => {
  it("skips analyze for Spark Deck prefill", () => {
    expect(
      shouldSkipCoachAnalyze(
        "Write a viral script from this Spark Deck idea.\n\nCreator goal: BTS on holiday",
        { planCardId: 12 }
      )
    ).toBe(true);
  });

  it("detects BTS lifestyle ideas", () => {
    expect(
      detectsClearCreativeFormat(
        "Behind the scenes with music and BTS moment of making content on holiday"
      )
    ).toBe(true);
  });

  it("filters brand tie-in questions for lifestyle sparks", () => {
    const filtered = filterCoachClarificationQuestions(
      "Behind the scenes holiday content with music",
      [
        "Should this connect back to your restaurant equipment brand?",
        "What is the crazy quote you want?",
      ]
    );
    expect(filtered).toEqual([]);
  });
});
