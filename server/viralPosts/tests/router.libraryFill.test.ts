import { describe, expect, it, vi } from "vitest";
import type { ViralDailyFeedResponse, ViralPost } from "@shared/viralPosts";

vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "sk_test_viral_posts_unit_only";
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

import { fillFeedFromLibrary } from "../router";

const post = (sourceId: string, platform = "tiktok") => ({ sourceId, platform }) as unknown as ViralPost;

function feed(over: Partial<ViralDailyFeedResponse>): ViralDailyFeedResponse {
  return {
    feedId: 1,
    localDate: "2026-11-01",
    timezone: "UTC",
    generatedAt: "2026-11-01T00:00:00.000Z",
    status: "ready",
    fromCache: false,
    generationReason: "assembled",
    items: [],
    ...over,
  } as ViralDailyFeedResponse;
}

describe("fillFeedFromLibrary", () => {
  it("keeps today's picks first and fills the rest from the library, without duplicates", () => {
    const out = fillFeedFromLibrary(feed({ items: [post("a"), post("b")] }), [post("b"), post("c"), post("d")]);
    expect(out.items.map(p => p.sourceId)).toEqual(["a", "b", "c", "d"]);
    expect(out.status).toBe("ready");
  });

  it("never goes past the For You size", () => {
    const lib = Array.from({ length: 20 }, (_, i) => post(`l${i}`));
    expect(fillFeedFromLibrary(feed({ items: [post("a")] }), lib).items).toHaveLength(7);
  });

  it("turns an empty refreshing feed into a normal ready feed (no banner)", () => {
    const out = fillFeedFromLibrary(
      feed({ status: "refreshing", errorMessage: "Refreshing", generationReason: "x" }),
      [post("c")]
    );
    expect(out).toMatchObject({ status: "ready", errorMessage: null, generationReason: "library_fill" });
    expect(out.items).toHaveLength(1);
  });

  it("leaves a switched-off feed and an empty library alone", () => {
    const off = feed({ status: "error", generationReason: "disabled" });
    expect(fillFeedFromLibrary(off, [post("c")])).toBe(off);
    const empty = feed({ status: "refreshing" });
    expect(fillFeedFromLibrary(empty, [])).toBe(empty);
  });

  it("treats the same video id on another platform as different", () => {
    const out = fillFeedFromLibrary(feed({ items: [post("a", "tiktok")] }), [post("a", "youtube")]);
    expect(out.items).toHaveLength(2);
  });
});
