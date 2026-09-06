import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../../_core/context";

const mockGetDb = vi.fn();
const mockRewrite = vi.fn();

vi.mock("../../stripe/stripe-service", () => ({
  getUserSubscription: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

vi.mock("../rewriteCarouselSlotCopy", () => ({
  rewriteCarouselSlotCopy: (...args: unknown[]) => mockRewrite(...args),
  CarouselSlotRewriteError: class CarouselSlotRewriteError extends Error {},
}));

import { carouselRemakeRouter } from "../../routers/carouselRemakeRouter";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createUser(): AuthenticatedUser {
  return {
    id: 42,
    openId: "email_editor.test.local@example.com",
    email: "editor.test.local@example.com",
    name: "Editor Test",
    loginMethod: "email",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
}

function authCtx(workspaceId = "ws-local"): TrpcContext {
  return {
    user: createUser(),
    workspaceId,
    workspaceRole: "owner",
    req: { protocol: "http", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function unauthCtx(): TrpcContext {
  return {
    user: null,
    workspaceId: null,
    workspaceRole: null,
    req: { protocol: "http", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

const completedRow = {
  id: 6,
  status: "completed",
  niche: "restaurant owners",
  sourceUrl: null,
  angleOptionsJson: [
    {
      schemaVersion: 2,
      isLegacy: false,
      id: "brief-a",
      kicker: "PRICING",
      title: "5 pricing mistakes restaurant owners make",
      description: "Protect menu profit.",
      estimatedSlideCount: 7,
      topic: "5 pricing mistakes restaurant owners make",
      inferredAudience: "owners",
      audienceReasoning: "They price menus.",
      contentGoal: "educate",
      contentFormat: "listicle",
      angleType: "mistakes",
      hook: "Your menu price is costing you profit",
      corePromise: "Spot pricing leaks.",
      centralInsight: "Cheap prices can lose money.",
      keyPoints: [],
      slideOutline: [],
      layoutFamily: "story",
      visualDirection: "type",
      imageDirection: "kitchen",
      claimRisk: "low",
      researchMode: "none",
      evidenceRequirements: [],
      prohibitedClaims: [],
      ctaDirection: "Save this",
      scores: {
        clarity: 8,
        specificity: 8,
        novelty: 6,
        shareability: 7,
        saveability: 8,
        overall: 8,
      },
      confidence: 0.8,
    },
  ],
  selectedAngleIndex: 0,
  slideStructureJson: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy: "Hook",
      layoutId: "hook_bold_center",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Headline",
          budget: { min: 8, max: 48 },
          defaultText: "Your menu price is costing you profit",
        },
      ],
    },
  ],
  slotValuesJson: {
    slide_01: { headline: "Your menu price is costing you profit" },
  },
};

function dbWithRow(row: typeof completedRow | undefined) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (row ? [row] : []),
        }),
      }),
    }),
  };
}

describe("carouselRemake.rewriteSlot", () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    mockRewrite.mockReset();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("rejects unauthenticated callers", async () => {
    const caller = carouselRemakeRouter.createCaller(unauthCtx());
    await expect(
      caller.rewriteSlot({
        remakeId: 6,
        slideId: "slide_01",
        slotId: "headline",
        action: "rewrite",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects an invalid action", async () => {
    mockGetDb.mockResolvedValue(dbWithRow(completedRow));
    const caller = carouselRemakeRouter.createCaller(authCtx());
    await expect(
      caller.rewriteSlot({
        remakeId: 6,
        slideId: "slide_01",
        slotId: "headline",
        action: "regenerate_slide",
      })
    ).rejects.toBeInstanceOf(TRPCError);
  });

  it("rejects a remake from another workspace", async () => {
    mockGetDb.mockResolvedValue(dbWithRow(undefined));
    const caller = carouselRemakeRouter.createCaller(authCtx("ws-other"));
    await expect(
      caller.rewriteSlot({
        remakeId: 6,
        slideId: "slide_01",
        slotId: "headline",
        action: "rewrite",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockRewrite).not.toHaveBeenCalled();
  });

  it("rejects an invalid slide or slot", async () => {
    mockGetDb.mockResolvedValue(dbWithRow(completedRow));
    const caller = carouselRemakeRouter.createCaller(authCtx());
    await expect(
      caller.rewriteSlot({
        remakeId: 6,
        slideId: "slide_99",
        slotId: "headline",
        action: "rewrite",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.rewriteSlot({
        remakeId: 6,
        slideId: "slide_01",
        slotId: "body",
        action: "rewrite",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mockRewrite).not.toHaveBeenCalled();
  });

  it("returns rewritten text without persisting", async () => {
    mockGetDb.mockResolvedValue(dbWithRow(completedRow));
    mockRewrite.mockResolvedValue({ text: "Do not cut that menu item yet" });
    const caller = carouselRemakeRouter.createCaller(authCtx());
    const result = await caller.rewriteSlot({
      remakeId: 6,
      slideId: "slide_01",
      slotId: "headline",
      action: "make_punchier",
    });
    expect(result).toEqual({ text: "Do not cut that menu item yet" });
    expect(mockRewrite).toHaveBeenCalledTimes(1);
  });
});
