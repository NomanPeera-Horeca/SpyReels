import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchCollectedReelMetadata: vi.fn(),
  getDb: vi.fn(),
  checkUsageLimit: vi.fn(),
  incrementUsage: vi.fn(),
  decrementUsage: vi.fn(),
  transcribeReel: vi.fn(),
  acquireTranscriptionSlot: vi.fn(),
  releaseTranscriptionSlot: vi.fn(),
}));

vi.mock("../../collectedReelFetch", () => ({
  fetchCollectedReelMetadata: mocks.fetchCollectedReelMetadata,
}));

vi.mock("../../db", () => ({
  getDb: mocks.getDb,
}));

vi.mock("../../stripe/stripe-service", () => ({
  checkUsageLimit: mocks.checkUsageLimit,
  incrementUsage: mocks.incrementUsage,
  decrementUsage: mocks.decrementUsage,
}));

vi.mock("../../services/transcribeReel", () => ({
  transcribeReel: mocks.transcribeReel,
}));

vi.mock("../../transcriptionSemaphore", () => ({
  acquireTranscriptionSlot: mocks.acquireTranscriptionSlot,
  releaseTranscriptionSlot: mocks.releaseTranscriptionSlot,
}));

import {
  inspectReelUrl,
  resetReelResearchCachesForTest,
  transcribeReelUrl,
} from "./reelResearch";

const URL =
  "https://www.instagram.com/reel/C13BR_GvZVJ/?utm_source=ig_web_button_share_sheet";

const actor = {
  userId: 42,
  openId: "open-42",
  email: "admin@example.com",
  role: "admin",
};

const metadata = {
  videoUrl: "https://cdn.example.com/reel.mp4",
  thumbnailUrl: "https://cdn.example.com/reel.jpg",
  caption: "A restaurant lesson",
  viewCount: 125000,
  likeCount: 5200,
  commentCount: 180,
  duration: 47,
  postedAt: new Date("2026-08-01T12:00:00Z"),
  ownerUsername: "creator",
  ownerFullName: "Creator Name",
  ownerProfilePicUrl: "https://cdn.example.com/profile.jpg",
  ownerFollowerCount: 50000,
};

