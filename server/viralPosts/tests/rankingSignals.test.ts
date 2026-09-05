import { describe, expect, it } from "vitest";
import { inferFormat, inferFormatFromCopy } from "../candidateAdapter";
import {
  relevanceScoreForCandidate,
  remakeabilityScoreForCandidate,
} from "../rankingSignals";

describe("viralPosts ranking signals", () => {
  it("scores higher relevance when pillar terms appear in the copy", () => {
    const weak = relevanceScoreForCandidate({
      candidate: {
        caption: "A pretty kitchen tour with no operating advice.",
        hook: "Come walk through my kitchen",
        hashtags: ["kitchen"],
        contentPillar: "restaurant profitability",
      },
      pillarConfidence: 0.35,
      activePillar: "restaurant profitability",
    });
    const strong = relevanceScoreForCandidate({
      candidate: {
        caption:
          "Restaurant profitability is dying from food cost drift. Here is the margin math I use every Monday.",
        hook: "Your restaurant profitability leak is food cost",
        hashtags: ["foodcost", "profit"],
        contentPillar: "restaurant profitability",
      },
      pillarConfidence: 0.9,
      activePillar: "restaurant profitability",
    });

    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeGreaterThanOrEqual(80);
  });

  it("scores list and how-to patterns as more remakeable than empty copy", () => {
    const empty = remakeabilityScoreForCandidate({
      format: null,
      hook: null,
      caption: null,
      transcript: null,
    });
    const list = remakeabilityScoreForCandidate({
      format: "list",
      hook: "5 menu mistakes that quietly kill profit",
      caption:
        "5 menu mistakes that quietly kill profit. Use this checklist before you print the next menu.",
      transcript: null,
    });

    expect(list).toBeGreaterThan(empty);
    expect(inferFormat("5 menu mistakes that quietly kill profit")).toBe("list");
    expect(
      inferFormatFromCopy({
        hook: "How to cut food cost this week",
        caption: "A simple weekly SOP.",
      })
    ).toBe("tutorial");
    expect(inferFormat("")).toBeNull();
  });
});
