import { describe, expect, it } from "vitest";
import { dailyCapFromEnv, dailyCounterKey } from "./dailyCounter";
import { recheckRoom } from "./risingRecheck";

describe("daily counters", () => {
  it("keys fit the 10-character day column", () => {
    const key = dailyCounterKey("rc", new Date("2026-11-23T23:59:00Z"));
    expect(key).toBe("rc20261123");
    expect(key.length).toBe(10);
    expect(dailyCounterKey("yr", new Date("2026-01-02T00:00:00Z"))).toBe("yr20260102");
  });

  it("reads caps from settings, falling back on bad values", () => {
    expect(dailyCapFromEnv(undefined, 150)).toBe(150);
    expect(dailyCapFromEnv("", 150)).toBe(150);
    expect(dailyCapFromEnv("abc", 150)).toBe(150);
    expect(dailyCapFromEnv("-3", 150)).toBe(150);
    expect(dailyCapFromEnv("0", 150)).toBe(0);
    expect(dailyCapFromEnv("40.7", 150)).toBe(40);
  });

  it("checks no more rising videos than the day has left", () => {
    expect(recheckRoom(30, 150, 0)).toBe(30);
    expect(recheckRoom(30, 150, 140)).toBe(10);
    expect(recheckRoom(30, 150, 150)).toBe(0);
    expect(recheckRoom(30, 150, 400)).toBe(0);
    expect(recheckRoom(30, 0, 0)).toBe(0);
  });
});
