import { describe, expect, it, vi } from "vitest";

vi.mock("./alerts", () => ({ alertOwnerThrottled: vi.fn() }));

import { dailyBurn, deepgramBalanceFrom, lowBalanceVerdict, pickNumber } from "./balanceWatch";

describe("reading balances", () => {
  it("finds the ScrapeCreators credit count under the usual names", () => {
    expect(pickNumber({ creditCount: 24490 }, ["creditCount", "credits"])).toBe(24490);
    expect(pickNumber({ data: { credits: "1200" } }, ["creditCount", "credits"])).toBe(1200);
    expect(pickNumber({ success: true }, ["creditCount"])).toBeNull();
    expect(pickNumber(null, ["creditCount"])).toBeNull();
  });

  it("adds up Deepgram balances", () => {
    expect(deepgramBalanceFrom({ balances: [{ amount: 9.88, units: "usd" }] })).toBeCloseTo(9.88);
    expect(deepgramBalanceFrom({ balances: [{ amount: 2 }, { amount: "1.5" }] })).toBeCloseTo(3.5);
    expect(deepgramBalanceFrom({ balances: [] })).toBeNull();
    expect(deepgramBalanceFrom({ balances: [{ amount: "x" }] })).toBeNull();
    expect(deepgramBalanceFrom({})).toBeNull();
  });
});

describe("how fast credit is used", () => {
  it("averages daily drops and ignores top-ups", () => {
    // newest first: today 20k, yesterday 23k, before 26k
    expect(dailyBurn([20_000, 23_000, 26_000])).toBe(3_000);
    // a top-up between yesterday and today (5k -> 25k) is skipped
    expect(dailyBurn([25_000, 5_000, 8_000])).toBe(3_000);
    expect(dailyBurn([10_000])).toBeNull();
    expect(dailyBurn([10_000, 9_000])).toBeNull();
  });
});

describe("when to warn", () => {
  it("warns when about a day or less is left", () => {
    expect(lowBalanceVerdict("scrapecreators", 3_000, 3_000, 1.5)).toEqual({ warn: true, daysLeft: 1 });
    expect(lowBalanceVerdict("scrapecreators", 9_000, 3_000, 1.5)).toEqual({ warn: false, daysLeft: 3 });
    expect(lowBalanceVerdict("deepgram", 2, 4, 1.5)).toEqual({ warn: true, daysLeft: 0.5 });
  });

  it("uses a safety floor until there is history", () => {
    expect(lowBalanceVerdict("scrapecreators", 2_500, null)).toEqual({ warn: true, daysLeft: null });
    expect(lowBalanceVerdict("scrapecreators", 24_000, null)).toEqual({ warn: false, daysLeft: null });
    expect(lowBalanceVerdict("deepgram", 2.5, null)).toEqual({ warn: true, daysLeft: null });
    expect(lowBalanceVerdict("deepgram", 9.88, null)).toEqual({ warn: false, daysLeft: null });
  });
});
