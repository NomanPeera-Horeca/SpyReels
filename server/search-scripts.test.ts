import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

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
  getScrapeJob: vi.fn().mockResolvedValue(null),
  updateScrapeJob: vi.fn().mockResolvedValue(undefined),
  getScrapeJobsByWorkspace: vi.fn().mockResolvedValue([]),
  insertReels: vi.fn().mockResolvedValue(undefined),
  getReelsByJobId: vi.fn().mockResolvedValue([]),
  getReelById: vi.fn().mockResolvedValue(null),
  createTranscription: vi.fn().mockResolvedValue(1),
  getTranscriptionByReelId: vi.fn().mockResolvedValue(null),
  updateTranscription: vi.fn().mockResolvedValue(undefined),
  getTranscriptionsByJobId: vi.fn().mockResolvedValue([]),
  createRecreatedScript: vi.fn().mockResolvedValue(1),
  getRecreatedScript: vi.fn().mockResolvedValue(null),
  updateRecreatedScript: vi.fn().mockResolvedValue(undefined),
  getRecreatedScriptsByReelId: vi.fn().mockResolvedValue([]),
  saveReel: vi.fn().mockResolvedValue(undefined),
  unsaveReel: vi.fn().mockResolvedValue(undefined),
  isReelSaved: vi.fn().mockResolvedValue(false),
  getSavedReelsWithDetails: vi.fn().mockResolvedValue([]),
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  getDb: vi.fn(),
  createScriptTag: vi.fn().mockResolvedValue(1),
  getUserScriptTags: vi.fn().mockResolvedValue([]),
  deleteScriptTag: vi.fn().mockResolvedValue(undefined),
  saveScript: vi.fn().mockResolvedValue(1),
  updateScript: vi.fn().mockResolvedValue(undefined),
  deleteScript: vi.fn().mockResolvedValue(undefined),
  getScriptById: vi.fn().mockResolvedValue(null),
  getUserScripts: vi.fn().mockResolvedValue([]),
  addTagToScript: vi.fn().mockResolvedValue(undefined),
  removeTagFromScript: vi.fn().mockResolvedValue(undefined),
  getScriptTags: vi.fn().mockResolvedValue([]),
  createScriptVersion: vi.fn().mockResolvedValue(1),
  getScriptVersions: vi.fn().mockResolvedValue([]),
  getSavedScript: vi.fn().mockResolvedValue({
    id: 1,
    userId: 1,
    reelId: 1,
    recreatedScriptId: 1,
    title: "Test Script",
    content: "Test script content here with some words.",
    originalContent: "Original content",
    sourceHandle: "testuser",
    gradeLevel: "4",
    wordCount: 8,
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
      wordCount: 3,
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
  getTagsForScript: vi.fn().mockResolvedValue([{ id: 1, name: "Scripting", color: "#6366f1" }]),
  getScriptsByTag: vi.fn().mockResolvedValue([]),
  getLatestVersionNumber: vi.fn().mockResolvedValue(1),
  ensureDefaultTags: vi.fn().mockResolvedValue(undefined),
  updateScriptTag: vi.fn().mockResolvedValue(undefined),
  getScriptTagsByUser: vi.fn().mockResolvedValue([
    { id: 1, userId: 1, name: "Scripting", color: "#7c3aed", isDefault: 1, sortOrder: 1, createdAt: new Date() },
    { id: 2, userId: 1, name: "Rehearsing", color: "#2563eb", isDefault: 1, sortOrder: 2, createdAt: new Date() },
    { id: 3, userId: 1, name: "Filming", color: "#d97706", isDefault: 1, sortOrder: 3, createdAt: new Date() },
    { id: 4, userId: 1, name: "Editing", color: "#059669", isDefault: 1, sortOrder: 4, createdAt: new Date() },
    { id: 5, userId: 1, name: "Posting", color: "#dc2626", isDefault: 1, sortOrder: 5, createdAt: new Date() },
  ]),
  getSavedReelsByWorkspace: vi.fn().mockResolvedValue([]),
  getUserPreferences: vi.fn().mockResolvedValue(null),
  upsertUserPreferences: vi.fn().mockResolvedValue(undefined),
}));

