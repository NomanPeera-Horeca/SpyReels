import { describe, expect, it } from "vitest";
import { normalizeSearchCacheKey } from "../service";
import { VIRAL_POOL_DEFAULTS } from "../constants";

describe("explore search cache", () => {
  it("normalizes punctuation and case into one key", () => {
    expect(normalizeSearchCacheKey(9, "Menu Engineering!!!")).toBe(
      normalizeSearchCacheKey(9, "menu engineering")
    );
    expect(normalizeSearchCacheKey(9, "  FOO   bar  ")).toBe("9:foo bar");
  });

  it("documents explore provider budget defaults", () => {
    expect(VIRAL_POOL_DEFAULTS.exploreMaxScCalls).toBeLessThanOrEqual(25);
    expect(VIRAL_POOL_DEFAULTS.refreshMaxScCalls).toBeLessThanOrEqual(35);
    expect(VIRAL_POOL_DEFAULTS.dailyCallBudget).toBeLessThanOrEqual(60);
  });
});
