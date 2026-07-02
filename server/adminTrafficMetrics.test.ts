import { describe, expect, it } from "vitest";
import { formatConversionPct } from "./adminTrafficMetrics";

describe("formatConversionPct", () => {
  it("returns null when denominator is zero", () => {
    expect(formatConversionPct(5, 0)).toBeNull();
  });

  it("rounds to one decimal place", () => {
    expect(formatConversionPct(1, 3)).toBe(33.3);
    expect(formatConversionPct(52, 189)).toBe(27.5);
  });
});
