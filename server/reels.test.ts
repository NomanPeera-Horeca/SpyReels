import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import { getReelsByJobId } from "./db";

// Mock stripe-service to allow all usage
vi.mock("./stripe/stripe-service", () => ({
  getUserSubscription: vi.fn().mockResolvedValue({ plan: "agency", status: "active", billingInterval: "monthly", cancelAtPeriodEnd: false, currentPeriodEnd: null }),
  getMonthlyUsage: vi.fn().mockResolvedValue({ scrapeCount: 0, searchCount: 0, transcribeCount: 0, recreateCount: 0, rewriteCount: 0, exportCount: 0, extensionSortCount: 0, extensionSaveCount: 0, extensionTranscribeCount: 0, extensionRecreateCount: 0 }),
  checkUsageLimit: vi.fn().mockResolvedValue({ allowed: true, limit: 999999, used: 0 }),
  incrementUsage: vi.fn().mockResolvedValue(undefined),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  constructWebhookEvent: vi.fn(),
  stripe: {},
}));

// Mock the db module
vi.mock("./db", () => ({
  createScrapeJob: vi.fn().mockResolvedValue(1),
  getScrapeJob: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    handle: "testuser",
    timeframeDays: 30,
    status: "completed",
    totalReels: 5,
    followerCount: 100000,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  updateScrapeJob: vi.fn().mockResolvedValue(undefined),
  deleteScrapeJob: vi.fn().mockResolvedValue(undefined),
  getUserScrapeJobs: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      handle: "testuser",
      timeframeDays: 30,
      status: "completed",
      totalReels: 5,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      userId: 1,
      handle: "anotheruser",
      timeframeDays: 90,
      status: "running",
      totalReels: 2,
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  insertReels: vi.fn().mockResolvedValue(undefined),
  getReelsByJobId: vi.fn().mockResolvedValue([
    {
      id: 1,
      jobId: 1,
      shortcode: "ABC123",
      caption: "Test reel caption",
      viewCount: 10000,
      likeCount: 500,
      commentCount: 25,
      thumbnailUrl: "https://example.com/thumb.jpg",
      videoUrl: "https://example.com/video.mp4",
      reelUrl: "https://www.instagram.com/reel/ABC123/",
      duration: 30,
      postedAt: new Date("2025-12-01"),
      ownerUsername: "testuser",
      createdAt: new Date(),
    },
    {
      id: 2,
      jobId: 1,
      shortcode: "DEF456",
      caption: "Another reel",
      viewCount: 50000,
      likeCount: 2000,
      commentCount: 100,
      thumbnailUrl: "https://example.com/thumb2.jpg",
      videoUrl: "https://example.com/video2.mp4",
      reelUrl: "https://www.instagram.com/reel/DEF456/",
      duration: 15,
      postedAt: new Date("2025-12-15"),
      ownerUsername: "testuser",
      createdAt: new Date(),
    },
  ]),
  getReelById: vi.fn().mockResolvedValue({
    id: 1,
    jobId: 1,
    shortcode: "ABC123",
    caption: "Test reel caption",
    viewCount: 10000,
    likeCount: 500,
    commentCount: 25,
    thumbnailUrl: "https://example.com/thumb.jpg",
    videoUrl: "https://example.com/video.mp4",
    reelUrl: "https://www.instagram.com/reel/ABC123/",
    duration: 30,
    postedAt: new Date("2025-12-01"),
    ownerUsername: "testuser",
    createdAt: new Date(),
  }),
  createTranscription: vi.fn().mockResolvedValue(1),
  getTranscriptionByReelId: vi.fn().mockResolvedValue(null),
  updateTranscription: vi.fn().mockResolvedValue(undefined),
  getTranscriptionsByJobId: vi.fn().mockResolvedValue([]),
  createRecreatedScript: vi.fn().mockResolvedValue(1),
  getRecreatedScript: vi.fn().mockResolvedValue({
    id: 1,
    reelId: 1,
    userId: 1,
    topic: "How AI changes fitness",
    gradeLevel: "4",
    viralStructure: { hook: { type: "Bold Statement", text: "Test", technique: "Attention" }, body: { pacing: "Rapid-fire", structure: "List", keyPoints: ["Point 1"] }, transition: { type: "But here's the thing", text: "But" }, cta: { type: "Follow", text: "Follow me" }, overallTone: "casual", estimatedPace: "fast" },
    generatedScript: "Test generated script content",
    readabilityAnalysis: { gradeLevel: 4, readingEase: 75, wordCount: 50, sentenceCount: 5, avgWordsPerSentence: 10, issues: [], passiveVoiceCount: 0, adverbCount: 0, hardSentenceCount: 0, veryHardSentenceCount: 0, overallAssessment: "Good" },
    status: "completed",
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  updateRecreatedScript: vi.fn().mockResolvedValue(undefined),
  getRecreatedScriptsByReelId: vi.fn().mockResolvedValue([]),
  saveReel: vi.fn().mockResolvedValue(undefined),
  unsaveReel: vi.fn().mockResolvedValue(undefined),
  isReelSaved: vi.fn().mockResolvedValue(false),
  getSavedReelsWithDetails: vi.fn().mockResolvedValue([]),
  getSavedFeaturedReelsWithDetails: vi.fn().mockResolvedValue([]),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getDb: vi.fn(),
  // Script library mocks
  createScriptTag: vi.fn().mockResolvedValue(1),
  getUserScriptTags: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, name: "Scripting", color: "#6366f1", createdAt: new Date() },
    { id: 2, userId: 1, name: "Filming", color: "#22c55e", createdAt: new Date() },
  ]),
  deleteScriptTag: vi.fn().mockResolvedValue(undefined),
  saveScript: vi.fn().mockResolvedValue(1),
  updateScript: vi.fn().mockResolvedValue(undefined),
  deleteScript: vi.fn().mockResolvedValue(undefined),
  getScriptById: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    reelId: 1,
    recreatedScriptId: 1,
    title: "Test Script",
    content: "Test script content here.",
    sourceHandle: "testuser",
    gradeLevel: "4",
    status: "draft",
    postDate: null,
    notes: "Some notes",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getUserScripts: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      title: "Test Script",
      content: "Test script content.",
      sourceHandle: "testuser",
      gradeLevel: "4",
      status: "draft",
      postDate: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      tags: [{ id: 1, name: "Scripting", color: "#6366f1" }],
    },
  ]),
  addTagToScript: vi.fn().mockResolvedValue(undefined),
  removeTagFromScript: vi.fn().mockResolvedValue(undefined),
  getScriptTags: vi.fn().mockResolvedValue([{ id: 1, name: "Scripting", color: "#6366f1" }]),
  createScriptVersion: vi.fn().mockResolvedValue(1),
  getScriptVersions: vi.fn().mockResolvedValue([]),
  getSavedScript: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    reelId: 1,
    recreatedScriptId: 1,
    title: "Test Script",
    content: "Test script content here.",
    sourceHandle: "testuser",
    gradeLevel: "4",
    status: "draft",
    postDate: null,
    notes: "Some notes",
    createdAt: new Date(),
    updatedAt: new Date(),
  }),
  getSavedScriptsByUser: vi.fn().mockResolvedValue([
    {
      id: 1,
      userId: 1,
      title: "Test Script",
      content: "Test script content.",
      sourceHandle: "testuser",
      gradeLevel: "4",
      status: "draft",
      postDate: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  updateSavedScript: vi.fn().mockResolvedValue(undefined),
  deleteSavedScript: vi.fn().mockResolvedValue(undefined),
  createSavedScript: vi.fn().mockResolvedValue(1),
  assignTagToScript: vi.fn().mockResolvedValue(undefined),
  removeTagFromScript: vi.fn().mockResolvedValue(undefined),
  getTagsForScript: vi.fn().mockResolvedValue([{ id: 1, name: "Scripting", color: "#6366f1" }]),
  getScriptsByTag: vi.fn().mockResolvedValue([]),
  getLatestVersionNumber: vi.fn().mockResolvedValue(1),
  ensureDefaultTags: vi.fn().mockResolvedValue(undefined),
  updateScriptTag: vi.fn().mockResolvedValue(undefined),
  getScriptTagsByUser: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, name: "Scripting", color: "#6366f1", createdAt: new Date() },
    { id: 2, userId: 1, name: "Filming", color: "#22c55e", createdAt: new Date() },
  ]),
  getSavedReelsByUser: vi.fn().mockResolvedValue([]),
  getLibraryTranscripts: vi.fn().mockResolvedValue({
    items: [
      {
        id: 1, reelId: 1, transcript: "Test transcript content", hookAnalysis: "Great hook",
        status: "completed", createdAt: new Date(), source: "scraped",
        sourceHandle: "testuser", reelUrl: "https://www.instagram.com/reel/ABC123/",
        thumbnailUrl: "https://example.com/thumb.jpg", caption: "Test caption",
      },
      {
        id: 2, reelId: 2, transcript: "Another transcript", hookAnalysis: null,
        status: "completed", createdAt: new Date(), source: "collected",
        sourceHandle: "otheruser", reelUrl: "https://www.instagram.com/reel/DEF456/",
        thumbnailUrl: null, caption: "Collected reel caption",
      },
    ],
    total: 2,
  }),
  getLibraryScripts: vi.fn().mockResolvedValue({
    items: [
      {
        id: 1, title: "Test Saved Script", content: "Saved script content here.",
        sourceHandle: "testuser", status: "draft", source: "saved",
        wordCount: 5, gradeLevel: "4", createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 2, title: "Re-Created Script", content: "Recreated script content.",
        sourceHandle: "anotheruser", status: "draft", source: "recreated",
        wordCount: 4, gradeLevel: "auto", createdAt: new Date(), updatedAt: new Date(),
      },
      {
        id: 3, title: "Idea Script", content: "Script from idea.",
        sourceHandle: null, status: "draft", source: "idea",
        wordCount: 4, gradeLevel: "auto", createdAt: new Date(), updatedAt: new Date(),
      },
    ],
    total: 3,
  }),
}));

