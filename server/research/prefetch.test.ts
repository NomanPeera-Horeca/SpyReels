import { describe, expect, it } from "vitest";
import { PREFETCH_ORDER, fillerBudgetLeft, prefetchDailyMax, prefetchHandle, prefetchTargets } from "./prefetch";

describe("prefetchTargets", () => {
  it("keeps one entry per platform and handle, in the research routers' handle form", () => {
    expect(
      prefetchTargets([
        { platform: "tiktok", handle: "@CoachMia" },
        { platform: "tiktok", handle: "coachmia" },
        { platform: "youtube", handle: "coachmia" },
        { platform: "instagram", handle: " @Chef.Ana " },
      ])
    ).toEqual([
      { platform: "tiktok", handle: "coachmia" },
      { platform: "youtube", handle: "coachmia" },
      { platform: "instagram", handle: prefetchHandle("instagram", "Chef.Ana") },
    ]);
  });

  it("drops unknown platforms and empty handles", () => {
    expect(prefetchTargets([{ platform: "x", handle: "a" }, { platform: "tiktok", handle: "  @ " }])).toEqual([]);
  });
});

describe("prefetchDailyMax", () => {
  it("defaults to 150 and honours a valid setting", () => {
    const before = process.env.RESEARCH_PREFETCH_DAILY_MAX;
    delete process.env.RESEARCH_PREFETCH_DAILY_MAX;
    expect(prefetchDailyMax()).toBe(150);
    process.env.RESEARCH_PREFETCH_DAILY_MAX = "10";
    expect(prefetchDailyMax()).toBe(10);
    process.env.RESEARCH_PREFETCH_DAILY_MAX = "nope";
    expect(prefetchDailyMax()).toBe(150);
    if (before === undefined) delete process.env.RESEARCH_PREFETCH_DAILY_MAX;
    else process.env.RESEARCH_PREFETCH_DAILY_MAX = before;
  });
});

describe("fillerBudgetLeft", () => {
  it("keeps most of the day for creators users are shown", () => {
    expect(fillerBudgetLeft(150, 0, 0.3)).toBe(45);
    expect(fillerBudgetLeft(150, 40, 0.3)).toBe(5);
    expect(fillerBudgetLeft(150, 45, 0.3)).toBe(0);
    expect(fillerBudgetLeft(150, 120, 0.3)).toBe(0);
  });
});

describe("research queue order", () => {
  it("a creator's own account is researched first, so proven ideas appear right after onboarding", () => {
    expect(PREFETCH_ORDER).toEqual(["own", "pending", "watch", "similar"]);
  });
});