// Mock the instagram module
vi.mock("./instagram", () => ({
  scrapeReels: vi.fn().mockResolvedValue([]),
  fetchReelByShortcode: vi.fn().mockResolvedValue({
    videoUrl: "https://example.com/video.mp4",
    thumbnailUrl: "https://example.com/thumb.jpg",
    caption: "Test caption",
    viewCount: 50000,
    likeCount: 2500,
    commentCount: 100,
    duration: 30,
    postedAt: new Date("2025-12-01"),
    ownerUsername: "testcreator",
    ownerFullName: "Test Creator",
    ownerProfilePicUrl: "https://example.com/pic.jpg",
    ownerFollowerCount: 50000,
  }),
  fetchProfile: vi.fn().mockResolvedValue({
    userId: "12345",
    username: "testcreator",
    isPrivate: false,
    followerCount: 50000,
    fullName: "Test Creator",
    biography: "Content creator",
    profilePicUrl: "https://example.com/pic.jpg",
    postCount: 200,
    followingCount: 100,
    isVerified: false,
    category: "Creator",
    externalUrl: null,
  }),
  searchReelsByKeyword: vi.fn().mockResolvedValue([
    {
      shortcode: "KW_ABC",
      caption: "Amazing fitness tips #fitness",
      viewCount: 100000,
      likeCount: 5000,
      commentCount: 200,
      thumbnailUrl: "https://example.com/kw1.jpg",
      videoUrl: "https://example.com/kw1.mp4",
      reelUrl: "https://www.instagram.com/reel/KW_ABC/",
      duration: 30,
      postedAt: new Date("2025-12-01"),
      ownerUsername: "fitnessguru",
    },
    {
      shortcode: "KW_DEF",
      caption: "Quick workout routine",
      viewCount: 50000,
      likeCount: 2000,
      commentCount: 80,
      thumbnailUrl: "https://example.com/kw2.jpg",
      videoUrl: "https://example.com/kw2.mp4",
      reelUrl: "https://www.instagram.com/reel/KW_DEF/",
      duration: 45,
      postedAt: new Date("2025-12-10"),
      ownerUsername: "workoutpro",
    },
  ]),
  searchReelsByHandle: vi.fn().mockResolvedValue({
    reels: [
      {
        shortcode: "HDL_123",
        caption: "My latest reel",
        viewCount: 75000,
        likeCount: 3500,
        commentCount: 150,
        thumbnailUrl: "https://example.com/hdl1.jpg",
        videoUrl: "https://example.com/hdl1.mp4",
        reelUrl: "https://www.instagram.com/reel/HDL_123/",
        duration: 20,
        postedAt: new Date("2025-12-05"),
        ownerUsername: "testcreator",
      },
    ],
    profile: {
      userId: "12345",
      username: "testcreator",
      followerCount: 50000,
      fullName: "Test Creator",
      profilePicUrl: "https://example.com/pic.jpg",
    },
  }),
}));

// Mock transcription
vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({
    text: "Hello world",
    language: "en",
    duration: 30,
    segments: [{ start: 0, end: 3, text: "Hello" }],
  }),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockImplementation(({ messages }: any) => {
    // Check if this is a creator suggestion request
    const systemContent = messages?.[0]?.content || "";
    if (typeof systemContent === "string" && systemContent.includes("Instagram expert")) {
      return Promise.resolve({
        choices: [{
          message: {
            content: JSON.stringify({ creators: ["testcreator", "fitnessguru"] }),
          },
        }],
      });
    }
    // Default: viral structure analysis
    return Promise.resolve({
      choices: [{
        message: {
          content: JSON.stringify({
            hook: { type: "Question", text: "Did you know?", technique: "Curiosity" },
            body: { pacing: "Moderate", structure: "List", keyPoints: ["Point 1", "Point 2"] },
            transition: { type: "But here's the thing", text: "But wait" },
            cta: { type: "Follow", text: "Follow for more" },
            overallTone: "casual",
            estimatedPace: "moderate",
          }),
        },
      }],
    });
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

// Mock Google Sheets
vi.mock("./googleSheets", () => ({
  isGoogleSheetsConfigured: vi.fn().mockReturnValue(false),
  exportToGoogleSheets: vi.fn().mockResolvedValue({ spreadsheetUrl: "" }),
}));

// Mock Google Docs
vi.mock("./googleDocs", () => ({
  isGoogleDocsConfigured: vi.fn().mockReturnValue(true),
  exportToGoogleDocs: vi.fn().mockResolvedValue({
    documentUrl: "https://docs.google.com/document/d/test-doc-id/edit",
    documentId: "test-doc-id",
  }),
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
    workspaceId: "00000000-0000-4000-8000-000000000001",
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

// ── Search Reels Tests ──

describe("search.byKeyword", () => {
  it("returns reels from Instagram tag search for a keyword", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.byKeyword({ keyword: "fitness" });

    expect(result).toHaveProperty("reels");
    expect(result).toHaveProperty("searchType", "keyword");
    expect(result).toHaveProperty("query", "fitness");
    expect(Array.isArray(result.reels)).toBe(true);
    // searchReelsByKeyword mock returns 2 reels
    expect(result.reels.length).toBe(2);
    expect(result.reels[0].shortcode).toBe("KW_ABC");
  });

  it("accepts maxResults parameter", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.byKeyword({ keyword: "fitness", maxResults: 10 });

    expect(result.reels.length).toBeGreaterThanOrEqual(0);
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.search.byKeyword({ keyword: "fitness" })
    ).rejects.toThrow();
  });

  it("rejects empty keyword", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.search.byKeyword({ keyword: "" })
    ).rejects.toThrow();
  });
});

