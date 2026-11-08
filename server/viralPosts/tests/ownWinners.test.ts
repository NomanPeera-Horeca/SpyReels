import { describe, expect, it } from "vitest";
import { ownRefreshDue } from "../ownWinners";

const now = new Date("2026-11-08T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe("ownRefreshDue", () => {
  it("reads a new account right away", () => {
    expect(ownRefreshDue({ lastResearchAt: null, newestPostAt: null, now })).toBe(true);
  });
  it("refreshes an account that posted in the last 30 days weekly", () => {
    expect(ownRefreshDue({ lastResearchAt: daysAgo(3), newestPostAt: daysAgo(2), now })).toBe(false);
    expect(ownRefreshDue({ lastResearchAt: daysAgo(7), newestPostAt: daysAgo(2), now })).toBe(true);
  });
  it("refreshes a quiet account monthly", () => {
    expect(ownRefreshDue({ lastResearchAt: daysAgo(10), newestPostAt: daysAgo(60), now })).toBe(false);
    expect(ownRefreshDue({ lastResearchAt: daysAgo(30), newestPostAt: daysAgo(60), now })).toBe(true);
    expect(ownRefreshDue({ lastResearchAt: daysAgo(10), newestPostAt: null, now })).toBe(false);
  });
});
