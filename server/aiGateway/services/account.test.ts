import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserSubscription: vi.fn(),
  getMonthlyUsage: vi.fn(),
}));

vi.mock("../../stripe/stripe-service", () => ({
  getUserSubscription: mocks.getUserSubscription,
  getMonthlyUsage: mocks.getMonthlyUsage,
}));

import { getAccountUsage } from "./account";

const emptyUsage = {
  scrapeCount: 0,
  searchCount: 0,
  transcribeCount: 0,
  recreateCount: 0,
  rewriteCount: 0,
  exportCount: 0,
  brollGenerationCount: 0,
  extensionSortCount: 0,
  extensionSaveCount: 0,
  extensionTranscribeCount: 0,
  extensionRecreateCount: 0,
};

describe("AI Gateway account entitlement reporting", () => {
  beforeEach(() => {
    mocks.getUserSubscription.mockReset();
    mocks.getMonthlyUsage.mockReset();
    mocks.getMonthlyUsage.mockResolvedValue(emptyUsage);
    delete process.env.ADMIN_EMAIL;
    delete process.env.OWNER_OPEN_ID;
  });

  it("reports admin access as active and unlimited even when billing is historically cancelled", async () => {
    mocks.getUserSubscription.mockResolvedValue({
      plan: "free",
      status: "canceled",
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-05-08T00:00:00.000Z"),
    });

    const result = await getAccountUsage({
      userId: 1,
      email: "admin@example.com",
      role: "admin",
      openId: "admin-open-id",
    });

    expect(result.access).toEqual(
      expect.objectContaining({
        mode: "unlimited",
        label: "Admin",
        status: "active",
        unlimitedUsage: true,
        authoritative: true,
      })
    );
    expect(result.limits).toBeNull();
    expect(result.billing).toEqual(
      expect.objectContaining({
        plan: { id: "free", name: "Free" },
        status: "canceled",
        currentPeriodEnd: "2026-05-08T00:00:00.000Z",
      })
    );
    expect(result.usage).toEqual(emptyUsage);
  });

  it("keeps plan limits authoritative for ordinary users", async () => {
    mocks.getUserSubscription.mockResolvedValue({
      plan: "starter",
      status: "active",
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-10-08T00:00:00.000Z"),
    });

    const result = await getAccountUsage({
      userId: 2,
      email: "creator@example.com",
      role: "user",
      openId: "creator-open-id",
    });

    expect(result.access).toEqual(
      expect.objectContaining({
        mode: "plan",
        label: "Starter",
        status: "active",
        unlimitedUsage: false,
        authoritative: true,
      })
    );
    expect(result.limits).toEqual(
      expect.objectContaining({
        scrapesPerMonth: 10,
        searchesPerDay: 20,
      })
    );
    expect(result.billing.plan).toEqual({ id: "starter", name: "Starter" });
  });
});