describe("AI Gateway exact Reel research", () => {
  beforeEach(() => {
    resetReelResearchCachesForTest();
    mocks.fetchCollectedReelMetadata.mockReset();
    mocks.getDb.mockReset();
    mocks.checkUsageLimit.mockReset();
    mocks.incrementUsage.mockReset();
    mocks.decrementUsage.mockReset();
    mocks.transcribeReel.mockReset();
    mocks.acquireTranscriptionSlot.mockReset();
    mocks.releaseTranscriptionSlot.mockReset();

    mocks.acquireTranscriptionSlot.mockResolvedValue(undefined);
    mocks.fetchCollectedReelMetadata.mockResolvedValue({
      ok: true,
      provider: "scrapecreators",
      data: metadata,
    });
    mocks.getDb.mockResolvedValue(null);
    mocks.checkUsageLimit.mockResolvedValue({
      allowed: true,
      used: 0,
      limit: 30,
    });
    mocks.incrementUsage.mockResolvedValue(undefined);
    mocks.decrementUsage.mockResolvedValue(undefined);
  });

  it("inspects the exact pasted Reel URL and strips tracking parameters", async () => {
    const result = await inspectReelUrl(URL);

    expect(mocks.fetchCollectedReelMetadata).toHaveBeenCalledWith(
      "C13BR_GvZVJ",
      "https://www.instagram.com/reel/C13BR_GvZVJ/"
    );
    expect(result).toEqual(
      expect.objectContaining({
        platform: "instagram",
        shortcode: "C13BR_GvZVJ",
        reelUrl: "https://www.instagram.com/reel/C13BR_GvZVJ/",
        caption: "A restaurant lesson",
        durationSec: 47,
        metrics: {
          views: 125000,
          likes: 5200,
          comments: 180,
        },
        creator: expect.objectContaining({
          username: "creator",
          followerCount: 50000,
        }),
      })
    );
  });

  it("rejects non-Instagram URLs before provider access", async () => {
    await expect(
      inspectReelUrl("https://example.com/reel/C13BR_GvZVJ/")
    ).rejects.toMatchObject({
      code: "INVALID_INPUT",
      retryable: false,
    });
    expect(mocks.fetchCollectedReelMetadata).not.toHaveBeenCalled();
  });

  it("transcribes the exact Reel and charges the normal transcription counter once", async () => {
    mocks.transcribeReel.mockResolvedValue({
      success: true,
      transcript: "This is the spoken transcript.",
      segments: [{ start: 0, end: 2.5, text: "This is the spoken transcript." }],
      durationSec: 47,
    });

    const result = await transcribeReelUrl({ actor, url: URL });

    expect(mocks.checkUsageLimit).toHaveBeenCalledWith(
      42,
      "transcribeCount",
      "open-42",
      { email: "admin@example.com", role: "admin" }
    );
    expect(mocks.incrementUsage).toHaveBeenCalledWith(42, "transcribeCount");
    expect(mocks.acquireTranscriptionSlot).toHaveBeenCalledTimes(1);
    expect(mocks.transcribeReel).toHaveBeenCalledWith({
      videoUrl: "https://cdn.example.com/reel.mp4",
      shortcode: "C13BR_GvZVJ",
    });
    expect(mocks.releaseTranscriptionSlot).toHaveBeenCalledTimes(1);
    expect(result.transcript).toBe("This is the spoken transcript.");
    expect(result.cache).toEqual({ hit: false, source: "live" });
  });

  it("reuses the shortcode transcript cache without a second provider or quota charge", async () => {
    mocks.transcribeReel.mockResolvedValue({
      success: true,
      transcript: "Cached transcript.",
      segments: [{ start: 0, end: 1, text: "Cached transcript." }],
      durationSec: 15,
    });

    const first = await transcribeReelUrl({ actor, url: URL });
    const second = await transcribeReelUrl({ actor, url: URL });

    expect(first.cache).toEqual({ hit: false, source: "live" });
    expect(second.cache).toEqual({ hit: true, source: "memory" });
    expect(mocks.fetchCollectedReelMetadata).toHaveBeenCalledTimes(1);
    expect(mocks.checkUsageLimit).toHaveBeenCalledTimes(1);
    expect(mocks.incrementUsage).toHaveBeenCalledTimes(1);
    expect(mocks.transcribeReel).toHaveBeenCalledTimes(1);
    expect(mocks.acquireTranscriptionSlot).toHaveBeenCalledTimes(1);
    expect(mocks.releaseTranscriptionSlot).toHaveBeenCalledTimes(1);
  });

  it("refunds quota and returns a stable no-speech error when the Reel has no voice track", async () => {
    mocks.transcribeReel.mockResolvedValue({
      success: false,
      errorCode: "NO_SPEECH_DETECTED",
      userMessage: "No speech",
      reason: "music only",
    });

    await expect(transcribeReelUrl({ actor, url: URL })).rejects.toMatchObject({
      code: "NO_SPEECH",
      retryable: false,
    });
    expect(mocks.incrementUsage).toHaveBeenCalledTimes(1);
    expect(mocks.decrementUsage).toHaveBeenCalledWith(42, "transcribeCount");
    expect(mocks.releaseTranscriptionSlot).toHaveBeenCalledTimes(1);
  });

  it("stops before Deepgram when the plan transcription limit is reached", async () => {
    mocks.checkUsageLimit.mockResolvedValue({
      allowed: false,
      used: 3,
      limit: 3,
      planRequired: "starter",
    });

    await expect(transcribeReelUrl({ actor, url: URL })).rejects.toMatchObject({
      code: "USAGE_LIMIT_REACHED",
      upgradePlan: "starter",
    });
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
    expect(mocks.transcribeReel).not.toHaveBeenCalled();
  });
});