describe("search.byHandle", () => {
  it("returns reels and profile for a handle search", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.byHandle({ handle: "testcreator" });

    expect(result).toHaveProperty("reels");
    expect(result).toHaveProperty("searchType", "handle");
    expect(result).toHaveProperty("query", "testcreator");
    expect(result).toHaveProperty("profile");
    expect(Array.isArray(result.reels)).toBe(true);
    expect(result.reels.length).toBe(1);
    expect(result.reels[0]).toHaveProperty("shortcode", "HDL_123");
    expect(result.profile).toHaveProperty("username", "testcreator");
    expect(result.profile).toHaveProperty("followerCount", 50000);
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.search.byHandle({ handle: "testcreator" })
    ).rejects.toThrow();
  });

  it("rejects empty handle", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.search.byHandle({ handle: "" })
    ).rejects.toThrow();
  });
});

describe("search.recreate", () => {
  it("generates a recreated script from a transcript", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.recreate({
      transcript: "Hey everyone, today I want to share my top 5 fitness tips...",
      caption: "Fitness tips #fitness",
      topic: "nutrition",
      gradeLevel: "4",
    });

    expect(result).toHaveProperty("viralStructure");
    expect(result).toHaveProperty("generatedScript");
    expect(result.viralStructure).toHaveProperty("hook");
    expect(result.viralStructure).toHaveProperty("body");
    expect(result.viralStructure).toHaveProperty("cta");
  });

  it("works with auto grade level", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.recreate({
      transcript: "Check this out, amazing content...",
      gradeLevel: "auto",
    });

    expect(result).toHaveProperty("generatedScript");
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.search.recreate({
        transcript: "Some transcript",
        gradeLevel: "4",
      })
    ).rejects.toThrow();
  });
});

// ── Script Tag Assignment Tests ──

describe("scripts.assignTag", () => {
  it("assigns a tag to a script", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.assignTag({ scriptId: 1, tagId: 2 });

    expect(result).toHaveProperty("success", true);
  });
});

// ── Script Grammar Check Tests ──

describe("scripts.grammarCheck", () => {
  it("returns corrected content", async () => {
    const { invokeLLM } = await import("./_core/llm");
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: "Corrected script content here with some words." } }],
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.grammarCheck({
      scriptId: 1,
      content: "Test script content here with some words.",
    });

    expect(result).toHaveProperty("content");
    expect(typeof result.content).toBe("string");
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.scripts.grammarCheck({ scriptId: 1, content: "test" })
    ).rejects.toThrow();
  });
});

// ── Script AI Rewrite Tests ──

describe("scripts.aiRewrite", () => {
  it("returns rewritten content", async () => {
    const { invokeLLM } = await import("./_core/llm");
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: "Rewritten script content that sounds natural." } }],
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.aiRewrite({
      scriptId: 1,
      content: "Test script content here with some words.",
    });

    expect(result).toHaveProperty("content");
    expect(typeof result.content).toBe("string");
  });

  it("accepts custom instruction", async () => {
    const { invokeLLM } = await import("./_core/llm");
    (invokeLLM as any).mockResolvedValueOnce({
      choices: [{ message: { content: "Funny rewritten script." } }],
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.aiRewrite({
      scriptId: 1,
      content: "Test script content here with some words.",
      instruction: "Make it funny",
    });

    expect(result).toHaveProperty("content");
  });
});

