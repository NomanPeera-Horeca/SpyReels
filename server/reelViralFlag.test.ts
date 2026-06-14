import { describe, expect, it } from "vitest";
import {
  isViralByViewCount,
  medianViewCount,
  normalizeCreatorKey,
} from "../shared/reelViralFlag";

describe("reelViralFlag", () => {
  it("computes median for even and odd counts", () => {
    expect(medianViewCount([10, 20, 30])).toBe(20);
    expect(medianViewCount([10, 20, 30, 40])).toBe(25);
  });

  it("flags viral when views exceed 5x median and 10k floor", () => {
    expect(isViralByViewCount(1_902_590, 17_320)).toBe(true);
    expect(isViralByViewCount(80_000, 17_320)).toBe(false);
    expect(isViralByViewCount(5_000, 100)).toBe(false);
  });

  it("normalizes creator key from owner or job handle", () => {
    expect(normalizeCreatorKey("Owner", "fallback")).toBe("owner");
    expect(normalizeCreatorKey(null, "@grantcardone")).toBe("grantcardone");
  });
});
