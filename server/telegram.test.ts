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

// Mock db module
const mockGetTelegramConnectionByUserId = vi.fn();
const mockCreateTelegramConnection = vi.fn();
const mockUpdateTelegramConnection = vi.fn();
const mockDeleteTelegramConnection = vi.fn();
const mockGetCollectedReelsByUser = vi.fn();
const mockGetCollectedReelById = vi.fn();
const mockDeleteCollectedReel = vi.fn();
const mockCreateCollectedReel = vi.fn();
const mockGetCollectedReelByShortcode = vi.fn();
const mockUpdateCollectedReel = vi.fn();
const mockGetTranscriptionByReelId = vi.fn();
const mockCreateTranscription = vi.fn();
const mockGetDb = vi.fn();

vi.mock("./db", () => ({
  getTelegramConnectionByUserId: (...args: any[]) => mockGetTelegramConnectionByUserId(...args),
  createTelegramConnection: (...args: any[]) => mockCreateTelegramConnection(...args),
  updateTelegramConnection: (...args: any[]) => mockUpdateTelegramConnection(...args),
  deleteTelegramConnection: (...args: any[]) => mockDeleteTelegramConnection(...args),
  getCollectedReelsByUser: (...args: any[]) => mockGetCollectedReelsByUser(...args),
  getCollectedReelById: (...args: any[]) => mockGetCollectedReelById(...args),
  deleteCollectedReel: (...args: any[]) => mockDeleteCollectedReel(...args),
  createCollectedReel: (...args: any[]) => mockCreateCollectedReel(...args),
  getCollectedReelByShortcode: (...args: any[]) => mockGetCollectedReelByShortcode(...args),
  updateCollectedReel: (...args: any[]) => mockUpdateCollectedReel(...args),
  getTranscriptionByReelId: (...args: any[]) => mockGetTranscriptionByReelId(...args),
  createTranscription: (...args: any[]) => mockCreateTranscription(...args),
  getDb: (...args: any[]) => mockGetDb(...args),
  // Other db functions that may be called
  createScrapeJob: vi.fn(),
  getScrapeJob: vi.fn(),
  updateScrapeJob: vi.fn(),
  getUserScrapeJobs: vi.fn(),
  insertReels: vi.fn(),
  getReelsByJobId: vi.fn(),
  getReelById: vi.fn(),
  createRecreatedScript: vi.fn(),
  getRecreatedScript: vi.fn(),
  updateRecreatedScript: vi.fn(),
  getRecreatedScriptsByReelId: vi.fn(),
  saveReel: vi.fn(),
  unsaveReel: vi.fn(),
  getSavedReelsByUser: vi.fn(),
  isReelSaved: vi.fn(),
  getSavedReelsWithDetails: vi.fn(),
  createScriptTag: vi.fn(),
  getScriptTagsByUser: vi.fn(),
  updateScriptTag: vi.fn(),
  deleteScriptTag: vi.fn(),
  ensureDefaultTags: vi.fn(),
  createSavedScript: vi.fn(),
  getSavedScript: vi.fn(),
  getSavedScriptsByUser: vi.fn(),
  updateSavedScript: vi.fn(),
  deleteSavedScript: vi.fn(),
  assignTagToScript: vi.fn(),
  removeTagFromScript: vi.fn(),
  getTagsForScript: vi.fn(),
  getScriptsByTag: vi.fn(),
  createScriptVersion: vi.fn(),
  getScriptVersions: vi.fn(),
  getLatestVersionNumber: vi.fn(),
  getUserPreferences: vi.fn(),
  upsertUserPreferences: vi.fn(),
  getPublishedBlogPosts: vi.fn(),
  getBlogPostBySlug: vi.fn(),
  getAllBlogPosts: vi.fn(),
  getBlogPostById: vi.fn(),
  createBlogPost: vi.fn(),
  updateBlogPost: vi.fn(),
  deleteBlogPost: vi.fn(),
  getSubscription: vi.fn(),
  getExtensionUsage: vi.fn(),
  incrementExtensionUsage: vi.fn(),
  createExtensionToken: vi.fn(),
  getExtensionTokenUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  updateTranscription: vi.fn(),
  getTranscriptionsByJobId: vi.fn(),
  upsertUser: vi.fn(),
  getTelegramConnectionByLinkCode: vi.fn(),
  getTelegramConnectionByChatId: vi.fn(),
}));

