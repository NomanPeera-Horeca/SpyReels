import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "../../_core/context";

const mockGetDb = vi.fn();

vi.mock("../../stripe/stripe-service", () => ({
  getUserSubscription: vi.fn(),
}));

vi.mock("../../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
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

const storyRow = {
  id: 6,
  status: "completed",
  templateId: "photo_story_test",
  slideStructureJson: null,
  slotValuesJson: {
    slide_01: { headline: "This is what changed" },
  },
  slotStyleOverridesJson: null,
  imageUrlsJson: {},
  imageFrameOverridesJson: null,
};

const comparisonRow = {
  id: 7,
  status: "completed",
  templateId: "photo_story_test",
  slideStructureJson: [
    {
      id: "slide_01",
      role: "hook",
      viralWhy: "Contrast hook",
      layoutId: "photo_caption_bubble",
      slots: [
        {
          id: "headline",
          role: "headline",
          label: "Headline",
          budget: { min: 8, max: 48 },
          defaultText: "Cheap fridge vs total cost",
        },
      ],
      imageSlots: [
        { id: "photo", label: "Left", searchQueryHint: "cheap fridge" },
        { id: "photo_b", label: "Right", searchQueryHint: "right fridge" },
      ],
      composition: {
        family: "comparison",
        archetype: "comparison_split",
        treatment: "side_by_side",
        semanticRole: "comparison",
      },
    },
  ],
  slotValuesJson: {
    slide_01: { headline: "Cheap fridge vs total cost" },
  },
  slotStyleOverridesJson: null,
  imageUrlsJson: {
    slide_01: {
      photo: "https://example.com/a.jpg",
      photo_b: "https://example.com/b.jpg",
    },
  },
  imageFrameOverridesJson: null,
};

function dbWithRow(
  row: typeof storyRow | typeof comparisonRow | undefined,
  update = vi.fn()
) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (row ? [row] : []),
        }),
      }),
    }),
    update: (...args: unknown[]) => {
      update(...args);
      return {
        set: () => ({
          where: async () => undefined,
        }),
      };
    },
  };
}

describe("owned editor slot mutations", () => {
  beforeEach(() => {
    mockGetDb.mockReset();
  });

  it("returns 404 for a remake in another workspace and does not write", async () => {
    const update = vi.fn();
    mockGetDb.mockResolvedValue(dbWithRow(undefined, update));
    const caller = carouselRemakeRouter.createCaller(authCtx("ws-other"));
    await expect(
      caller.updateSlotValues({
        remakeId: 6,
        slideId: "slide_01",
        slotId: "headline",
        value: "orphan",
      })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(update).not.toHaveBeenCalled();
  });

  it("blocks incomplete remakes before any write", async () => {
    const update = vi.fn();
    mockGetDb.mockResolvedValue(
      dbWithRow({ ...storyRow, status: "processing" }, update)
    );
    const caller = carouselRemakeRouter.createCaller(authCtx());
    await expect(
      caller.updateSlotValues({
        remakeId: 6,
        slideId: "slide_01",
        slotId: "headline",
        value: "too soon",
      })
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid slideId and writes no orphan key", async () => {
    const update = vi.fn();
    mockGetDb.mockResolvedValue(dbWithRow(storyRow, update));
    const caller = carouselRemakeRouter.createCaller(authCtx());
    await expect(
      caller.updateSlotValues({
        remakeId: 6,
        slideId: "slide_99",
        slotId: "headline",
        value: "orphan",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Slide not found",
    });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid text slotId and writes no orphan key", async () => {
    const update = vi.fn();
    mockGetDb.mockResolvedValue(dbWithRow(storyRow, update));
    const caller = carouselRemakeRouter.createCaller(authCtx());
    await expect(
      caller.updateSlotValues({
        remakeId: 6,
        slideId: "slide_01",
        slotId: "not_a_real_slot",
        value: "orphan",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Slot not found",
    });
    await expect(
      caller.updateSlotStyle({
        remakeId: 6,
        slideId: "slide_01",
        slotId: "photo",
        style: { fontSizePx: 24 },
      })
    ).rejects.toBeInstanceOf(TRPCError);
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects an invalid image slotId and writes no orphan key", async () => {
    const update = vi.fn();
    mockGetDb.mockResolvedValue(dbWithRow(storyRow, update));
    const caller = carouselRemakeRouter.createCaller(authCtx());
    await expect(
      caller.updateImageUrls({
        remakeId: 6,
        slideId: "slide_01",
        slotId: "photo_b",
        url: "https://example.com/orphan.jpg",
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "That slide has no matching image slot",
    });
    await expect(
      caller.updateImageFrame({
        remakeId: 6,
        slideId: "slide_01",
        slotId: "photo_c",
        frame: { zoom: 1.2 },
      })
    ).rejects.toBeInstanceOf(TRPCError);
    expect(update).not.toHaveBeenCalled();
  });

  it("accepts a valid Story text slot and image slot", async () => {
    const update = vi.fn();
    mockGetDb.mockResolvedValue(dbWithRow(storyRow, update));
    const caller = carouselRemakeRouter.createCaller(authCtx());
    const text = await caller.updateSlotValues({
      remakeId: 6,
      slideId: "slide_01",
      slotId: "headline",
      value: "This is the real result",
    });
    expect(text.slotValues.slide_01?.headline).toBe("This is the real result");
    const image = await caller.updateImageUrls({
      remakeId: 6,
      slideId: "slide_01",
      slotId: "photo",
      url: "https://example.com/story.jpg",
    });
    expect(image.imageUrls.slide_01).toEqual({
      photo: "https://example.com/story.jpg",
    });
    expect(update).toHaveBeenCalledTimes(2);
  });

  it("accepts a valid Comparison multi-image slot", async () => {
    const update = vi.fn();
    mockGetDb.mockResolvedValue(dbWithRow(comparisonRow, update));
    const caller = carouselRemakeRouter.createCaller(authCtx());
    const image = await caller.updateImageUrls({
      remakeId: 7,
      slideId: "slide_01",
      slotId: "photo_b",
      url: "https://example.com/right.jpg",
    });
    expect(
      (image.imageUrls.slide_01 as Record<string, string>).photo_b
    ).toBe("https://example.com/right.jpg");
    const frame = await caller.updateImageFrame({
      remakeId: 7,
      slideId: "slide_01",
      slotId: "photo_b",
      frame: { zoom: 1.15 },
    });
    expect(frame.imageFrameOverrides.slide_01?.photo_b?.zoom).toBe(1.15);
    expect(update).toHaveBeenCalledTimes(2);
  });
});