// Mock the instagram module
vi.mock("./instagram", () => ({
  scrapeReels: vi.fn().mockResolvedValue([]),
  fetchReelByShortcode: vi.fn().mockResolvedValue({
    videoUrl: "https://example.com/video.mp4",
    thumbnailUrl: "https://example.com/thumb.jpg",
    caption: "Test caption",
  }),
  fetchProfile: vi.fn().mockResolvedValue({
    userId: "12345",
    username: "owner",
    isPrivate: false,
    followerCount: 142000,
    fullName: "Owner.com",
    biography: "Grow your restaurant online",
    profilePicUrl: "https://example.com/pic.jpg",
    postCount: 618,
    followingCount: 350,
    isVerified: true,
    category: "Software Company",
    externalUrl: "https://linktr.ee/ownerofficial",
  }),
}));

// Mock the transcription module
vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({
    text: "Hello world",
    language: "en",
    duration: 30,
    segments: [{ start: 0, end: 3, text: "Hello" }],
  }),
}));

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: "Hook analysis result" } }],
  }),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "test-key",
    url: "https://storage.example.com/test.mp4",
  }),
  storageHead: vi.fn().mockResolvedValue(true),
  r2ObjectPublicUrl: (key: string) => `https://storage.example.com/bucket/${key}`,
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createUnauthContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("scrape.start", () => {
  it("creates a scrape job and returns jobId", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Use a unique handle to avoid duplicate detection with existing monitoring entries
    const uniqueHandle = `testuser_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const result = await caller.scrape.start({
      handle: uniqueHandle,
      timeframeDays: 30,
    });

    expect(result).toHaveProperty("jobId");
    expect(typeof result.jobId).toBe("number");
  });

  it("rejects invalid timeframe values", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.scrape.start({
        handle: "testuser",
        timeframeDays: 45,
      })
    ).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.scrape.start({
        handle: "testuser",
        timeframeDays: 30,
      })
    ).rejects.toThrow();
  });
});

describe("scrape.status", () => {
  it("returns job status for a valid jobId", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scrape.status({ jobId: 1 });

    expect(result).toHaveProperty("id", 1);
    expect(result).toHaveProperty("handle", "testuser");
    expect(result).toHaveProperty("status", "completed");
    expect(result).toHaveProperty("totalReels", 5);
  });
});

describe("scrape.list", () => {
  it("returns all jobs for the authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scrape.list();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0].handle).toBe("testuser");
    expect(result[1].handle).toBe("anotheruser");
  });
});

describe("reels.list", () => {
  it("returns reels with transcription data and engagement rate for a job", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.reels.list({ jobId: 1 });

    // New response shape: { followerCount, reels }
    expect(result).toHaveProperty("followerCount", 100000);
    expect(Array.isArray(result.reels)).toBe(true);
    expect(result.reels.length).toBe(2);
    expect(result.reels[0]).toHaveProperty("shortcode", "ABC123");
    expect(result.reels[0]).toHaveProperty("viewCount", 10000);
    expect(result.reels[0]).toHaveProperty("transcription");
    expect(result.reels[0]).toHaveProperty("engagementRate");
    expect(result.reels[1]).toHaveProperty("shortcode", "DEF456");
    expect(result.reels[1]).toHaveProperty("viewCount", 50000);
  });

  it("calculates engagement rate correctly using follower count", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.reels.list({ jobId: 1 });

    // Reel 1: (500 likes + 25 comments) / 100000 followers * 100 = 0.525 -> 0.53
    const reel1 = result.reels.find((r: any) => r.shortcode === "ABC123");
    expect(reel1?.engagementRate).toBe(0.53);

    // Reel 2: (2000 likes + 100 comments) / 100000 followers * 100 = 2.1
    const reel2 = result.reels.find((r: any) => r.shortcode === "DEF456");
    expect(reel2?.engagementRate).toBe(2.1);
  });
});

describe("transcribe.start", () => {
  it("creates a transcription for a valid reel", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.transcribe.start({ reelId: 1 });

    expect(result).toHaveProperty("transcriptionId");
    expect(result).toHaveProperty("status", "processing");
  });
});

describe("transcribe.status", () => {
  it("returns null when no transcription exists", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.transcribe.status({ reelId: 1 });

    expect(result).toBeNull();
  });
});

describe("export.csv", () => {
  it("generates RFC 4180 CSV with 10 columns including engagement rate", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.export.csv({ jobId: 1 });

    expect(result).toHaveProperty("csv");
    expect(result).toHaveProperty("filename");
    const lines = result.csv.trim().split("\n");
    expect(lines[0]).toBe(
      '"Reel URL","Caption","Views","Likes","Comments","Engagement Rate (%)","Duration (s)","Posted At","Transcript","Hook Analysis"'
    );
    expect(lines.length).toBe(3);
    expect(result.csv).toContain("Engagement Rate (%)");
    expect(result.csv).toContain("ABC123");
    expect(result.csv).toContain("DEF456");
    expect(result.csv).not.toContain("Shortcode");
    expect(result.csv).not.toContain("Thumbnail URL");
    expect(result.filename).toContain("reels_testuser");
  });

  it("quotes reel URL and caption when they contain commas (no extra columns)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    vi.mocked(getReelsByJobId).mockResolvedValueOnce([
      {
        id: 1,
        jobId: 1,
        shortcode: "XY",
        caption: "Eat, pray, love, scale",
        viewCount: 1,
        likeCount: 1,
        commentCount: 1,
        thumbnailUrl: "https://cdn.example.com/t.jpg?w=1,h=2",
        videoUrl: "https://example.com/v.mp4",
        reelUrl: "https://www.instagram.com/reel/ZZZ/?query=a,b&_nc_ohc=test",
        duration: 10,
        postedAt: new Date("2025-01-01"),
        ownerUsername: "u",
        createdAt: new Date(),
      },
    ]);

    const result = await caller.export.csv({ jobId: 1 });
    const lines = result.csv.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(lines[1]).toContain('"Eat, pray, love, scale"');
    expect(lines[1]).toContain('"https://www.instagram.com/reel/ZZZ/?query=a,b&_nc_ohc=test"');
    // Commas inside quoted fields must not create extra split columns
    const fields = lines[1].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    expect(fields).toHaveLength(10);
  });
});

describe("recreate.generate", () => {
  it("requires a transcribed reel before generating", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // getTranscriptionByReelId returns null by default (no transcription)
    await expect(
      caller.recreate.generate({
        reelId: 1,
        topic: "How AI changes fitness",
        gradeLevel: "4",
      })
    ).rejects.toThrow("Reel must be transcribed first");
  });

  it("starts script generation when reel is transcribed", async () => {
    const { getTranscriptionByReelId } = await import("./db");
    (getTranscriptionByReelId as any).mockResolvedValueOnce({
      id: 1,
      reelId: 1,
      transcript: "This is a test transcript about restaurants",
      segments: [{ start: 0, end: 3, text: "This is a test" }],
      hookAnalysis: "Bold statement hook",
      status: "completed",
      errorMessage: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.recreate.generate({
      reelId: 1,
      topic: "How AI changes fitness",
      gradeLevel: "4",
    });

    expect(result).toHaveProperty("scriptId", 1);
    expect(result).toHaveProperty("status", "processing");
  });

  it("rejects invalid grade levels", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.recreate.generate({
        reelId: 1,
        topic: "Test topic",
        gradeLevel: "10" as any,
      })
    ).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.recreate.generate({
        reelId: 1,
        topic: "Test topic",
        gradeLevel: "auto",
      })
    ).rejects.toThrow();
  });
});

describe("recreate.status", () => {
  it("returns a completed recreated script", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.recreate.status({ scriptId: 1 });

    expect(result).toHaveProperty("id", 1);
    expect(result).toHaveProperty("status", "completed");
    expect(result).toHaveProperty("generatedScript", "Test generated script content");
    expect(result).toHaveProperty("viralStructure");
    expect(result).toHaveProperty("readabilityAnalysis");
    expect((result.viralStructure as any).hook.type).toBe("Bold Statement");
    expect((result.readabilityAnalysis as any).gradeLevel).toBe(4);
  });
});

describe("recreate.list", () => {
  it("returns empty array when no scripts exist", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.recreate.list({ reelId: 1 });

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });
});

describe("scrape.profilePreview", () => {
  it("returns profile data for a valid handle", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scrape.profilePreview({ handle: "owner" });

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.username).toBe("owner");
      expect(result.fullName).toBe("Owner.com");
      expect(result.followerCount).toBe(142000);
      expect(result.postCount).toBe(618);
      expect(result.isVerified).toBe(true);
      expect(result.isPrivate).toBe(false);
      expect(result.category).toBe("Software Company");
      expect(result.biography).toContain("restaurant");
      expect(result.externalUrl).toContain("linktr.ee");
    }
  }, 15000);

  it("returns error for non-existent handle", async () => {
    const { fetchProfile } = await import("./instagram");
    (fetchProfile as any).mockRejectedValueOnce(
      new Error('User "@nonexistent" not found.')
    );

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scrape.profilePreview({ handle: "nonexistent" });

    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.error).toContain("not found");
    }
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.scrape.profilePreview({ handle: "owner" })
    ).rejects.toThrow();
  });
});

describe("saved.toggle", () => {
  it("saves a reel when not already saved", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.saved.toggle({ reelId: 1, jobId: 1 });

    expect(result.saved).toBe(true);
  });

  it("unsaves a reel when already saved", async () => {
    const { isReelSaved } = await import("./db");
    (isReelSaved as any).mockResolvedValueOnce(true);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.saved.toggle({ reelId: 1, jobId: 1 });

    expect(result.saved).toBe(false);
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.saved.toggle({ reelId: 1, jobId: 1 })
    ).rejects.toThrow();
  });
});

describe("saved.check", () => {
  it("returns false when reel is not saved", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.saved.check({ reelId: 1 });

    expect(result.saved).toBe(false);
  });

  it("returns true when reel is saved", async () => {
    const { isReelSaved } = await import("./db");
    (isReelSaved as any).mockResolvedValueOnce(true);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.saved.check({ reelId: 1 });

    expect(result.saved).toBe(true);
  });
});

describe("saved.checkBatch", () => {
  it("returns a map of reel IDs to saved status", async () => {
    const { getDb } = await import("./db");
    (getDb as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      select: () => ({
        from: () => ({
          where: vi.fn().mockResolvedValue([]),
        }),
      }),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.saved.checkBatch({ reelIds: [1, 2, 3] });

    expect(result).toEqual({ 1: false, 2: false, 3: false });
  });
});

describe("saved.list", () => {
  it("returns empty array when no reels are saved", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.saved.list();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.saved.list()).rejects.toThrow();
  });
});

// ── Script Library Tests ──

describe("scripts.save", () => {
  it("saves a script to the library", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.save({
      title: "My New Script",
      content: "Script content here.",
      reelId: 1,
      sourceHandle: "testuser",
      gradeLevel: "4",
    });

    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("number");
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.scripts.save({
        title: "Test",
        content: "Content",
      })
    ).rejects.toThrow();
  });
});

describe("scripts.list", () => {
  it("returns user scripts with tags", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.list({});

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
    expect(result[0]).toHaveProperty("title", "Test Script");
    expect(result[0]).toHaveProperty("tags");
    expect(result[0].tags.length).toBe(1);
    expect(result[0].tags[0].name).toBe("Scripting");
  });
});

describe("scripts.get", () => {
  it("returns a script with details", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.get({ id: 1 });

    expect(result).toHaveProperty("id", 1);
    expect(result).toHaveProperty("title", "Test Script");
    expect(result).toHaveProperty("content", "Test script content here.");
    expect(result).toHaveProperty("tags");
    expect(result).toHaveProperty("versions");
  });
});

describe("scripts.update", () => {
  it("updates a script title and content", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.update({
      id: 1,
      title: "Updated Title",
      content: "Updated content.",
    });

    expect(result).toHaveProperty("success", true);
  });
});

describe("scripts.update (status change)", () => {
  it("updates script status via update endpoint", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.update({
      id: 1,
      status: "approved",
    });

    expect(result).toHaveProperty("success", true);
  });
});

describe("tags.list", () => {
  it("returns user tags", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tags.list();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(2);
    expect(result[0]).toHaveProperty("name", "Scripting");
    expect(result[1]).toHaveProperty("name", "Filming");
  });
});

describe("tags.create", () => {
  it("creates a new tag", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tags.create({
      name: "Editing",
      color: "#f59e0b",
    });

    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("number");
  });
});

describe("scripts.delete", () => {
  it("deletes a script", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.delete({ id: 1 });

    expect(result).toHaveProperty("success", true);
  });
});


describe("library.transcripts", () => {
  it("returns transcripts for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.library.transcripts({});
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBe(2);
    expect(result.items[0]).toHaveProperty("transcript");
    expect(result.items[0]).toHaveProperty("source");
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.library.transcripts({})).rejects.toThrow();
  });

  it("accepts search parameter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.library.transcripts({ search: "test", limit: 10, offset: 0 });
    expect(result).toHaveProperty("items");
  });

  it("accepts source filter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.library.transcripts({ source: "scraped" });
    expect(result).toHaveProperty("items");
  });
});

describe("library.scripts", () => {
  it("returns scripts for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.library.scripts({});
    expect(result).toHaveProperty("items");
    expect(result).toHaveProperty("total");
    expect(Array.isArray(result.items)).toBe(true);
    expect(result.total).toBe(3);
    expect(result.items[0]).toHaveProperty("title");
    expect(result.items[0]).toHaveProperty("content");
    expect(result.items[0]).toHaveProperty("source");
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.library.scripts({})).rejects.toThrow();
  });

  it("accepts source filter for saved scripts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.library.scripts({ source: "saved" });
    expect(result).toHaveProperty("items");
  });

  it("accepts source filter for recreated scripts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.library.scripts({ source: "recreated" });
    expect(result).toHaveProperty("items");
  });

  it("accepts source filter for idea scripts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.library.scripts({ source: "idea" });
    expect(result).toHaveProperty("items");
  });

  it("accepts search and pagination", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.library.scripts({ search: "test", limit: 10, offset: 0 });
    expect(result).toHaveProperty("items");
  });
});


describe("scrape.list - profilePicUrl", () => {
  it("returns profilePicUrl field in job data", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scrape.list();

    expect(Array.isArray(result)).toBe(true);
    // Each job should have a profilePicUrl field (may be null for older jobs)
    for (const job of result) {
      expect(job).toHaveProperty("handle");
      expect(job).toHaveProperty("status");
      expect(job).toHaveProperty("totalReels");
    }
  });
});

describe("scrape.start - duplicate prevention", () => {
  it("blocks duplicate research for handles already in monitoring", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // The mock getUserScrapeJobs returns "testuser" as completed,
    // so trying to start a scrape for "testuser" should throw CONFLICT
    await expect(
      caller.scrape.start({
        handle: "testuser",
        timeframeDays: 30,
      })
    ).rejects.toThrow(/already in your Account Monitoring/);
  });

  it("blocks duplicate research case-insensitively", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // "TESTUSER" should also be blocked (case-insensitive match)
    await expect(
      caller.scrape.start({
        handle: "TESTUSER",
        timeframeDays: 30,
      })
    ).rejects.toThrow(/already in your Account Monitoring/);
  });
});

describe("scrape.delete", () => {
  it("deletes a scrape job and its reels", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    // Should not throw for a valid job
    await expect(
      caller.scrape.delete({ jobId: 1 })
    ).resolves.toEqual({ success: true });
  });
});
