import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("./db", () => ({
  getSubscription: vi.fn(),
  getExtensionUsage: vi.fn(),
  incrementExtensionUsage: vi.fn(),
  createExtensionToken: vi.fn(),
  getExtensionTokenUser: vi.fn(),
  getUserByOpenId: vi.fn(),
  createScrapeJob: vi.fn(),
  insertReels: vi.fn(),
  createTranscription: vi.fn(),
  updateTranscription: vi.fn(),
  getReelsByJobId: vi.fn(),
  getReelById: vi.fn(),
  createSavedScript: vi.fn(),
}));

// Mock instagram module
vi.mock("./instagram", () => ({
  fetchReelByShortcode: vi.fn(),
  fetchProfile: vi.fn(),
  searchReelsByHandle: vi.fn(),
}));

// Mock voiceTranscription
vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn(),
}));

// Mock LLM
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

// Mock storage
vi.mock("./storage", () => ({
  storagePut: vi.fn(),
}));

// Mock SDK
vi.mock("./_core/sdk", () => ({
  sdk: {
    authenticateRequest: vi.fn(),
  },
}));

import { createExtensionRouter } from "./extensionApi";
import {
  getSubscription,
  getExtensionUsage,
  incrementExtensionUsage,
  createExtensionToken,
  getExtensionTokenUser,
  createScrapeJob,
  insertReels,
  createSavedScript,
} from "./db";
import { searchReelsByHandle } from "./instagram";
import { invokeLLM } from "./_core/llm";
import { sdk } from "./_core/sdk";
import express from "express";
import request from "supertest";

// Create test app
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/ext", createExtensionRouter());
  return app;
}

