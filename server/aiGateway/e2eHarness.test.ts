import { createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => {
  const fakeUser = {
    id: 4242,
    openId: "ai-gateway-harness-user",
    email: "harness@spyreels.test",
    role: "user",
    name: "AI Gateway Harness",
  };
  return {
    fakeUser,
    authCodes: [] as Array<Record<string, any>>,
    refreshTokens: [] as Array<Record<string, any>>,
    authenticateBrowserSession: vi.fn(async () => fakeUser),
    capturePostHogEvent: vi.fn(async () => undefined),
    checkUsageLimit: vi.fn(),
    incrementUsage: vi.fn(async () => undefined),
    decrementUsage: vi.fn(async () => undefined),
    getUserSubscription: vi.fn(),
    getMonthlyUsage: vi.fn(),
    resolveInstagramIdentity: vi.fn(),
    searchReelsByHandle: vi.fn(),
  };
});

function fakeDb() {
  return {
    insert: (_table: unknown) => ({
      values: async (values: Record<string, any>) => {
        if (typeof values.codeHash === "string") {
          const id = harness.authCodes.length + 1;
          harness.authCodes.push({ id, consumedAt: null, createdAt: new Date(), ...values });
          return [{ insertId: id }];
        }
        if (typeof values.tokenHash === "string") {
          const id = harness.refreshTokens.length + 1;
          harness.refreshTokens.push({
            id,
            revokedAt: null,
            replacedByHash: null,
            lastUsedAt: null,
            createdAt: new Date(),
            ...values,
          });
          return [{ insertId: id }];
        }
        throw new Error("Harness received an unexpected insert shape");
      },
    }),
    select: (_shape?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_predicate: unknown) => ({
          limit: async (_limit: number) => {
            const grant = harness.authCodes.find(
              (row) => !row.consumedAt && row.expiresAt > new Date()
            );
            if (grant) return [grant];
            const refresh = harness.refreshTokens.find(
              (row) => !row.revokedAt && row.expiresAt > new Date()
            );
            return refresh ? [refresh] : [];
          },
        }),
      }),
    }),
    update: (_table: unknown) => ({
      set: (patch: Record<string, any>) => ({
        where: async (_predicate: unknown) => {
          if (Object.prototype.hasOwnProperty.call(patch, "consumedAt")) {
            const grant = harness.authCodes.find((row) => !row.consumedAt);
            if (!grant) return [{ affectedRows: 0 }];
            Object.assign(grant, patch);
            return [{ affectedRows: 1 }];
          }
          const refresh = harness.refreshTokens.find((row) => !row.revokedAt);
          if (!refresh) return [{ affectedRows: 0 }];
          Object.assign(refresh, patch);
          return [{ affectedRows: 1 }];
        },
      }),
    }),
  };
}

vi.mock("../db", () => ({
  getDb: vi.fn(async () => fakeDb()),
  getUserById: vi.fn(async (userId: number) =>
    userId === harness.fakeUser.id ? harness.fakeUser : null
  ),
}));

vi.mock("../_core/sdk", () => ({
  sdk: { authenticateRequest: harness.authenticateBrowserSession },
}));

vi.mock("./oauth/clientRegistry", () => {
  const client = {
    clientId: "spyreels-ai-harness",
    clientName: "ChatGPT Harness Client",
    source: "chatgpt" as const,
    redirectUris: ["https://client.example/callback"],
    allowedScopes: ["spyreels:read"],
    isPublic: true,
    clientSecretHash: null,
    registrationKind: "database" as const,
  };
  return {
    resolveAiOAuthClient: vi.fn(async (clientId: string) =>
      clientId === client.clientId ? client : null
    ),
    validateAiOAuthRedirectUri: vi.fn(
      (resolved: typeof client, redirectUri: string) =>
        resolved.redirectUris.includes(redirectUri)
    ),
    normalizeRequestedScopes: vi.fn(
      (resolved: typeof client, requested?: string) => {
        const scopes = (requested || "spyreels:read")
          .split(/\s+/)
          .map((value) => value.trim())
          .filter(Boolean);
        return scopes.every((scope) => resolved.allowedScopes.includes(scope))
          ? scopes
          : null;
      }
    ),
    validateAiOAuthClientSecret: vi.fn(
      (resolved: typeof client, supplied?: string) => resolved.isPublic && !supplied
    ),
  };
});

