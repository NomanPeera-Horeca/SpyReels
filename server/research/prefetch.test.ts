import { describe, expect, it } from "vitest";
import { prefetchDailyMax, prefetchHandle, prefetchTargets } from "./prefetch";

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
  it("defaults to 50 and honours a valid setting", () => {
    const before = process.env.RESEARCH_PREFETCH_DAILY_MAX;
    delete process.env.RESEARCH_PREFETCH_DAILY_MAX;
    expect(prefetchDailyMax()).toBe(50);
    process.env.RESEARCH_PREFETCH_DAILY_MAX = "10";
    expect(prefetchDailyMax()).toBe(10);
    process.env.RESEARCH_PREFETCH_DAILY_MAX = "nope";
    expect(prefetchDailyMax()).toBe(50);
    if (before === undefined) delete process.env.RESEARCH_PREFETCH_DAILY_MAX;
    else process.env.RESEARCH_PREFETCH_DAILY_MAX = before;
  });
});