// ── Script Post Date Update Tests ──

describe("scripts.update (postDate)", () => {
  it("updates script post date", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.update({
      id: 1,
      postDate: "2026-04-15",
    });

    expect(result).toHaveProperty("success", true);
  });

  it("clears script post date with null", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.update({
      id: 1,
      postDate: null,
    });

    expect(result).toHaveProperty("success", true);
  });
});

// ── Tags CRUD Tests ──

describe("tags.create", () => {
  it("creates a custom tag", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tags.create({
      name: "Priority",
      color: "#ef4444",
    });

    expect(result).toHaveProperty("id");
    expect(typeof result.id).toBe("number");
  });
});

describe("tags.update", () => {
  it("updates a tag name and color", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tags.update({
      id: 1,
      name: "Updated Tag",
      color: "#10b981",
    });

    expect(result).toHaveProperty("success", true);
  });
});

describe("tags.delete", () => {
  it("deletes a tag", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tags.delete({ id: 1 });

    expect(result).toHaveProperty("success", true);
  });
});

// ── Tags List (with default stages) ──

describe("tags.list", () => {
  it("returns all tags including default pipeline stages", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.tags.list();

    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(5);
    // Check that default stage tags are present
    const names = result.map((t) => t.name);
    expect(names).toContain("Scripting");
    expect(names).toContain("Rehearsing");
    expect(names).toContain("Filming");
    expect(names).toContain("Editing");
    expect(names).toContain("Posting");
  });
});

// ── Google Docs Export Tests ──

describe("googleDocs.isConfigured", () => {
  it("returns configured status", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.googleDocs.isConfigured();

    expect(result).toHaveProperty("configured");
    expect(typeof result.configured).toBe("boolean");
    expect(result.configured).toBe(true);
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.googleDocs.isConfigured()).rejects.toThrow();
  });
});

describe("googleDocs.exportScript", () => {
  it("exports a script to Google Docs and returns document URL", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.googleDocs.exportScript({
      title: "My Fitness Script",
      content: "Hey everyone, today we are going to talk about fitness tips.",
      sourceHandle: "fitnessguru",
      gradeLevel: "4",
      postDate: "2026-04-15",
      wordCount: 12,
      notes: "Remember to add B-roll footage",
    });

    expect(result).toHaveProperty("documentUrl");
    expect(result).toHaveProperty("documentId");
    expect(result.documentUrl).toContain("docs.google.com");
    expect(result.documentId).toBe("test-doc-id");
  });

  it("works with minimal fields", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.googleDocs.exportScript({
      title: "Quick Script",
      content: "Just a simple script.",
    });

    expect(result).toHaveProperty("documentUrl");
    expect(result).toHaveProperty("documentId");
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.googleDocs.exportScript({
        title: "Test",
        content: "Content",
      })
    ).rejects.toThrow();
  });

  it("rejects empty title", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.googleDocs.exportScript({
        title: "",
        content: "Some content",
      })
    ).rejects.toThrow();
  });

  it("rejects empty content", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.googleDocs.exportScript({
        title: "Test Title",
        content: "",
      })
    ).rejects.toThrow();
  });

  it("handles not-configured state", async () => {
    const { isGoogleDocsConfigured } = await import("./googleDocs");
    (isGoogleDocsConfigured as any).mockReturnValueOnce(false);

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.googleDocs.exportScript({
        title: "Test",
        content: "Content",
      })
    ).rejects.toThrow(/credentials not configured/);
  });
});

// ── User Preferences Tests ──

describe("preferences.get", () => {
  it("returns default timezone when no preferences saved", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.preferences.get();

    expect(result).toHaveProperty("timezone");
    expect(result.timezone).toBe("America/Chicago");
  });

  it("returns saved timezone when preferences exist", async () => {
    const { getUserPreferences } = await import("./db");
    (getUserPreferences as any).mockResolvedValueOnce({
      id: 1,
      userId: 1,
      timezone: "Europe/London",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.preferences.get();

    expect(result.timezone).toBe("Europe/London");
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.preferences.get()).rejects.toThrow();
  });
});