// Mock telegramBot module
vi.mock("./telegramBot", () => ({
  getTelegramBotInfo: vi.fn().mockResolvedValue({ username: "SpyReelsBot", name: "SpyReels Bot" }),
  setupTelegramWebhook: vi.fn().mockResolvedValue(true),
  handleTelegramUpdate: vi.fn().mockResolvedValue(undefined),
}));

// Mock instagram module
vi.mock("./instagram", () => ({
  scrapeReels: vi.fn(),
  fetchReelByShortcode: vi.fn().mockResolvedValue({
    videoUrl: "https://example.com/video.mp4",
    thumbnailUrl: "https://example.com/thumb.jpg",
    caption: "Test caption",
    viewCount: 50000,
    likeCount: 2000,
    commentCount: 100,
    duration: 30,
    postedAt: new Date(),
    ownerUsername: "testcreator",
    ownerFullName: "Test Creator",
    ownerProfilePicUrl: "https://example.com/pic.jpg",
    ownerFollowerCount: 100000,
  }),
  fetchProfile: vi.fn(),
  searchReelsByKeyword: vi.fn(),
  searchReelsByHandle: vi.fn(),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn(),
  storageHead: vi.fn().mockResolvedValue(false),
  r2ObjectPublicUrl: (key: string) => `https://r2.test/${key}`,
}));

// Mock google sheets/docs
vi.mock("./googleSheets", () => ({
  isGoogleSheetsConfigured: vi.fn().mockReturnValue(false),
  exportToGoogleSheets: vi.fn(),
}));
vi.mock("./googleDocs", () => ({
  isGoogleDocsConfigured: vi.fn().mockReturnValue(false),
  exportToGoogleDocs: vi.fn(),
}));

