import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getOnboardingState: vi.fn(),
  getPersonalWorkspaceId: vi.fn(),
  getCreatorCoachProfile: vi.fn(),
  getOrFetchAudienceSignals: vi.fn(),
  checkUsageLimit: vi.fn(),
  incrementUsage: vi.fn(),
  decrementUsage: vi.fn(),
  getUserSubscription: vi.fn(),
  isFirstRemakeUsageBypassEligible: vi.fn(),
  transcribeReelUrl: vi.fn(),
  generateRemakeContent: vi.fn(),
  getResearchGrounding: vi.fn(),
  analyzeRemakeStructure: vi.fn(),
}));

vi.mock("../../db", () => ({
  getOnboardingState: mocks.getOnboardingState,
}));

vi.mock("../../personalWorkspace", () => ({
  getPersonalWorkspaceId: mocks.getPersonalWorkspaceId,
}));

vi.mock("../../planCoachProfile", () => ({
  getCreatorCoachProfile: mocks.getCreatorCoachProfile,
}));

vi.mock("../../audienceResearch/service", () => ({
  getOrFetchAudienceSignals: mocks.getOrFetchAudienceSignals,
}));

vi.mock("../../stripe/stripe-service", () => ({
  checkUsageLimit: mocks.checkUsageLimit,
  incrementUsage: mocks.incrementUsage,
  decrementUsage: mocks.decrementUsage,
  getUserSubscription: mocks.getUserSubscription,
}));

vi.mock("../../routers/_shared", () => ({
  isFirstRemakeUsageBypassEligible: mocks.isFirstRemakeUsageBypassEligible,
}));

vi.mock("./reelResearch", () => ({
  transcribeReelUrl: mocks.transcribeReelUrl,
}));

vi.mock("../../recreate/generateRemakeContent", () => ({
  generateRemakeContent: mocks.generateRemakeContent,
  isRemakeContentRetryableFailure: (error: unknown) => {
    if (!(error instanceof Error)) return false;
    const message = error.message;
    return (
      message === "We couldn't finish this remake. Please try again." ||
      message.includes("safely grounded remake") ||
      message.includes("sufficiently original same-topic remake")
    );
  },
}));

vi.mock("../../studioResearchGrounding", () => ({
  getResearchGrounding: mocks.getResearchGrounding,
  formatResearchGroundingForPrompt: (items: Array<{ title: string; snippet?: string | null; sourceUrl: string }>) =>
    items
      .map((item, index) => `${index + 1}. ${item.title}\n   Fact/detail: ${item.snippet ?? "(no snippet)"}\n   Source: ${item.sourceUrl}`)
      .join("\n"),
}));

vi.mock("../../recreate/remakeStructure", () => ({
  analyzeRemakeStructure: mocks.analyzeRemakeStructure,
}));

import { remakeReelUrl } from "./remakeReel";

const actor = {
  userId: 42,
  openId: "open-42",
  email: "admin@example.com",
  role: "admin",
};

const reelResult = {
  reel: {
    platform: "instagram" as const,
    shortcode: "C13BR_GvZVJ",
    reelUrl: "https://www.instagram.com/reel/C13BR_GvZVJ/",
    creator: {
      username: "the_30_rule",
      fullName: "Preston Lee",
      followerCount: 49921,
      profilePicUrl: "",
    },
    caption: "restaurant strategy",
    metrics: { views: 884042, likes: 18144, comments: 307 },
    durationSec: 69,
    postedAt: "2024-01-09T00:00:00.000Z",
    thumbnailUrl: "",
    provider: "scrapecreators" as const,
  },
  transcript: "Why does Cheesecake Factory have 250 menu items?",
  segments: [],
  durationSec: 69,
  cache: { hit: true, source: "memory" as const },
};

