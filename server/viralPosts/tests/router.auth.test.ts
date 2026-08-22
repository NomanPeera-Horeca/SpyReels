import { beforeAll, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY =
    process.env.STRIPE_SECRET_KEY || "sk_test_viral_posts_unit_only";
  process.env.NODE_ENV = process.env.NODE_ENV || "development";
});

vi.mock("../../stripe/stripe-service", () => ({
  getUserSubscription: vi.fn(),
  getMonthlyUsage: vi.fn(),
  checkUsageLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 99, used: 0 }),
  incrementUsage: vi.fn(),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  constructWebhookEvent: vi.fn(),
  stripe: {},
}));

import { appRouter } from "../../routers";
import type { TrpcContext } from "../../_core/context";

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    workspaceId: null,
    workspaceRole: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("viralPosts router auth", () => {
  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY =
      process.env.STRIPE_SECRET_KEY || "sk_test_viral_posts_unit_only";
  });

  it("rejects unauthenticated daily feed", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.viralPosts.getDailyFeed({
        timezone: "UTC",
        localDate: "2026-08-22",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects unauthenticated search", async () => {
    const caller = appRouter.createCaller(createUnauthContext());
    await expect(
      caller.viralPosts.search({ query: "restaurant" })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