// Mock voice transcription
vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn(),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(userId = 1): TrpcContext {
  const user: AuthenticatedUser = {
    id: userId,
    openId: "test-user-open-id",
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
      headers: { origin: "https://spyreels.ai" },
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createAdminContext(): TrpcContext {
  const ctx = createAuthContext(1);
  ctx.user!.role = "admin";
  return ctx;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Telegram Connection Tests ──

describe("telegram.status", () => {
  it("returns not connected when no connection exists", async () => {
    mockGetTelegramConnectionByUserId.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.telegram.status();
    expect(result.connected).toBe(false);
    expect(result.botUsername).toBe("SpyReelsBot");
  });

  it("returns connected when connection exists and is active", async () => {
    mockGetTelegramConnectionByUserId.mockResolvedValue({
      id: 1,
      userId: 1,
      telegramChatId: "12345",
      telegramUsername: "testuser",
      isConnected: 1,
    });
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.telegram.status();
    expect(result.connected).toBe(true);
    expect(result.telegramUsername).toBe("testuser");
  });
});

describe("telegram.generateLinkCode", () => {
  it("creates a new connection with link code when none exists", async () => {
    mockGetTelegramConnectionByUserId.mockResolvedValue(undefined);
    mockCreateTelegramConnection.mockResolvedValue(1);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.telegram.generateLinkCode();
    expect(result.code).toHaveLength(6);
    expect(result.code).toMatch(/^[A-F0-9]{6}$/);
    expect(result.botUsername).toBe("SpyReelsBot");
    expect(result.expiresAt).toBeDefined();
    expect(mockCreateTelegramConnection).toHaveBeenCalledOnce();
  });

  it("updates existing connection with new code", async () => {
    mockGetTelegramConnectionByUserId.mockResolvedValue({
      id: 5,
      userId: 1,
      isConnected: 1,
      telegramChatId: "12345",
    });
    mockUpdateTelegramConnection.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.telegram.generateLinkCode();
    expect(result.code).toHaveLength(6);
    expect(mockUpdateTelegramConnection).toHaveBeenCalledWith(5, expect.objectContaining({
      linkCode: result.code,
      isConnected: 0,
      telegramChatId: null,
    }));
  });
});

describe("telegram.disconnect", () => {
  it("deletes connection when it exists", async () => {
    mockGetTelegramConnectionByUserId.mockResolvedValue({ id: 3, userId: 1 });
    mockDeleteTelegramConnection.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.telegram.disconnect();
    expect(result.success).toBe(true);
    expect(mockDeleteTelegramConnection).toHaveBeenCalledWith(3);
  });

  it("succeeds even when no connection exists", async () => {
    mockGetTelegramConnectionByUserId.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.telegram.disconnect();
    expect(result.success).toBe(true);
    expect(mockDeleteTelegramConnection).not.toHaveBeenCalled();
  });
});

// ── Collected Reels Tests ──

describe("collected.list", () => {
  it("returns empty array when no collected reels", async () => {
    mockGetCollectedReelsByUser.mockResolvedValue([]);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.collected.list();
    expect(result).toEqual([]);
    expect(mockGetCollectedReelsByUser).toHaveBeenCalledWith(1);
  });

  it("returns collected reels for the user", async () => {
    const reels = [
      { id: 1, userId: 1, shortcode: "ABC123", status: "ready", source: "telegram", createdAt: new Date() },
      { id: 2, userId: 1, shortcode: "DEF456", status: "pending", source: "url_paste", createdAt: new Date() },
    ];
    mockGetCollectedReelsByUser.mockResolvedValue(reels);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.collected.list();
    expect(result).toHaveLength(2);
  });
});

describe("collected.delete", () => {
  it("deletes a collected reel owned by the user", async () => {
    mockGetCollectedReelById.mockResolvedValue({ id: 1, userId: 1 });
    mockDeleteCollectedReel.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.collected.delete({ id: 1 });
    expect(result.success).toBe(true);
    expect(mockDeleteCollectedReel).toHaveBeenCalledWith(1);
  });

  it("throws NOT_FOUND when reel does not belong to user", async () => {
    mockGetCollectedReelById.mockResolvedValue({ id: 1, userId: 999 });
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.collected.delete({ id: 1 })).rejects.toThrow();
  });

  it("throws NOT_FOUND when reel does not exist", async () => {
    mockGetCollectedReelById.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.collected.delete({ id: 999 })).rejects.toThrow();
  });
});

describe("collected.addByUrl", () => {
  it("adds a reel by Instagram URL", async () => {
    mockGetCollectedReelByShortcode.mockResolvedValue(undefined);
    mockCreateCollectedReel.mockResolvedValue(42);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.collected.addByUrl({ url: "https://www.instagram.com/reel/ABC123/" });
    expect(result.id).toBe(42);
    expect(result.duplicate).toBe(false);
    expect(mockCreateCollectedReel).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      shortcode: "ABC123",
      source: "url_paste",
      status: "pending",
    }));
  });

  it("returns duplicate flag when reel already exists and is ready", async () => {
    mockGetCollectedReelByShortcode.mockResolvedValue({
      id: 10,
      userId: 1,
      shortcode: "ABC123",
      status: "ready",
    });
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.collected.addByUrl({ url: "https://www.instagram.com/reel/ABC123/" });
    expect(result.id).toBe(10);
    expect(result.duplicate).toBe(true);
    expect(result.retried).toBe(false);
    expect(mockCreateCollectedReel).not.toHaveBeenCalled();
    expect(mockUpdateCollectedReel).not.toHaveBeenCalled();
  });

  it("re-queues fetch when reel exists but failed", async () => {
    mockGetCollectedReelByShortcode.mockResolvedValue({
      id: 10,
      userId: 1,
      shortcode: "ABC123",
      status: "failed",
    });
    mockUpdateCollectedReel.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.collected.addByUrl({ url: "https://www.instagram.com/reel/ABC123/" });
    expect(result.id).toBe(10);
    expect(result.duplicate).toBe(false);
    expect(result.retried).toBe(true);
    expect(mockCreateCollectedReel).not.toHaveBeenCalled();
    expect(mockUpdateCollectedReel).toHaveBeenCalledWith(
      10,
      expect.objectContaining({
        status: "pending",
        errorMessage: null,
        fetchAttempts: 0,
      })
    );
  });

  it("throws BAD_REQUEST for invalid URL", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.collected.addByUrl({ url: "https://google.com" })).rejects.toThrow();
  });

  it("handles various Instagram URL formats", async () => {
    mockGetCollectedReelByShortcode.mockResolvedValue(undefined);
    mockCreateCollectedReel.mockResolvedValue(1);
    const caller = appRouter.createCaller(createAuthContext());

    // /reel/ format
    await caller.collected.addByUrl({ url: "https://www.instagram.com/reel/XYZ789/" });
    expect(mockCreateCollectedReel).toHaveBeenCalledWith(expect.objectContaining({ shortcode: "XYZ789" }));

    // /p/ format
    mockCreateCollectedReel.mockClear();
    await caller.collected.addByUrl({ url: "https://www.instagram.com/p/ABC123/" });
    expect(mockCreateCollectedReel).toHaveBeenCalledWith(expect.objectContaining({ shortcode: "ABC123" }));

    // /username/reel/ format (mobile Copy link)
    mockCreateCollectedReel.mockClear();
    await caller.collected.addByUrl({
      url: "https://www.instagram.com/somecreator/reel/MOBILE99/",
    });
    expect(mockCreateCollectedReel).toHaveBeenCalledWith(
      expect.objectContaining({
        shortcode: "MOBILE99",
        reelUrl: "https://www.instagram.com/somecreator/reel/MOBILE99/",
      })
    );
  });
});

