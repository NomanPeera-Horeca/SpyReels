import { afterEach, describe, expect, it } from "vitest";
import {
  aiUsd,
  cellBudgetUsd,
  GROWTH_RULE,
  growthDecision,
  normalizeHandle,
  PILOT_AI,
  PILOT_MAX_CAP_USD,
  PILOT_SHARES,
  PILOT_TOPICS,
  pilotCaps,
  pilotCells,
  realHashtags,
  recencyOf,
  runDiscoveryPilotTick,
} from "../discoveryPilot";

const H = 3_600_000;

describe("discovery pilot budget", () => {
  it("splits $5 into protected platform shares that add up exactly", () => {
    const caps = pilotCaps(5);
    expect(caps).toEqual({ instagram: 2, youtube: 2, tiktok: 1 });
    expect(caps.instagram + caps.youtube + caps.tiktok).toBeCloseTo(5, 10);
    // TikTok is the reference: the smallest share.
    expect(PILOT_SHARES.tiktok).toBeLessThan(PILOT_SHARES.instagram);
    expect(PILOT_SHARES.tiktok).toBeLessThan(PILOT_SHARES.youtube);
  });

  it("never splits into more than the total for odd amounts", () => {
    for (const total of [0.01, 1.37, 4.99, 5]) {
      const c = pilotCaps(total);
      expect(c.instagram + c.youtube + c.tiktok).toBeLessThanOrEqual(total + 1e-9);
    }
  });

  it("gives each remaining topic an equal part of what is left, rounded down", () => {
    expect(cellBudgetUsd(1.7, 3)).toBe(0.5666);
    expect(cellBudgetUsd(0, 3)).toBe(0);
    expect(cellBudgetUsd(-1, 2)).toBe(0);
    expect(cellBudgetUsd(1, 0)).toBe(0);
  });

  it("caps any pilot at the approved $5, even if the environment asks for more", () => {
    const before = process.env.DISCOVERY_PILOT_MAX_USD;
    process.env.DISCOVERY_PILOT_MAX_USD = "50";
    expect(PILOT_MAX_CAP_USD()).toBe(5);
    delete process.env.DISCOVERY_PILOT_MAX_USD;
    expect(PILOT_MAX_CAP_USD()).toBe(5);
    if (before !== undefined) process.env.DISCOVERY_PILOT_MAX_USD = before;
  });

  it("prices an AI check from its usage, and at the worst case when usage is missing", () => {
    expect(aiUsd({ input_tokens: 2_000, output_tokens: 600 })).toBeCloseTo(0.005, 6);
    expect(aiUsd(undefined)).toBe(PILOT_AI.reserveUsd);
    // The reserve covers the largest possible batch answer (1,500 output tokens) plus a large prompt.
    expect(aiUsd({ input_tokens: 5_000, output_tokens: 1_500 })).toBeLessThanOrEqual(PILOT_AI.reserveUsd);
  });
});

describe("discovery pilot definitions", () => {
  it("defines the three approved topics before testing, restaurant marketing as attracting customers", () => {
    expect(PILOT_TOPICS.map(t => t.label)).toEqual(["home buying tips", "gym workouts", "restaurant marketing"]);
    const rm = PILOT_TOPICS.find(t => t.label === "restaurant marketing")!;
    expect(rm.definition).toMatch(/attract/);
    expect(rm.exclude).toMatch(/recipes/);
    expect(rm.exclude).toMatch(/food reviews/);
  });

  it("runs every topic on every platform", () => {
    expect(pilotCells()).toHaveLength(9);
  });
});

describe("recent vs evergreen", () => {
  const found = new Date("2026-11-05T12:00:00Z");
  it("labels by publish date relative to when it was found", () => {
    expect(recencyOf(new Date("2026-10-20T12:00:00Z"), found)).toBe("recent");
    expect(recencyOf(new Date("2026-09-01T12:00:00Z"), found)).toBe("evergreen");
    expect(recencyOf(null, found)).toBe("undated");
  });
});