describe("preferences.update", () => {
  it("updates timezone preference", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.preferences.update({
      timezone: "Asia/Tokyo",
    });

    expect(result).toHaveProperty("success", true);
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.preferences.update({ timezone: "US/Eastern" })
    ).rejects.toThrow();
  });
});

// ── Script Save with PostTime Tests ──

describe("scripts.save (with postTime)", () => {
  it("saves a script with postTime", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.save({
      title: "Test Script with Time",
      content: "Some content for the script.",
      sourceHandle: "testuser",
      gradeLevel: "4",
      postDate: "2026-04-15",
      postTime: "14:30",
      status: "draft",
    });

    expect(result).toHaveProperty("id");
  });

  it("saves a script with approved status", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.scripts.save({
      title: "Approved Script",
      content: "Final approved content.",
      sourceHandle: "creator",
      gradeLevel: "3",
      status: "approved",
      tagIds: [1, 2],
    });

    expect(result).toHaveProperty("id");
  });
});


// ── Search by URL Tests ──

describe("search.byUrl", () => {
  it("fetches reels from valid Instagram URLs with full metadata", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.byUrl({
      urls: ["https://www.instagram.com/reel/ABC123/"],
    });

    expect(result).toHaveProperty("reels");
    expect(result).toHaveProperty("errors");
    expect(result).toHaveProperty("searchType", "url");
    expect(result).toHaveProperty("totalRequested", 1);
    expect(result.reels.length).toBe(1);

    // Verify full metadata is populated from fetchReelByShortcode
    const reel = result.reels[0];
    expect(reel.shortcode).toBe("ABC123");
    expect(reel.viewCount).toBe(50000);
    expect(reel.likeCount).toBe(2500);
    expect(reel.commentCount).toBe(100);
    expect(reel.duration).toBe(30);
    expect(reel.ownerUsername).toBe("testcreator");
    expect(reel.ownerFullName).toBe("Test Creator");
    expect(reel.ownerProfilePicUrl).toBe("https://example.com/pic.jpg");
    expect(reel.ownerFollowerCount).toBe(50000);
    expect(reel.engagementRate).toBeGreaterThan(0);
  });

  it("handles multiple URLs", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.byUrl({
      urls: [
        "https://www.instagram.com/reel/ABC123/",
        "https://www.instagram.com/reel/DEF456/",
      ],
    });

    expect(result.totalRequested).toBe(2);
    expect(result).toHaveProperty("searchType", "url");
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.search.byUrl({ urls: ["https://www.instagram.com/reel/ABC123/"] })
    ).rejects.toThrow();
  });

  it("rejects empty URL array", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.search.byUrl({ urls: [] })
    ).rejects.toThrow();
  });

  it("rejects more than 20 URLs", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const tooManyUrls = Array.from({ length: 21 }, (_, i) =>
      `https://www.instagram.com/reel/TEST${i}/`
    );

    await expect(
      caller.search.byUrl({ urls: tooManyUrls })
    ).rejects.toThrow();
  });
});

// ── Search Profile Preview Tests ──

describe("search.profilePreview", () => {
  it("returns profile info for a valid handle", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.profilePreview({ handle: "testcreator" });

    expect(result).toHaveProperty("found", true);
    if (result.found) {
      expect(result).toHaveProperty("username", "testcreator");
      expect(result).toHaveProperty("fullName", "Test Creator");
      expect(result).toHaveProperty("biography", "Content creator");
      expect(result).toHaveProperty("followerCount", 50000);
      expect(result).toHaveProperty("isPrivate", false);
      expect(result).toHaveProperty("isVerified", false);
    }
  }, 15000);

  it("returns error for non-existent handle", async () => {
    const { fetchProfile } = await import("./instagram");
    (fetchProfile as any).mockRejectedValueOnce(new Error("User not found"));

    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.search.profilePreview({ handle: "nonexistent" });

    expect(result).toHaveProperty("found", false);
    if (!result.found) {
      expect(result).toHaveProperty("error");
    }
  });

  it("requires authentication", async () => {
    const ctx = createUnauthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.search.profilePreview({ handle: "testcreator" })
    ).rejects.toThrow();
  });
});