describe("collected.retry", () => {
  it("retries fetching metadata for a failed reel", async () => {
    mockGetCollectedReelById.mockResolvedValue({ id: 1, userId: 1, shortcode: "ABC123", status: "failed" });
    mockUpdateCollectedReel.mockResolvedValue(undefined);
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.collected.retry({ id: 1 });
    expect(result.success).toBe(true);
    expect(mockUpdateCollectedReel).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: "pending",
        errorMessage: null,
        fetchAttempts: 0,
      })
    );
  });

  it("throws NOT_FOUND when reel does not belong to user", async () => {
    mockGetCollectedReelById.mockResolvedValue({ id: 1, userId: 999 });
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.collected.retry({ id: 1 })).rejects.toThrow();
  });
});

describe("telegram.setupWebhook", () => {
  it("allows admin to set up webhook", async () => {
    const caller = appRouter.createCaller(createAdminContext());
    const result = await caller.telegram.setupWebhook({ baseUrl: "https://spyreels.ai" });
    expect(result.success).toBe(true);
  });

  it("rejects non-admin users", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.telegram.setupWebhook({ baseUrl: "https://spyreels.ai" })).rejects.toThrow();
  });
});

// ── Telegram Bot Handler Tests ──

describe("handleTelegramUpdate", () => {
  it("module exports are available", async () => {
    const mod = await import("./telegramBot");
    expect(mod.handleTelegramUpdate).toBeDefined();
    expect(mod.setupTelegramWebhook).toBeDefined();
    expect(mod.getTelegramBotInfo).toBeDefined();
  });
});

// ── Telegram Bot Token Validation ──

describe("Telegram Bot Token", () => {
  it("TELEGRAM_BOT_TOKEN environment variable is set", () => {
    // The token should be configured via webdev_request_secrets
    const token = process.env.TELEGRAM_BOT_TOKEN;
    expect(token).toBeDefined();
    expect(token!.length).toBeGreaterThan(10);
    expect(token).toContain(":");
  });
});
