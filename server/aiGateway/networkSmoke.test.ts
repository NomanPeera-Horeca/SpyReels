import { createHash } from "node:crypto";
import type { AddressInfo } from "node:net";
import express from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const smoke = vi.hoisted(() => {
  const user = {
    id: 5151,
    openId: "ai-gateway-network-smoke",
    email: "network-smoke@spyreels.test",
    role: "user",
    name: "AI Gateway Network Smoke",
  };
  return {
    user,
    authCodes: [] as Array<Record<string, any>>,
    refreshTokens: [] as Array<Record<string, any>>,
    capturePostHogEvent: vi.fn(async () => undefined),
    authenticateBrowserSession: vi.fn(async () => user),
    getUserSubscription: vi.fn(),
    getMonthlyUsage: vi.fn(),
  };
});

function fakeDb() {
  return {
    insert: (_table: unknown) => ({
      values: async (values: Record<string, any>) => {
        if (typeof values.codeHash === "string") {
          const id = smoke.authCodes.length + 1;
          smoke.authCodes.push({ id, consumedAt: null, createdAt: new Date(), ...values });
          return [{ insertId: id }];
        }
        if (typeof values.tokenHash === "string") {
          const id = smoke.refreshTokens.length + 1;
          smoke.refreshTokens.push({
            id,
            revokedAt: null,
            replacedByHash: null,
            lastUsedAt: null,
            createdAt: new Date(),
            ...values,
          });
          return [{ insertId: id }];
        }
        throw new Error("Unexpected network-smoke insert shape");
      },
    }),
    select: (_shape?: unknown) => ({
      from: (_table: unknown) => ({
        where: (_predicate: unknown) => ({
          limit: async (_limit: number) => {
            const grant = smoke.authCodes.find(
              (row) => !row.consumedAt && row.expiresAt > new Date()
            );
            if (grant) return [grant];
            const refresh = smoke.refreshTokens.find(
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
            const grant = smoke.authCodes.find((row) => !row.consumedAt);
            if (!grant) return [{ affectedRows: 0 }];
            Object.assign(grant, patch);
            return [{ affectedRows: 1 }];
          }
          const refresh = smoke.refreshTokens.find((row) => !row.revokedAt);
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
    userId === smoke.user.id ? smoke.user : null
  ),
}));

vi.mock("../_core/sdk", () => ({
  sdk: { authenticateRequest: smoke.authenticateBrowserSession },
}));

vi.mock("./oauth/clientRegistry", () => {
  const client = {
    clientId: "spyreels-network-smoke",
    clientName: "SpyReels Network Smoke Client",
    source: "chatgpt" as const,
    redirectUris: ["https://client.example/network-callback"],
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
  capturePostHogEvent: smoke.capturePostHogEvent,
  posthogDistinctIdForUser: (userId: number) => String(userId),
}));

vi.mock("../stripe/stripe-service", () => ({
  checkUsageLimit: vi.fn(async () => ({ allowed: true, used: 0, limit: 20 })),
  incrementUsage: vi.fn(async () => undefined),
  decrementUsage: vi.fn(async () => undefined),
  getUserSubscription: smoke.getUserSubscription,
  getMonthlyUsage: smoke.getMonthlyUsage,
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
    resolveInstagramIdentity: vi.fn(),
    searchReelsByHandle: vi.fn(),
  };
});

process.env.NODE_ENV = "test";
process.env.SPYREELS_AI_GATEWAY_ENABLED = "true";
process.env.SPYREELS_AI_OAUTH_ISSUER = "https://spyreels.test";
process.env.SPYREELS_AI_OAUTH_JWT_SECRET = "n".repeat(64);
process.env.SPYREELS_SITE_URL = "https://spyreels.test";

function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

async function createNetworkApp() {
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

describe("SpyReels AI Gateway real-socket network smoke", () => {
  beforeEach(() => {
    smoke.authCodes.length = 0;
    smoke.refreshTokens.length = 0;
    smoke.capturePostHogEvent.mockReset();
    smoke.capturePostHogEvent.mockResolvedValue(undefined);
    smoke.authenticateBrowserSession.mockReset();
    smoke.authenticateBrowserSession.mockResolvedValue(smoke.user);
    smoke.getUserSubscription.mockReset();
    smoke.getUserSubscription.mockResolvedValue({
      plan: "starter",
      status: "active",
      billingInterval: "monthly",
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
    });
    smoke.getMonthlyUsage.mockReset();
    smoke.getMonthlyUsage.mockResolvedValue({
      scrapeCount: 0,
      searchCount: 2,
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
  });

  it("connects over a real TCP socket through OAuth, MCP, and REST", async () => {
    const app = await createNetworkApp();
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", () => resolve());
      server.once("error", reject);
    });

    try {
      const address = server.address() as AddressInfo;
      const origin = `http://127.0.0.1:${address.port}`;
      const verifier = "network-smoke-verifier-0123456789-ABCDEFGHIJKLMNOPQRSTUVWXYZ";
      const authorize = new URLSearchParams({
        response_type: "code",
        client_id: "spyreels-network-smoke",
        redirect_uri: "https://client.example/network-callback",
        state: "network-smoke-state",
        scope: "spyreels:read",
        code_challenge: pkceChallenge(verifier),
        code_challenge_method: "S256",
        resource: "https://spyreels.test/api/ai/mcp",
      });

      const consent = await fetch(`${origin}/api/ai/oauth/authorize?${authorize}`);
      expect(consent.status).toBe(200);
      expect(await consent.text()).toContain("Connect SpyReels");

      const approvalBody = new URLSearchParams(authorize);
      approvalBody.set("decision", "approve");
      const approval = await fetch(`${origin}/api/ai/oauth/authorize`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://spyreels.test",
        },
        body: approvalBody,
      });
      expect(approval.status).toBe(302);
      const callback = new URL(approval.headers.get("location") || "");
      const code = callback.searchParams.get("code");
      expect(code).toBeTruthy();
      expect(callback.searchParams.get("state")).toBe("network-smoke-state");

      const tokenBody = new URLSearchParams({
        grant_type: "authorization_code",
        client_id: "spyreels-network-smoke",
        code: code || "",
        redirect_uri: "https://client.example/network-callback",
        code_verifier: verifier,
        resource: "https://spyreels.test/api/ai/mcp",
      });
      const tokenResponse = await fetch(`${origin}/api/ai/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: "https://chatgpt.com",
        },
        body: tokenBody,
      });
      expect(tokenResponse.status).toBe(200);
      const tokenJson = (await tokenResponse.json()) as Record<string, any>;
      const accessToken = String(tokenJson.access_token || "");
      expect(accessToken).toBeTruthy();

      const mcpResponse = await fetch(`${origin}/api/ai/mcp`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          "MCP-Protocol-Version": "2026-07-28",
          "Mcp-Method": "tools/call",
          "Mcp-Name": "get_usage",
          Origin: "https://chatgpt.com",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "network-mcp-1",
          method: "tools/call",
          params: { name: "get_usage", arguments: {} },
        }),
      });
      expect(mcpResponse.status).toBe(200);
      expect(mcpResponse.headers.get("mcp-protocol-version")).toBe("2026-07-28");
      const mcpJson = (await mcpResponse.json()) as any;
      expect(mcpJson.result.isError).toBe(false);
      expect(mcpJson.result.structuredContent.plan.id).toBe("starter");

      const restResponse = await fetch(`${origin}/api/ai/v1/tools/get_usage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          Origin: "https://claude.ai",
        },
        body: "{}",
      });
      expect(restResponse.status).toBe(200);
      const restJson = (await restResponse.json()) as any;
      expect(restJson.ok).toBe(true);
      expect(restJson.data.plan.id).toBe("starter");
      expect(restJson.meta.source).toBe("chatgpt");

      await new Promise((resolve) => setImmediate(resolve));
      const executions = smoke.capturePostHogEvent.mock.calls
        .map(([payload]) => payload)
        .filter((payload) => payload?.event === "ai_gateway_tool_executed");
      expect(executions).toHaveLength(2);
      expect(executions.every((payload) => payload.properties?.ai_source === "chatgpt")).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  });
});
