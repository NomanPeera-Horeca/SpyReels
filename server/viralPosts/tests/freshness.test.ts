import { describe, expect, it } from "vitest";
import { mergedViews } from "../risingRecheck";
import { pickDueRefreshes, refreshWeekKey, REFRESH_DEMAND_DAYS, REFRESH_OTHER_DAYS } from "../topicFill";
import { watchlistDayKey } from "../../research/prefetch";

const day = 86_400_000;
const now = new Date("2026-11-10T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * day);

describe("pickDueRefreshes", () => {
  it("re-searches topics our creators have every 3 days and the rest every 14", () => {
    const rows = [
      { id: "demand-fresh", creators: 4, lastRefreshedAt: ago(REFRESH_DEMAND_DAYS - 1) },
      { id: "demand-due", creators: 4, lastRefreshedAt: ago(REFRESH_DEMAND_DAYS) },
      { id: "other-fresh", creators: 0, lastRefreshedAt: ago(REFRESH_OTHER_DAYS - 1) },
      { id: "other-due", creators: 0, lastRefreshedAt: ago(REFRESH_OTHER_DAYS + 2) },
      { id: "never", creators: 9, lastRefreshedAt: null },
    ];
    expect(pickDueRefreshes(rows, now).map(r => r.id)).toEqual(["demand-due", "other-due"]);
  });

  it("puts the most wanted topics first, then the longest waiting", () => {
    const rows = [
      { id: "a", creators: 1, lastRefreshedAt: ago(10) },
      { id: "b", creators: 5, lastRefreshedAt: ago(4) },
      { id: "c", creators: 5, lastRefreshedAt: ago(8) },
    ];
    expect(pickDueRefreshes(rows, now).map(r => r.id)).toEqual(["c", "b", "a"]);
  });
});

describe("spend keys", () => {
  it("fit the 10-character spend table key", () => {
    expect(refreshWeekKey(now)).toMatch(/^rf2026w\d{2}$/);
    expect(refreshWeekKey(now).length).toBeLessThanOrEqual(10);
    expect(watchlistDayKey(now)).toBe("wl20261110");
  });
});

describe("mergedViews", () => {
  it("only moves views up and keeps the stored number when a read fails", () => {
    expect(mergedViews(10_000, 25_000)).toBe(25_000);
    expect(mergedViews(10_000, 9_000)).toBe(10_000);
    expect(mergedViews(10_000, null)).toBe(10_000);
    expect(mergedViews(null, 5_000)).toBe(5_000);
  });
});
