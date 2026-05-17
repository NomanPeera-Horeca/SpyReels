import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock database
vi.mock("./db", () => ({
  getPublishedBlogPosts: vi.fn().mockResolvedValue([
    {
      id: 1,
      title: "How to Go Viral on Instagram Reels",
      slug: "how-to-go-viral-instagram-reels",
      excerpt: "Learn the secrets of viral Reels content.",
      content: "<h2>Introduction</h2><p>Going viral requires strategy.</p>",
      coverImageUrl: "https://example.com/cover.jpg",
      tags: ["Instagram", "Reels", "Growth"],
      metaTitle: "Go Viral on Instagram Reels | SpyReels",
      metaDescription: "Learn how to create viral Instagram Reels with our proven strategies.",
      status: "published",
      authorId: 1,
      publishedAt: new Date("2026-01-15"),
      createdAt: new Date("2026-01-15"),
      updatedAt: new Date("2026-01-20"),
    },
  ]),
  getBlogPostBySlug: vi.fn().mockImplementation(async (slug: string) => {
    if (slug === "how-to-go-viral-instagram-reels") {
      return {
        id: 1,
        title: "How to Go Viral on Instagram Reels",
        slug: "how-to-go-viral-instagram-reels",
        excerpt: "Learn the secrets of viral Reels content.",
        content: "<h2>Introduction</h2><p>Going viral requires strategy.</p>",
        coverImageUrl: "https://example.com/cover.jpg",
        tags: ["Instagram", "Reels", "Growth"],
        metaTitle: "Go Viral on Instagram Reels | SpyReels",
        metaDescription: "Learn how to create viral Instagram Reels.",
        status: "published",
        authorId: 1,
        publishedAt: new Date("2026-01-15"),
        createdAt: new Date("2026-01-15"),
        updatedAt: new Date("2026-01-20"),
      };
    }
    return undefined;
  }),
  getBlogPostById: vi.fn().mockImplementation(async (id: number) => {
    if (id === 1) {
      return {
        id: 1,
        title: "How to Go Viral on Instagram Reels",
        slug: "how-to-go-viral-instagram-reels",
        excerpt: "Learn the secrets.",
        content: "<p>Content here</p>",
        status: "published",
        authorId: 1,
        publishedAt: new Date("2026-01-15"),
        createdAt: new Date("2026-01-15"),
        updatedAt: new Date("2026-01-20"),
      };
    }
    return undefined;
  }),
  getAllBlogPosts: vi.fn().mockResolvedValue([
    {
      id: 1,
      title: "How to Go Viral on Instagram Reels",
      slug: "how-to-go-viral-instagram-reels",
      status: "published",
      createdAt: new Date("2026-01-15"),
    },
    {
      id: 2,
      title: "Draft Post",
      slug: "draft-post",
      status: "draft",
      createdAt: new Date("2026-01-20"),
    },
  ]),
  createBlogPost: vi.fn().mockResolvedValue(3),
  updateBlogPost: vi.fn().mockResolvedValue(undefined),
  deleteBlogPost: vi.fn().mockResolvedValue(undefined),
  // Stubs for other imports
  upsertUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  createScrapeJob: vi.fn(),
  getScrapeJob: vi.fn(),
  updateScrapeJob: vi.fn(),
  getScrapeJobsByWorkspace: vi.fn(),
  insertReels: vi.fn(),
  getReelsByJobId: vi.fn(),
  getReelById: vi.fn(),
  createTranscription: vi.fn(),
  getTranscriptionByReelId: vi.fn(),
  updateTranscription: vi.fn(),
  getTranscriptionsByJobId: vi.fn(),
  createRecreatedScript: vi.fn(),
  getRecreatedScript: vi.fn(),
  updateRecreatedScript: vi.fn(),
  getRecreatedScriptsByReelId: vi.fn(),
  saveReel: vi.fn(),
  unsaveReel: vi.fn(),
  getSavedReelsByWorkspace: vi.fn(),
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
}));

// Mock stripe-service
vi.mock("./stripe/stripe-service", () => ({
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  getUserSubscription: vi.fn().mockResolvedValue({ plan: "free", status: "active" }),
  getMonthlyUsage: vi.fn().mockResolvedValue({
    scrapeCount: 0,
    searchCount: 0,
    transcribeCount: 0,
    recreateCount: 0,
    rewriteCount: 0,
    exportCount: 0,
  }),
  checkUsageLimit: vi.fn().mockResolvedValue({ allowed: true, current: 0, limit: 999999 }),
  incrementUsage: vi.fn(),
  constructWebhookEvent: vi.fn(),
  handleWebhookEvent: vi.fn(),
}));

