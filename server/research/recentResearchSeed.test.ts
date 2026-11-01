import { describe, expect, it } from "vitest";
import { withinTimeframe } from "./recentResearchSeed";

describe("withinTimeframe", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  it("keeps videos inside the user's chosen window (and undated ones)", () => {
    const rows = [{ postedAt: daysAgo(5) }, { postedAt: daysAgo(45) }, { postedAt: null }];
    expect(withinTimeframe(rows, 30, now)).toEqual([{ postedAt: daysAgo(5) }, { postedAt: null }]);
    expect(withinTimeframe(rows, 90, now)).toHaveLength(3);
  });
});
