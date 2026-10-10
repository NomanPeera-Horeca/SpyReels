import { beforeAll, describe, expect, it, vi } from "vitest";

const {
  saveCandidate,
  unsaveCandidate,
  getCandidateById,
  saveViralCandidateCanonical,
  unsaveViralCandidateCanonical,
  capturePostHogEvent,
} = vi.hoisted(() => {
  process.env.STRIPE_SECRET_KEY =
    process.env.STRIPE_SECRET_KEY || "sk_test_viral_posts_unit_only";
  process.env.NODE_ENV = process.env.NODE_ENV || "development";
  process.env.VIRAL_POSTS_LIVE = "true";
  process.env.VIRAL_POSTS_INSTAGRAM_ENABLED = "true";
  process.env.VIRAL_POSTS_TIKTOK_ENABLED = "true";

  return {
    saveCandidate: vi.fn(async () => undefined),
    unsaveCandidate: vi.fn(async () => undefined),
    getCandidateById: vi.fn(async () => ({
      id: 42,
      platform: "tiktok",
      sourceId: "7690247844476865814",
    })),
    saveViralCandidateCanonical: vi.fn(async () => undefined),
    unsaveViralCandidateCanonical: vi.fn(async () => undefined),
    capturePostHogEvent: vi.fn(async () => undefined),
  };
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

vi.mock("../repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../repository")>();
  return {
    ...actual,
    saveCandidate,
    unsaveCandidate,
    getCandidateById,
  };
});

vi.mock("../canonicalSaved", () => ({
  saveViralCandidateCanonical,
  unsaveViralCandidateCanonical,
}));

vi.mock("../../analytics/posthogServer", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../analytics/posthogServer")>();
  return {
    ...actual,
    capturePostHogEvent,
  };
});

import { appRouter } from "../../routers";
import type { TrpcContext } from "../../_core/context";

function createAuthedContext(): TrpcContext {
  return {
    user: {
      id: 9,
      openId: "test-open-id",
      email: "nomanpeera@gmail.com",
      name: "Noman Razzak",
      loginMethod: "email",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    } as TrpcContext["user"],
    workspaceId: "b5d0fb9f-3f79-485a-a0b6-a78b151b3e3b",
    workspaceRole: "owner",
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("viralPosts save/unsave library sync resilience", () => {
  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY =
      process.env.STRIPE_SECRET_KEY || "sk_test_viral_posts_unit_only";
  });

  it("stars successfully when canonical library sync fails", async () => {
    saveCandidate.mockClear();
    saveViralCandidateCanonical.mockReset();
    capturePostHogEvent.mockClear();
    saveViralCandidateCanonical.mockRejectedValueOnce(
      new Error(
        "Failed query: UPDATE saved_reels SET platform = ? WHERE reelId = ?"
      )
    );

    const caller = appRouter.createCaller(createAuthedContext());
    await expect(
      caller.viralPosts.save({ postId: "42" })
    ).resolves.toEqual({ ok: true, postId: "42", saved: true });

    expect(saveCandidate).toHaveBeenCalledWith(9, 42);
    expect(saveViralCandidateCanonical).toHaveBeenCalledWith(9, 42);
    expect(capturePostHogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "viral_posts_canonical_library_sync_failed",
        distinctId: "9",
        properties: expect.objectContaining({
          action: "save",
          candidateId: 42,
        }),
      })
    );
  });

  it("unsaves successfully when canonical library sync fails", async () => {
    unsaveCandidate.mockClear();
    unsaveViralCandidateCanonical.mockReset();
    capturePostHogEvent.mockClear();
    unsaveViralCandidateCanonical.mockRejectedValueOnce(
      new Error("Unknown column 'sourceId' in 'field list'")
    );

    const caller = appRouter.createCaller(createAuthedContext());
    await expect(
      caller.viralPosts.unsave({ postId: "42" })
    ).resolves.toEqual({ ok: true, postId: "42", saved: false });

    expect(unsaveCandidate).toHaveBeenCalledWith(9, 42);
    expect(capturePostHogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "viral_posts_canonical_library_sync_failed",
        properties: expect.objectContaining({ action: "unsave" }),
      })
    );
  });
});