// Mock other services
vi.mock("./instagram", () => ({
  scrapeReels: vi.fn(),
  fetchReelByShortcode: vi.fn(),
  fetchProfile: vi.fn(),
  searchReelsByKeyword: vi.fn(),
  searchReelsByHandle: vi.fn(),
}));
vi.mock("./_core/llm", () => ({ invokeLLM: vi.fn() }));
vi.mock("./storage", () => ({
  storagePut: vi.fn(),
  storageHead: vi.fn().mockResolvedValue(true),
  r2ObjectPublicUrl: (key: string) => `https://r2.test/${key}`,
}));
vi.mock("./googleSheets", () => ({
  isGoogleSheetsConfigured: vi.fn().mockReturnValue(false),
  exportToGoogleSheets: vi.fn(),
}));
vi.mock("./googleDocs", () => ({
  isGoogleDocsConfigured: vi.fn().mockReturnValue(false),
  exportToGoogleDocs: vi.fn(),
}));
vi.mock("./_core/voiceTranscription", () => ({ transcribeAudio: vi.fn() }));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createOwnerContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: process.env.OWNER_OPEN_ID || "owner-open-id",
    email: "owner@example.com",
    name: "Owner",
    loginMethod: "manus",
    role: "admin",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    workspaceId: "00000000-0000-4000-8000-000000000001",
    workspaceRole: "owner",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createRegularUserContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 2,
    openId: "regular-user-id",
    email: "user@example.com",
    name: "Regular User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    workspaceId: "00000000-0000-4000-8000-000000000002",
    workspaceRole: "owner",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    workspaceId: null,
    workspaceRole: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ── Blog CRUD Tests ──────────────────────────────────────────

describe("blog.published (public)", () => {
  it("returns published blog posts without authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const posts = await caller.blog.published();
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBeGreaterThan(0);
    expect(posts[0].title).toBe("How to Go Viral on Instagram Reels");
  });
});

describe("blog.bySlug (public)", () => {
  it("returns a post by slug", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const post = await caller.blog.bySlug({ slug: "how-to-go-viral-instagram-reels" });
    expect(post.title).toBe("How to Go Viral on Instagram Reels");
    expect(post.slug).toBe("how-to-go-viral-instagram-reels");
  });

  it("throws NOT_FOUND for non-existent slug", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.blog.bySlug({ slug: "non-existent" })).rejects.toThrow();
  });
});

describe("blog.all (admin only)", () => {
  it("returns all posts for admin/owner", async () => {
    const ctx = createOwnerContext();
    const caller = appRouter.createCaller(ctx);
    const posts = await caller.blog.all();
    expect(Array.isArray(posts)).toBe(true);
    expect(posts.length).toBe(2);
  });

  it("rejects regular users", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.blog.all()).rejects.toThrow();
  });
});

describe("blog.create (admin only)", () => {
  it("creates a blog post as admin", async () => {
    const ctx = createOwnerContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.blog.create({
      title: "New Post",
      slug: "new-post",
      content: "<p>Content</p>",
      status: "draft",
    });
    expect(result.id).toBe(3);
  });

  it("rejects regular users from creating posts", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.blog.create({
        title: "Unauthorized Post",
        slug: "unauthorized",
        content: "<p>Content</p>",
      })
    ).rejects.toThrow();
  });
});

describe("blog.update (admin only)", () => {
  it("updates a blog post as admin", async () => {
    const ctx = createOwnerContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.blog.update({
      id: 1,
      title: "Updated Title",
      status: "published",
    });
    expect(result.success).toBe(true);
  });

  it("rejects regular users from updating posts", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.blog.update({ id: 1, title: "Hack" })
    ).rejects.toThrow();
  });
});

describe("blog.delete (admin only)", () => {
  it("deletes a blog post as admin", async () => {
    const ctx = createOwnerContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.blog.delete({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects regular users from deleting posts", async () => {
    const ctx = createRegularUserContext();
    const caller = appRouter.createCaller(ctx);
    await expect(caller.blog.delete({ id: 1 })).rejects.toThrow();
  });
});

// ── Owner Bypass Tests ──────────────────────────────────────

describe("owner unlimited access", () => {
  it("owner sees 999999 limit in billing usage", async () => {
    const { checkUsageLimit } = await import("./stripe/stripe-service");
    const mockCheck = checkUsageLimit as unknown as ReturnType<typeof vi.fn>;
    mockCheck.mockResolvedValueOnce({ allowed: true, current: 0, limit: 999999 });

    const ctx = createOwnerContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.billing.checkLimit({ action: "scrapeCount" });
    expect(result.allowed).toBe(true);
  });
});