vi.mock("../analytics/posthogServer", () => ({
  capturePostHogEvent: harness.capturePostHogEvent,
  posthogDistinctIdForUser: (userId: number) => String(userId),
}));

vi.mock("../stripe/stripe-service", () => ({
  checkUsageLimit: harness.checkUsageLimit,
  incrementUsage: harness.incrementUsage,
  decrementUsage: harness.decrementUsage,
  getUserSubscription: harness.getUserSubscription,
  getMonthlyUsage: harness.getMonthlyUsage,
}));

vi.mock("../instagram", () => {
  class InstagramHandleNotFoundError extends Error {}
  class InstagramPrivateAccountError extends Error {}
  class InstagramProviderError extends Error {}
  class InstagramRestrictedMediaError extends Error {}
  return {
    InstagramHandleNotFoundError,
    InstagramPrivateAccountError,
    InstagramProviderError,
    InstagramRestrictedMediaError,
    resolveInstagramIdentity: harness.resolveInstagramIdentity,
    searchReelsByHandle: harness.searchReelsByHandle,
  };
});

process.env.NODE_ENV = "test";
process.env.SPYREELS_AI_GATEWAY_ENABLED = "true";
process.env.SPYREELS_AI_OAUTH_ISSUER = "https://spyreels.test";
process.env.SPYREELS_AI_OAUTH_JWT_SECRET = "x".repeat(64);
process.env.SPYREELS_SITE_URL = "https://spyreels.test";

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function buildHarnessApp() {
  const [{ csrfOriginGuard }, { registerAiGatewayRoutes }] = await Promise.all([
    import("../_core/csrf"),
    import("./routes"),
  ]);
  const app = express();
  app.use(csrfOriginGuard);
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  expect(registerAiGatewayRoutes(app)).toBe(true);
  return app;
}

function fakeCreatorProfile() {
  return {
    userId: "instagram-123",
    username: "garyvee",
    isPrivate: false,
    followerCount: 10_000_000,
    fullName: "Gary Vee",
    biography: "Entrepreneur",
    profilePicUrl: "https://images.example/gary.jpg",
    postCount: 8000,
    followingCount: 5000,
    isVerified: true,
    category: "Entrepreneur",
    externalUrl: "https://garyvaynerchuk.com",
  };
}

function fakeReel() {
  return {
    shortcode: "HARNESS1",
    caption: "A test Reel from the isolated AI Gateway harness.",
    viewCount: 2_500_000,
    likeCount: 140_000,
    commentCount: 5_000,
    thumbnailUrl: "https://images.example/reel.jpg",
    videoUrl: "https://video.example/reel.mp4",
    reelUrl: "https://www.instagram.com/reel/HARNESS1/",
    duration: 31,
    postedAt: new Date("2026-09-01T12:00:00.000Z"),
    ownerUsername: "garyvee",
    ownerFullName: "Gary Vee",
    ownerProfilePicUrl: "https://images.example/gary.jpg",
    ownerFollowerCount: 10_000_000,
    engagementRate: 1.45,
  };
}

