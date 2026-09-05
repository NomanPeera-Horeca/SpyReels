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

  it("does not inflate topic relevance from hook/caption length or fallback confidence", () => {
    const longUnrelated = relevanceScoreForCandidate({
      candidate: {
        caption:
          "Tag your real ones ;) Btw I am so damn proud of this book and believe so strongly that every founder should read it cover to cover this year.",
        hook: "Tag your real ones ;) Btw I am so damn proud of this book",
        hashtags: [],
        contentPillar: "restaurant profitability",
      },
      pillarConfidence: 0.35,
      activePillar: "restaurant profitability",
    });
    const founderDiary = relevanceScoreForCandidate({
      candidate: {
        caption: "Founder's Life Unfiltered: Day 01 || PART:02 || NAINITAL. Team mindset.",
        hook: "Founder's Life Unfiltered: Day 01",
        hashtags: [],
        contentPillar: "hospitality leadership",
      },
      pillarConfidence: 0.55,
      activePillar: "hospitality leadership",
    });
    const restaurantOps = relevanceScoreForCandidate({
      candidate: {
        caption: "We all know that running a restaurant is tough. Staff, food cost, and ops will decide if you survive year one.",
        hook: "We all know that running a restaurant is tough",
        hashtags: [],
        contentPillar: "restaurant operations",
      },
      pillarConfidence: 0.8,
      activePillar: "restaurant operations",
    });

    expect(longUnrelated).toBeLessThanOrEqual(32);
    expect(founderDiary).toBeLessThanOrEqual(32);
    expect(restaurantOps).toBeGreaterThanOrEqual(70);
    expect(restaurantOps).toBeGreaterThan(longUnrelated);

    const shortRestaurant = relevanceScoreForCandidate({
      candidate: {
        caption: "Running a restaurant is tough.",
        hook: "Restaurant ops",
        hashtags: [],
        contentPillar: "restaurant operations",
      },
      pillarConfidence: 0.8,
      activePillar: "restaurant operations",
    });
    const paddedRestaurant = relevanceScoreForCandidate({
      candidate: {
        caption:
          "Running a restaurant is tough. Extra filler copy here does not make this more on-topic than the short version of the same restaurant ops idea.",
        hook: "Restaurant ops with a much longer hook that still says the same thing",
        hashtags: [],
        contentPillar: "restaurant operations",
      },
      pillarConfidence: 0.8,
      activePillar: "restaurant operations",
    });
    expect(paddedRestaurant).toBe(shortRestaurant);
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