describe("AI Gateway remake_reel", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();

    mocks.getOnboardingState.mockResolvedValue({
      hasCompletedFirstSpy: true,
      targetAudience: "restaurant owners",
      businessDescription: "I teach restaurant owners how to grow profitably",
    });
    mocks.getPersonalWorkspaceId.mockResolvedValue("workspace-1");
    mocks.getCreatorCoachProfile.mockResolvedValue({
      niche: "Restaurants & Cafes",
      nicheSlug: "restaurants-cafes",
      targetAudience: "restaurant owners",
      brandDescription: "restaurant growth education",
    });
    mocks.getOrFetchAudienceSignals.mockResolvedValue({ signals: [] });
    mocks.isFirstRemakeUsageBypassEligible.mockResolvedValue(false);
    mocks.checkUsageLimit.mockResolvedValue({
      allowed: true,
      used: 1,
      limit: 100,
    });
    mocks.getUserSubscription.mockResolvedValue({ plan: "pro" });
    mocks.incrementUsage.mockResolvedValue(undefined);
    mocks.decrementUsage.mockResolvedValue(undefined);
    mocks.transcribeReelUrl.mockResolvedValue(reelResult);
    mocks.getResearchGrounding.mockResolvedValue([
      {
        title: "Restaurant menu engineering basics",
        snippet: "Operators use menu engineering to compare item popularity and profitability.",
        sourceUrl: "https://example.com/menu-engineering",
      },
    ]);
    mocks.analyzeRemakeStructure.mockResolvedValue({
      structure: { hook: { type: "Question" } },
      cacheHit: false,
    });
    mocks.generateRemakeContent.mockResolvedValue({
      viralStructure: { hook: { type: "Question" } },
      generatedScript: "Here is the SpyReels remake.",
      readabilityAnalysis: { gradeLevel: 5 },
      structureCacheHit: false,
      factIntegrity: { repaired: false, initialRiskCount: 0 },
    });
  });

  it("uses the shared remake engine for Use my idea", async () => {
    const result = await remakeReelUrl({
      actor,
      url: reelResult.reel.reelUrl,
      instruction: "Use this structure but make it about why menu engineering matters for restaurant profit",
    });

    expect(mocks.transcribeReelUrl).toHaveBeenCalledWith({
      actor,
      url: reelResult.reel.reelUrl,
    });
    expect(mocks.incrementUsage).toHaveBeenCalledWith(42, "recreateCount");
    expect(mocks.getResearchGrounding).toHaveBeenCalledWith(
      expect.stringContaining("menu engineering matters"),
      "Restaurants & Cafes"
    );
    expect(mocks.analyzeRemakeStructure).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceKey: "C13BR_GvZVJ",
        originalTranscript: reelResult.transcript,
      })
    );
    expect(mocks.generateRemakeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        originalTranscript: reelResult.transcript,
        caption: "restaurant strategy",
        sourceKey: "C13BR_GvZVJ",
        gradeLevel: "auto",
        addCues: true,
        platformLabel: "Instagram Reel",
        topic: expect.stringContaining("menu engineering matters"),
        researchGroundingBlock: expect.stringContaining("Restaurant menu engineering basics"),
        viralStructureOverride: expect.objectContaining({
          hook: expect.objectContaining({ type: "Question" }),
        }),
      })
    );
    expect(result.remake.mode).toBe("custom");
    expect(result.remake.generatedScript).toBe("Here is the SpyReels remake.");
    expect(result.remake).not.toHaveProperty("viralStructure");
    expect(result.remake).not.toHaveProperty("readabilityAnalysis");
    expect(result.remake.structure).toEqual(
      expect.objectContaining({ hookType: "Question" })
    );
    expect(result.remake.readability).toEqual(
      expect.objectContaining({ gradeLevel: 5 })
    );
    expect(result.savedToSpyReels).toBe(false);
  });

  it("maps Keep this topic to SAME_TOPIC", async () => {
    await remakeReelUrl({
      actor,
      url: reelResult.reel.reelUrl,
      instruction: "Keep the same topic but rewrite it for me",
    });

    expect(mocks.generateRemakeContent).toHaveBeenCalledWith(
      expect.objectContaining({ topic: "SAME_TOPIC" })
    );
  });

  it("uses the creator profile and audience research for Adapt to my niche", async () => {
    await remakeReelUrl({
      actor,
      url: reelResult.reel.reelUrl,
      instruction: "Remake this similarly for me",
    });

    expect(mocks.getPersonalWorkspaceId).toHaveBeenCalledWith(42);
    expect(mocks.getOrFetchAudienceSignals).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      nicheSlug: "restaurants-cafes",
      nicheLabel: "Restaurants & Cafes",
      targetAudience: "restaurant owners",
    });
    expect(mocks.generateRemakeContent).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: expect.stringContaining("Restaurants & Cafes"),
      })
    );
  });

  it("blocks remake before transcription when the plan limit is reached", async () => {
    mocks.checkUsageLimit.mockResolvedValue({
      allowed: false,
      used: 3,
      limit: 3,
      planRequired: "starter",
    });

    await expect(
      remakeReelUrl({
        actor,
        url: reelResult.reel.reelUrl,
        instruction: "Keep the same topic",
      })
    ).rejects.toMatchObject({
      code: "USAGE_LIMIT_REACHED",
      upgradePlan: "starter",
    });

    expect(mocks.transcribeReelUrl).not.toHaveBeenCalled();
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
  });

  it("refunds remake usage when generation fails", async () => {
    mocks.generateRemakeContent.mockRejectedValue(new Error("provider down"));

    await expect(
      remakeReelUrl({
        actor,
        url: reelResult.reel.reelUrl,
        instruction: "Keep the same topic",
      })
    ).rejects.toThrow("provider down");

    expect(mocks.incrementUsage).toHaveBeenCalledWith(42, "recreateCount");
    expect(mocks.decrementUsage).toHaveBeenCalledWith(42, "recreateCount");
  });

  it("requires clarification for a bare remake request before any quota or transcription work", async () => {
    await expect(
      remakeReelUrl({
        actor,
        url: reelResult.reel.reelUrl,
        instruction: "remake this",
      })
    ).rejects.toMatchObject({
      code: "CLARIFICATION_REQUIRED",
    });

    expect(mocks.checkUsageLimit).not.toHaveBeenCalled();
    expect(mocks.transcribeReelUrl).not.toHaveBeenCalled();
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
  });

  it("treats an explicitly named niche as a custom direction instead of saved profile", async () => {
    const result = await remakeReelUrl({
      actor,
      url: reelResult.reel.reelUrl,
      instruction: "Remake this for my fitness niche",
    });

    expect(result.remake.mode).toBe("custom");
    expect(result.remake.angle).toContain("fitness niche");
    expect(mocks.getPersonalWorkspaceId).not.toHaveBeenCalled();
  });
});
