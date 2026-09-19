import { describe, expect, it } from "vitest";
import { analyzeRemakeReadability } from "./remakeReadability";

describe("analyzeRemakeReadability", () => {
  it("returns deterministic spoken-script readability fields", () => {
    const result = analyzeRemakeReadability(
      "[PAUSE] Your menu is not just a list. It is a sales tool. Keep the choices clear and make the profitable items easy to notice."
    );

    expect(result.wordCount).toBeGreaterThan(15);
    expect(result.sentenceCount).toBe(3);
    expect(result.gradeLevel).toBeGreaterThanOrEqual(0);
    expect(result.readingEase).toBeGreaterThanOrEqual(0);
    expect(result.overallAssessment).toBeTruthy();
  });

  it("flags very long spoken sentences", () => {
    const result = analyzeRemakeReadability(
      "This sentence keeps going because it contains far too many words for a creator to deliver comfortably on camera without a pause and it should absolutely be split into shorter lines before anyone tries to record it for a short form video."
    );

    expect(result.veryHardSentenceCount).toBeGreaterThan(0);
    expect(
      result.issues.some((issue) => issue.type === "very_hard_to_read")
    ).toBe(true);
  });
});
