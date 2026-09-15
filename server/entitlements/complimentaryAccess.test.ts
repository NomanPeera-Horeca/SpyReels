import { describe, expect, it } from "vitest";
import {
  isComplimentaryGrantActive,
  resolveAccessSource,
  resolveEffectivePlan,
} from "./complimentaryAccess";

describe("complimentary access entitlement resolution", () => {
  it("raises a free user to the complimentary plan", () => {
    expect(resolveEffectivePlan("free", "pro")).toBe("pro");
    expect(resolveAccessSource("free", "pro")).toBe("complimentary");
  });

  it("raises a lower paid plan without changing its billing source", () => {
    expect(resolveEffectivePlan("starter", "pro")).toBe("pro");
    expect(resolveAccessSource("starter", "pro")).toBe("complimentary");
  });

  it("never downgrades a higher paid plan", () => {
    expect(resolveEffectivePlan("business", "pro")).toBe("business");
    expect(resolveAccessSource("business", "pro")).toBe("stripe");
  });

  it("keeps Stripe as the source when both plans are equal", () => {
    expect(resolveEffectivePlan("pro", "pro")).toBe("pro");
    expect(resolveAccessSource("pro", "pro")).toBe("stripe");
  });

  it("returns free when no paid or complimentary entitlement exists", () => {
    expect(resolveEffectivePlan("free", null)).toBe("free");
    expect(resolveAccessSource("free", null)).toBe("free");
  });
});

describe("complimentary grant lifecycle", () => {
  const now = new Date("2026-09-14T15:00:00.000Z");

  it("accepts an active grant with no expiry", () => {
    expect(
      isComplimentaryGrantActive(
        {
          status: "active",
          startsAt: new Date("2026-09-01T00:00:00.000Z"),
          expiresAt: null,
        },
        now
      )
    ).toBe(true);
  });

  it("rejects an expired grant", () => {
    expect(
      isComplimentaryGrantActive(
        {
          status: "active",
          startsAt: new Date("2026-09-01T00:00:00.000Z"),
          expiresAt: new Date("2026-09-14T14:59:59.000Z"),
        },
        now
      )
    ).toBe(false);
  });

  it("rejects a revoked grant", () => {
    expect(
      isComplimentaryGrantActive(
        {
          status: "revoked",
          startsAt: new Date("2026-09-01T00:00:00.000Z"),
          expiresAt: null,
        },
        now
      )
    ).toBe(false);
  });

  it("rejects a grant that has not started yet", () => {
    expect(
      isComplimentaryGrantActive(
        {
          status: "active",
          startsAt: new Date("2026-09-15T00:00:00.000Z"),
          expiresAt: null,
        },
        now
      )
    ).toBe(false);
  });
});
