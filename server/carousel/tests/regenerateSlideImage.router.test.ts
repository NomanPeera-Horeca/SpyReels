import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../../_core/context";

const mockGetDb = vi.fn();
const mockRegenerate = vi.fn();

vi.mock("../../stripe/stripe-service", () => ({
  getUserSubscription: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
}));

vi.mock("../regenerateOwnedSlideImage", async () => {
  const actual = await vi.importActual<
    typeof import("../regenerateOwnedSlideImage")
  >("../regenerateOwnedSlideImage");
  return {
    ...actual,
    regenerateOwnedSlideImageCandidate: (...args: unknown[]) =>
      mockRegenerate(...args),
  };
});

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
  id: 7,
  status: "completed",
  templateId: "story_narrative",
  niche: "restaurant owners",
  angleOptionsJson: [
    {
      schemaVersion: 2,
      topic: "5 pricing mistakes restaurant owners make",
      title: "5 pricing mistakes restaurant owners make",
    },
  ],
  selectedAngleIndex: 0,
  slideStructureJson: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy: "Hook",
      layoutId: "story_cover_full_bleed",
      slots: [],
      imageSlots: [
        { id: "photo", label: "Photo", searchQueryHint: "menu pricing" },
      ],
    },
    {
      id: "slide_02",
      role: "insight",
      viralWhy: "Text only",
      layoutId: "story_text_only",
      slots: [],
    },
  ],
  slotValuesJson: {
    slide_01: { headline: "Your menu prices are killing profit" },
    slide_02: { headline: "Just words" },
  },
  imageUrlsJson: {
    slide_01: "https://old.example/cover.jpg",
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
    update: () => ({
      set: () => ({
        where: async () => {
          throw new Error("preview must not write imageUrlsJson");
        },
      }),
    }),
  };
}

describe("carouselRemake.regenerateSlideImage", () => {
  beforeEach(() => {
    mockGetDb.mockReset();
    mockRegenerate.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("rejects unauthenticated callers", async () => {
    const caller = carouselRemakeRouter.createCaller(unauthCtx());
    await expect(
      caller.regenerateSlideImage({
        remakeId: 7,
        slideId: "slide_01",
        slotId: "photo",
      })
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("hides availability when OPENAI_API_KEY is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    const caller = carouselRemakeRouter.createCaller(authCtx());
    await expect(caller.aiImageGenerationAvailable()).resolves.toEqual({
      enabled: false,
    });
  });

  it("exposes availability when OPENAI_API_KEY is set", async () => {
    const caller = carouselRemakeRouter.createCaller(authCtx());
    await expect(caller.aiImageGenerationAvailable()).resolves.toEqual({
      enabled: true,
    });
  });

  it("rejects a remake from another workspace", async () => {
    mockGetDb.mockResolvedValue(dbWithRow(undefined));
    const caller = carouselRemakeRouter.createCaller(authCtx("ws-other"));
    await expect(
      caller.regenerateSlideImage({
        remakeId: 7,
        slideId: "slide_01",
        slotId: "photo",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(mockRegenerate).not.toHaveBeenCalled();
  });

  it("rejects an invalid slide or image slot without writing", async () => {
    mockGetDb.mockResolvedValue(dbWithRow(completedRow));
    const { CarouselImageRegenerateError } = await import(
      "../regenerateOwnedSlideImage"
    );
    mockRegenerate
      .mockRejectedValueOnce(
        new CarouselImageRegenerateError("Slide not found", "INVALID_SLIDE")
      )
      .mockRejectedValueOnce(
        new CarouselImageRegenerateError(
          "That slide has no matching image slot",
          "INVALID_SLOT"
        )
      );
    const caller = carouselRemakeRouter.createCaller(authCtx());
    await expect(
      caller.regenerateSlideImage({
        remakeId: 7,
        slideId: "slide_99",
        slotId: "photo",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      caller.regenerateSlideImage({
        remakeId: 7,
        slideId: "slide_02",
        slotId: "photo",
      })
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("returns a candidate URL without writing imageUrlsJson", async () => {
    mockGetDb.mockResolvedValue(dbWithRow(completedRow));
    mockRegenerate.mockResolvedValue({
      url: "https://local.example/candidate.png",
    });
    const caller = carouselRemakeRouter.createCaller(authCtx());
    const result = await caller.regenerateSlideImage({
      remakeId: 7,
      slideId: "slide_01",
      slotId: "photo",
    });
    expect(result).toEqual({
      remakeId: 7,
      url: "https://local.example/candidate.png",
    });
    expect(result).not.toHaveProperty("imageUrls");
    expect(mockRegenerate).toHaveBeenCalledTimes(1);
  });

  it("does not write when generation returns no image", async () => {
    mockGetDb.mockResolvedValue(dbWithRow(completedRow));
    const { CarouselImageRegenerateError } = await import(
      "../regenerateOwnedSlideImage"
    );
    mockRegenerate.mockRejectedValue(
      new CarouselImageRegenerateError(
        "Couldn't generate another image. Try again.",
        "NO_IMAGE"
      )
    );
    const caller = carouselRemakeRouter.createCaller(authCtx());
    await expect(
      caller.regenerateSlideImage({
        remakeId: 7,
        slideId: "slide_01",
        slotId: "photo",
      })
    ).rejects.toMatchObject({
      message: "Couldn't generate another image. Try again.",
    });
  });
});
