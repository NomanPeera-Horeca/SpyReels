import { describe, expect, it } from "vitest";
import {
  buildCoachScriptQualitySummary,
  coachScriptSourceLabel,
  readCoachScriptJudgeMeta,
  readCoachScriptSourceDescription,
} from "@shared/coachScriptQualityReport";
import { buildProductionNotesJson } from "@shared/coachScriptSections";

describe("coachScriptQualityReport", () => {
  it("reads judge and source metadata from production notes", () => {
    const notes = buildProductionNotesJson(
      {},
      { explain: "e", illustrate: "i", teach: "t", cta: "" },
      {
        scriptMode: "story",
        sourceDescription: "My hot chicken idea",
        coachJudge: {
          overallScore: 8,
          viewerSense: 7,
          skipRatePrediction: 8,
          verdictPass: true,
          regenCount: 1,
        },
      }
    );

    expect(readCoachScriptSourceDescription(notes)).toBe("My hot chicken idea");
    expect(readCoachScriptJudgeMeta(notes)).toMatchObject({
      overallScore: 8,
      viewerSense: 7,
      skipRatePrediction: 8,
      verdictPass: true,
      regenCount: 1,
    });
  });

  it("labels spark and plan sources", () => {
    expect(coachScriptSourceLabel({ planSourceType: "user_spark" })).toBe("Spark");
    expect(coachScriptSourceLabel({ planSourceType: "ai_pick" })).toBe("Plan");
    expect(coachScriptSourceLabel({ scriptMode: "loop" })).toBe("Loop");
  });

  it("summarizes thumbs and judge averages", () => {
    const summary = buildCoachScriptQualitySummary([
      {
        id: 1,
        createdAt: new Date(),
        title: "A",
        hook: "hook",
        body: "one two three",
        userEmail: "a@test.com",
        userName: "A",
        sourceLabel: "Coach",
        sourceIdea: "idea",
        judge: { overallScore: 8, verdictPass: true },
        feedbackRating: "up",
        feedbackReason: null,
        feedbackNote: null,
      },
      {
        id: 2,
        createdAt: new Date(),
        title: "B",
        hook: "hook",
        body: "one two",
        userEmail: "b@test.com",
        userName: "B",
        sourceLabel: "Spark",
        sourceIdea: "idea",
        judge: { overallScore: 6, verdictPass: false },
        feedbackRating: "down",
        feedbackReason: "Hook was weak",
        feedbackNote: null,
      },
    ]);

    expect(summary.totalScripts).toBe(2);
    expect(summary.thumbsUp).toBe(1);
    expect(summary.thumbsDown).toBe(1);
    expect(summary.avgJudge).toBe(7);
    expect(summary.belowBar).toBe(1);
  });
});