describe("SpyReels AI Gateway isolated end-to-end harness", () => {
  beforeEach(() => {
    harness.authCodes.length = 0;
    harness.refreshTokens.length = 0;
    harness.authenticateBrowserSession.mockReset();
    harness.authenticateBrowserSession.mockResolvedValue(harness.fakeUser);
    harness.capturePostHogEvent.mockReset();
    harness.capturePostHogEvent.mockResolvedValue(undefined);
    harness.checkUsageLimit.mockReset();
    harness.checkUsageLimit.mockResolvedValue({ allowed: true, limit: 20, used: 1 });
    harness.incrementUsage.mockReset();
    harness.incrementUsage.mockResolvedValue(undefined);
    harness.decrementUsage.mockReset();
    harness.decrementUsage.mockResolvedValue(undefined);
    harness.getUserSubscription.mockReset();
    harness.getUserSubscription.mockResolvedValue({
      plan: "starter",
      status: "active",
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
    });
    harness.getMonthlyUsage.mockReset();
    harness.getMonthlyUsage.mockResolvedValue({
      scrapeCount: 1,
      searchCount: 1,
      transcribeCount: 0,
      recreateCount: 0,
      rewriteCount: 0,
      exportCount: 0,
      brollGenerationCount: 0,
      extensionSortCount: 0,
      extensionSaveCount: 0,
      extensionTranscribeCount: 0,
      extensionRecreateCount: 0,
    });
    harness.resolveInstagramIdentity.mockReset();
    harness.resolveInstagramIdentity.mockResolvedValue({
      ...fakeCreatorProfile(),
      requestedHandle: "garyvee",
      resolutionMethod: "profile_handle",
      fallbackUsed: false,
      mediaRestricted: false,
    });
    harness.searchReelsByHandle.mockReset();
    harness.searchReelsByHandle.mockResolvedValue({ reels: [fakeReel()], profile: fakeCreatorProfile() });
  });

  it("proves Connect SpyReels -> PKCE -> token -> MCP -> REST -> plan limit -> attribution", async () => {
    const app = await buildHarnessApp();
    const verifier = "spyreels-harness-verifier-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const challenge = pkceChallenge(verifier);
    const authorizeParams = {
      response_type: "code",
      client_id: "spyreels-ai-harness",
      redirect_uri: "https://client.example/callback",
      state: "harness-state",
      scope: "spyreels:read",
      code_challenge: challenge,
      code_challenge_method: "S256",
      resource: "https://spyreels.test/api/ai/mcp",
    };

    const consent = await request(app)
      .get("/api/ai/oauth/authorize")
      .query(authorizeParams)
      .expect(200);
    expect(consent.text).toContain("Connect SpyReels");
    expect(consent.text).toContain("ChatGPT Harness Client");

    const approved = await request(app)
      .post("/api/ai/oauth/authorize")
      .set("Origin", "https://spyreels.test")
      .type("form")
      .send({ ...authorizeParams, decision: "approve" })
      .expect(302);

    const callback = new URL(approved.headers.location);
    expect(callback.origin + callback.pathname).toBe("https://client.example/callback");
    expect(callback.searchParams.get("state")).toBe("harness-state");
    expect(callback.searchParams.get("iss")).toBe("https://spyreels.test");
    const authorizationCode = callback.searchParams.get("code");
    expect(authorizationCode).toBeTruthy();
    expect(harness.authCodes).toHaveLength(1);
    expect(harness.authCodes[0].codeHash).not.toBe(authorizationCode);

    const badPkce = await request(app)
      .post("/api/ai/oauth/token")
      .set("Origin", "https://client.example")
      .type("form")
      .send({
        grant_type: "authorization_code",
        client_id: "spyreels-ai-harness",
        code: authorizationCode,
        redirect_uri: "https://client.example/callback",
        code_verifier: "wrong-verifier-that-cannot-match-the-original-pkce-value-12345",
        resource: "https://spyreels.test/api/ai/mcp",
      })
      .expect(400);
    expect(badPkce.body.error).toBe("invalid_grant");
    expect(harness.authCodes[0].consumedAt).toBeNull();

    const tokenResponse = await request(app)
      .post("/api/ai/oauth/token")
      .set("Origin", "https://client.example")
      .type("form")
      .send({
        grant_type: "authorization_code",
        client_id: "spyreels-ai-harness",
        code: authorizationCode,
        redirect_uri: "https://client.example/callback",
        code_verifier: verifier,
        resource: "https://spyreels.test/api/ai/mcp",
      })
      .expect(200);

    const accessToken = tokenResponse.body.access_token as string;
    const refreshToken = tokenResponse.body.refresh_token as string;
    expect(accessToken).toBeTruthy();
    expect(refreshToken).toBeTruthy();
    expect(tokenResponse.body.scope).toBe("spyreels:read");
    expect(harness.authCodes[0].consumedAt).toBeInstanceOf(Date);
    expect(harness.refreshTokens).toHaveLength(1);
    expect(harness.refreshTokens[0].tokenHash).not.toBe(refreshToken);

    const mcp = await request(app)
      .post("/api/ai/mcp")
      .set("Origin", "https://chatgpt.com")
      .set("Authorization", `Bearer ${accessToken}`)
      .set("MCP-Protocol-Version", "2026-07-28")
      .set("Mcp-Method", "tools/call")
      .set("Mcp-Name", "find_top_content")
      .send({
        jsonrpc: "2.0",
        id: "mcp-harness-1",
        method: "tools/call",
        params: {
          name: "find_top_content",
          arguments: { handle: "garyvee", limit: 1, rankBy: "views" },
        },
      })
      .expect(200);

    expect(mcp.headers["mcp-protocol-version"]).toBe("2026-07-28");
    expect(mcp.body.result.isError).toBe(false);
    expect(mcp.body.result.structuredContent.creator.username).toBe("garyvee");
    expect(mcp.body.result.structuredContent.content[0].shortcode).toBe("HARNESS1");
    expect(harness.incrementUsage).toHaveBeenCalledTimes(1);

    const restUsage = await request(app)
      .post("/api/ai/v1/tools/get_usage")
      .set("Origin", "https://gemini.google.com")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({})
      .expect(200);
    expect(restUsage.body.ok).toBe(true);
    expect(restUsage.body.data.plan.id).toBe("starter");
    expect(restUsage.body.meta.source).toBe("chatgpt");

    harness.checkUsageLimit.mockResolvedValue({
      allowed: false,
      limit: 20,
      used: 20,
      planRequired: "pro",
    });

    const limited = await request(app)
      .post("/api/ai/v1/tools/find_top_content")
      .set("Origin", "https://claude.ai")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ handle: "garyvee", limit: 1, rankBy: "views" })
      .expect(429);
    expect(limited.body.ok).toBe(false);
    expect(limited.body.error.code).toBe("USAGE_LIMIT_REACHED");
    expect(limited.body.error.upgradePlan).toBe("pro");
    expect(harness.incrementUsage).toHaveBeenCalledTimes(1);

    const attributionCalls = harness.capturePostHogEvent.mock.calls
      .map(([payload]) => payload)
      .filter((payload) => payload?.event === "ai_gateway_tool_executed");
    expect(attributionCalls.length).toBeGreaterThanOrEqual(3);
    expect(
      attributionCalls.some(
        (payload) =>
          payload.properties?.ai_source === "chatgpt" &&
          payload.properties?.ai_tool === "find_top_content" &&
          payload.properties?.success === true
      )
    ).toBe(true);
    expect(
      attributionCalls.some(
        (payload) =>
          payload.properties?.ai_source === "chatgpt" &&
          payload.properties?.ai_tool === "find_top_content" &&
          payload.properties?.success === false &&
          payload.properties?.error_code === "USAGE_LIMIT_REACHED"
      )
    ).toBe(true);
  });

  it("keeps external AI transports closed when the bearer token is missing", async () => {
    const app = await buildHarnessApp();
    const mcp = await request(app)
      .post("/api/ai/mcp")
      .set("MCP-Protocol-Version", "2026-07-28")
      .set("Mcp-Method", "tools/list")
      .send({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
      .expect(401);
    expect(mcp.headers["www-authenticate"]).toContain("resource_metadata=");

    await request(app)
      .post("/api/ai/v1/tools/get_usage")
      .send({})
      .expect(401);
  });
});
