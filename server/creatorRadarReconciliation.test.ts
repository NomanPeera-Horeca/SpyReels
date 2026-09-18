import { describe, expect, it } from "vitest";
import { getCreatorRadarReconciliationDays } from "./creatorRadarReconciliation";

describe("getCreatorRadarReconciliationDays", () => {
  it("reconciles the full configured window after a recent sync", () => {
    expect(getCreatorRadarReconciliationDays(180, 1)).toBe(180);
  });

  it("expands beyond the configured window after a long sync gap", () => {
    expect(getCreatorRadarReconciliationDays(90, 121)).toBe(121);
  });

  it("normalizes invalid and fractional inputs safely", () => {
    expect(getCreatorRadarReconciliationDays(Number.NaN, 1.2)).toBe(90);
    expect(getCreatorRadarReconciliationDays(30.1, 0)).toBe(31);
  });
});