describe("Extension API", () => {
  let app: ReturnType<typeof createTestApp>;

  beforeEach(() => {
    vi.clearAllMocks();
    app = createTestApp();
  });

  describe("GET /api/ext/ping", () => {
    it("returns ok with user when authenticated", async () => {
      (sdk.authenticateRequest as any).mockResolvedValue({ name: "Test User", email: "test@test.com" });

      const res = await request(app).get("/api/ext/ping");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user).toBe("Test User");
    });

    it("returns ok with null user when not authenticated", async () => {
      (sdk.authenticateRequest as any).mockRejectedValue(new Error("Not auth"));

      const res = await request(app).get("/api/ext/ping");
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.user).toBeNull();
    });
  });

  describe("POST /api/ext/generate-token", () => {
    it("generates a token for a user", async () => {
      (createExtensionToken as any).mockResolvedValue(undefined);

      const res = await request(app)
        .post("/api/ext/generate-token")
        .send({ userId: 1 });

      expect(res.status).toBe(200);
      expect(res.body.token).toMatch(/^rdx_/);
      expect(createExtensionToken).toHaveBeenCalledWith(1, expect.stringMatching(/^rdx_/));
    });

    it("returns 400 when userId is missing", async () => {
      const res = await request(app)
        .post("/api/ext/generate-token")
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("userId");
    });
  });

  describe("Authentication middleware", () => {
    it("authenticates via bearer token", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });
      (getSubscription as any).mockResolvedValue({ plan: "free", status: "active" });
      (getExtensionUsage as any).mockResolvedValue({ transcribeCount: 0 });

      const res = await request(app)
        .get("/api/ext/subscription")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(getExtensionTokenUser).toHaveBeenCalledWith("test-token");
    });

    it("authenticates via session cookie when token fails", async () => {
      (getExtensionTokenUser as any).mockResolvedValue(null);
      (sdk.authenticateRequest as any).mockResolvedValue({ id: 1, name: "Test" });
      (getSubscription as any).mockResolvedValue({ plan: "free", status: "active" });
      (getExtensionUsage as any).mockResolvedValue({ transcribeCount: 0 });

      const res = await request(app)
        .get("/api/ext/subscription")
        .set("Authorization", "Bearer invalid-token");

      expect(res.status).toBe(200);
    });

    it("returns 401 when no auth method works", async () => {
      (getExtensionTokenUser as any).mockResolvedValue(null);
      (sdk.authenticateRequest as any).mockRejectedValue(new Error("No session"));

      const res = await request(app)
        .get("/api/ext/subscription")
        .set("Authorization", "Bearer invalid-token");

      expect(res.status).toBe(401);
      expect(res.body.code).toBe("AUTH_REQUIRED");
    });
  });

  describe("GET /api/ext/subscription", () => {
    it("returns free plan with usage info", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });
      (getSubscription as any).mockResolvedValue(null);
      (getExtensionUsage as any).mockResolvedValue({ transcribeCount: 1 });

      const res = await request(app)
        .get("/api/ext/subscription")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body.plan).toBe("free");
      expect(res.body.transcribesUsed).toBe(1);
      expect(res.body.transcribesRemaining).toBe(2);
      expect(res.body.canTranscribe).toBe(true);
    });

    it("returns pro plan with unlimited transcribes", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });
      (getSubscription as any).mockResolvedValue({ plan: "pro", status: "active" });
      (getExtensionUsage as any).mockResolvedValue({ transcribeCount: 50 });

      const res = await request(app)
        .get("/api/ext/subscription")
        .set("Authorization", "Bearer test-token");

      expect(res.status).toBe(200);
      expect(res.body.plan).toBe("pro");
      expect(res.body.canTranscribe).toBe(true);
      expect(res.body.canRemake).toBe(true);
    });
  });

  describe("POST /api/ext/sort-feed", () => {
    it("sorts reels by views", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });
      (searchReelsByHandle as any).mockResolvedValue({
        reels: [
          { shortcode: "abc", viewCount: 100, likeCount: 10, commentCount: 2, thumbnailUrl: "", reelUrl: "", duration: 30, postedAt: "2025-01-01" },
          { shortcode: "def", viewCount: 500, likeCount: 50, commentCount: 5, thumbnailUrl: "", reelUrl: "", duration: 45, postedAt: "2025-01-02" },
        ],
        profile: { followerCount: 1000 },
      });

      const res = await request(app)
        .post("/api/ext/sort-feed")
        .set("Authorization", "Bearer test-token")
        .send({ handle: "testuser", sortBy: "views", limit: 25 });

      expect(res.status).toBe(200);
      expect(res.body.reels).toHaveLength(2);
      expect(res.body.reels[0].shortcode).toBe("def"); // 500 views first
      expect(res.body.reels[1].shortcode).toBe("abc"); // 100 views second
    });

    it("sorts reels by engagement", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });
      (searchReelsByHandle as any).mockResolvedValue({
        reels: [
          { shortcode: "abc", viewCount: 1000, likeCount: 10, commentCount: 2, thumbnailUrl: "", reelUrl: "", duration: 30, postedAt: "2025-01-01" },
          { shortcode: "def", viewCount: 100, likeCount: 50, commentCount: 20, thumbnailUrl: "", reelUrl: "", duration: 45, postedAt: "2025-01-02" },
        ],
        profile: { followerCount: 1000 },
      });

      const res = await request(app)
        .post("/api/ext/sort-feed")
        .set("Authorization", "Bearer test-token")
        .send({ handle: "testuser", sortBy: "engagement" });

      expect(res.status).toBe(200);
      expect(res.body.reels[0].shortcode).toBe("def"); // 7% engagement vs 1.2%
    });

    it("returns 400 when handle is missing", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });

      const res = await request(app)
        .post("/api/ext/sort-feed")
        .set("Authorization", "Bearer test-token")
        .send({ sortBy: "views" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/ext/save-reel", () => {
    it("saves a reel to the dashboard", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });
      (createScrapeJob as any).mockResolvedValue(42);
      (insertReels as any).mockResolvedValue(undefined);
      (incrementExtensionUsage as any).mockResolvedValue(undefined);

      const res = await request(app)
        .post("/api/ext/save-reel")
        .set("Authorization", "Bearer test-token")
        .send({
          shortcode: "ABC123",
          reelUrl: "https://www.instagram.com/reel/ABC123/",
          caption: "Test reel",
          viewCount: 1000,
          likeCount: 100,
          commentCount: 10,
          ownerUsername: "testuser",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.jobId).toBe(42);
      expect(createScrapeJob).toHaveBeenCalled();
      expect(insertReels).toHaveBeenCalled();
    });

    it("returns 400 when shortcode or reelUrl is missing", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });

      const res = await request(app)
        .post("/api/ext/save-reel")
        .set("Authorization", "Bearer test-token")
        .send({ caption: "test" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/ext/save-script", () => {
    it("saves a script to the calendar", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });
      (createSavedScript as any).mockResolvedValue(99);

      const res = await request(app)
        .post("/api/ext/save-script")
        .set("Authorization", "Bearer test-token")
        .send({
          title: "My Script",
          content: "This is a test script for a reel about marketing.",
          sourceHandle: "testcreator",
          postDate: "2025-03-15",
          postTime: "10:00",
          status: "draft",
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.scriptId).toBe(99);
      expect(createSavedScript).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          title: "My Script",
          content: "This is a test script for a reel about marketing.",
          sourceHandle: "testcreator",
          status: "draft",
          notes: "Created from Chrome Extension",
        })
      );
    });

    it("returns 400 when content is missing", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });

      const res = await request(app)
        .post("/api/ext/save-script")
        .set("Authorization", "Bearer test-token")
        .send({ title: "No content" });

      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/ext/recreate", () => {
    it("re-creates a script when under free limit", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });
      (getSubscription as any).mockResolvedValue(null);
      (getExtensionUsage as any).mockResolvedValue({ transcribeCount: 1 });
      (incrementExtensionUsage as any).mockResolvedValue(undefined);
      (invokeLLM as any).mockResolvedValue({
        choices: [{ message: { content: "New re-created script content here." } }],
      });

      const res = await request(app)
        .post("/api/ext/recreate")
        .set("Authorization", "Bearer test-token")
        .send({
          transcript: "Original transcript text here",
          caption: "Test caption",
          gradeLevel: "5",
        });

      expect(res.status).toBe(200);
      expect(res.body.script).toBe("New re-created script content here.");
      expect(res.body.wordCount).toBeGreaterThan(0);
    });

    it("returns 403 when free limit reached", async () => {
      (getExtensionTokenUser as any).mockResolvedValue({ userId: 1 });
      (getSubscription as any).mockResolvedValue(null);
      (getExtensionUsage as any).mockResolvedValue({ transcribeCount: 3 });

      const res = await request(app)
        .post("/api/ext/recreate")
        .set("Authorization", "Bearer test-token")
        .send({ transcript: "Test transcript" });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("LIMIT_REACHED");
      expect(res.body.upgradeRequired).toBe(true);
    });
  });
});