describe("growth check for rising videos", () => {
  const t1 = new Date("2026-11-05T12:00:00Z");
  it("waits until the minimum interval has passed", () => {
    expect(growthDecision({ views1: 5_000, views1At: t1, views2: 9_000, views2At: new Date(t1.getTime() + 10 * H), verdictAtSecond: "rising" })).toBe("wait");
  });
  it("confirms rising only with enough growth in both ratio and views", () => {
    const at = new Date(t1.getTime() + GROWTH_RULE.minIntervalHours * H);
    expect(growthDecision({ views1: 5_000, views1At: t1, views2: 6_500, views2At: at, verdictAtSecond: "rising" })).toBe("rising");
    // +20%: not enough.
    expect(growthDecision({ views1: 5_000, views1At: t1, views2: 6_000, views2At: at, verdictAtSecond: "rising" })).toBe("not_rising");
    // +50% but only +900 views: not enough.
    expect(growthDecision({ views1: 1_800, views1At: t1, views2: 2_700, views2At: at, verdictAtSecond: "rising" })).toBe("not_rising");
    // Grew, but the rule no longer calls it rising (e.g. too old now).
    expect(growthDecision({ views1: 5_000, views1At: t1, views2: 9_000, views2At: at, verdictAtSecond: "not_viral" })).toBe("not_rising");
  });
  it("calls it viral when the second count meets the viral rule", () => {
    expect(growthDecision({ views1: 5_000, views1At: t1, views2: 60_000, views2At: new Date(t1.getTime() + 30 * H), verdictAtSecond: "viral" })).toBe("viral");
  });
  it("labels a missing second count after the wait window, never guesses", () => {
    expect(growthDecision({ views1: 5_000, views1At: t1, views2: null, views2At: new Date(t1.getTime() + 30 * H), verdictAtSecond: "unknown" })).toBe("wait");
    expect(growthDecision({ views1: 5_000, views1At: t1, views2: null, views2At: new Date(t1.getTime() + GROWTH_RULE.maxWaitHours * H), verdictAtSecond: "unknown" })).toBe("growth_check_failed");
  });
});

describe("real hashtags only", () => {
  it("keeps hashtags seen on several viral videos, drops generic and one-off ones, never invents one", () => {
    const captions = [
      "Closing costs explained #firsttimehomebuyer #fyp #mortgage",
      "FHA loans #FirstTimeHomeBuyer #mortgage #viral",
      "Inspection tips #firsttimehomebuyer #mortgage #realestate",
      "Random #oneoff",
    ];
    expect(realHashtags(captions, 3)).toEqual(["firsttimehomebuyer", "mortgage"]);
    expect(realHashtags(captions, 3)).not.toContain("homebuyingtips");
    expect(realHashtags([], 3)).toEqual([]);
  });
});

describe("handles", () => {
  it("normalizes @ and case", () => {
    expect(normalizeHandle(" @SomeOne ")).toBe("someone");
    expect(normalizeHandle("")).toBeNull();
    expect(normalizeHandle(null)).toBeNull();
  });
});

describe("off by default", () => {
  const before = process.env.DISCOVERY_PILOT_RUNNER;
  afterEach(() => {
    if (before === undefined) delete process.env.DISCOVERY_PILOT_RUNNER;
    else process.env.DISCOVERY_PILOT_RUNNER = before;
  });
  it("does nothing unless DISCOVERY_PILOT_RUNNER=on", async () => {
    delete process.env.DISCOVERY_PILOT_RUNNER;
    expect(await runDiscoveryPilotTick()).toEqual({ ran: false, reason: "runner_off" });
    process.env.DISCOVERY_PILOT_RUNNER = "yes";
    expect(await runDiscoveryPilotTick()).toEqual({ ran: false, reason: "runner_off" });
  });
});
