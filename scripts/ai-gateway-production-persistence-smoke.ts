import { randomBytes, randomUUID } from "node:crypto";
import type { Server } from "node:http";
import express from "express";
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL?.trim();
const target = process.env.SPYREELS_DB_GATE_TARGET?.trim();
const expectedHostToken = process.env.SPYREELS_DB_GATE_EXPECT_HOST?.trim();
const productionConfirm = process.env.SPYREELS_AI_GATEWAY_PROD_SMOKE_CONFIRM?.trim();

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for the AI Gateway production persistence smoke.");
}
if (target !== "production-mysql") {
  throw new Error("Refusing to run: SPYREELS_DB_GATE_TARGET must equal production-mysql.");
}
if (productionConfirm !== "YES_PRODUCTION_SMOKE") {
  throw new Error(
    "Refusing to run: SPYREELS_AI_GATEWAY_PROD_SMOKE_CONFIRM must equal YES_PRODUCTION_SMOKE."
  );
}
if (!expectedHostToken) {
  throw new Error("SPYREELS_DB_GATE_EXPECT_HOST is required.");
}

const parsedDatabaseUrl = new URL(databaseUrl);
if (!parsedDatabaseUrl.hostname.includes(expectedHostToken)) {
  throw new Error(
    `Refusing to run: database host does not match the expected production host token (${expectedHostToken}).`
  );
}

// The smoke gateway exists only inside this one-shot process. It is never
// exposed publicly and uses an ephemeral signing/session secret.
process.env.NODE_ENV = "production";
process.env.SPYREELS_AI_GATEWAY_ENABLED = "true";
process.env.SPYREELS_AI_OAUTH_ISSUER = "https://spyreels.ai";
process.env.SPYREELS_SITE_URL = "https://spyreels.ai";
process.env.OAUTH_SERVER_URL = "https://spyreels.ai";
process.env.SPYREELS_AI_OAUTH_JWT_SECRET = randomBytes(48).toString("base64url");
process.env.JWT_SECRET = randomBytes(48).toString("base64url");
process.env.VITE_APP_ID = "spyreels-ai-gateway-production-smoke";
// stripe-service is imported by get_usage. This placeholder prevents module
// initialization from requiring the real billing secret; this smoke never calls Stripe.
process.env.STRIPE_SECRET_KEY = "sk_test_ai_gateway_production_smoke_no_network";
// Never pollute production analytics with smoke traffic.
delete process.env.POSTHOG_API_KEY;
delete process.env.VITE_PUBLIC_POSTHOG_TOKEN;

const connection = await mysql.createConnection({ uri: databaseUrl });
const lockName = "spyreels_ai_gateway_prod_persistence_smoke";
let lockAcquired = false;
let server: Server | null = null;
let userId: number | null = null;

const runId = randomUUID().replace(/-/g, "").slice(0, 16);
const openId = `ai-gw-smoke-${runId}`;
const clientId = `spyreels-prod-smoke-${runId}`;
const redirectUri = "https://client.example/spyreels-prod-smoke";
const usageMonth = new Date().toISOString().slice(0, 7);
const source = "chatgpt";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function jsonBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON response from ${response.url}, got: ${text.slice(0, 300)}`);
  }
}

function formBody(values: Record<string, string>): URLSearchParams {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) body.set(key, value);
  return body;
}

async function cleanup(): Promise<void> {
  if (server) {
    await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = null;
  }

  // Delete in dependency order. The OAuth client FK also cascades grants/tokens,
  // but explicit deletes make cleanup independently auditable.
  await connection.query("DELETE FROM ai_oauth_refresh_tokens WHERE clientId = ?", [clientId]);
  await connection.query("DELETE FROM ai_oauth_authorization_codes WHERE clientId = ?", [clientId]);
  await connection.query("DELETE FROM ai_oauth_clients WHERE clientId = ?", [clientId]);

  if (userId != null) {
    await connection.query("DELETE FROM monthly_usage WHERE userId = ?", [userId]);
    await connection.query("DELETE FROM subscriptions WHERE userId = ?", [userId]);
    await connection.query(
      "DELETE FROM users WHERE id = ? AND openId = ? AND isTestAccount = 1",
      [userId, openId]
    );
  } else {
    await connection.query("DELETE FROM users WHERE openId = ? AND isTestAccount = 1", [openId]);
  }

  const [clientRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM ai_oauth_clients WHERE clientId = ?",
    [clientId]
  );
  const [userRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM users WHERE openId = ?",
    [openId]
  );
  assert(Number(clientRows[0]?.count || 0) === 0, "Temporary OAuth client cleanup failed.");
  assert(Number(userRows[0]?.count || 0) === 0, "Temporary smoke user cleanup failed.");

  if (lockAcquired) {
    try {
      await connection.query("SELECT RELEASE_LOCK(?) AS released", [lockName]);
    } finally {
      lockAcquired = false;
    }
  }
}

try {
  const [dbRows] = await connection.query<mysql.RowDataPacket[]>("SELECT DATABASE() AS db");
  const dbName = String(dbRows[0]?.db || "");
  assert(dbName, "Could not resolve current database name.");

  const [requiredTables] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN
       ('users','monthly_usage','ai_oauth_clients','ai_oauth_authorization_codes','ai_oauth_refresh_tokens')`,
    [dbName]
  );
  assert(requiredTables.length === 5, "Required production persistence tables are missing.");

  const [lockRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT GET_LOCK(?, 10) AS acquired",
    [lockName]
  );
  lockAcquired = Number(lockRows[0]?.acquired || 0) === 1;
  assert(lockAcquired, "Could not acquire production persistence smoke lock.");

  const [userCountRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM users"
  );
  const usersBefore = Number(userCountRows[0]?.count || 0);
  console.log(`[ai-gateway-prod-smoke] PRECHECK db='${dbName}' users=${usersBefore}`);

  const [insertUser] = await connection.execute<mysql.ResultSetHeader>(
    `INSERT INTO users
      (openId, name, email, loginMethod, role, isTestAccount)
     VALUES (?, ?, ?, ?, 'user', 1)`,
    [
      openId,
      "AI Gateway Production Smoke",
      `ai-gateway-smoke-${runId}@example.invalid`,
      "ai-gateway-smoke",
    ]
  );
  userId = insertUser.insertId;
  assert(userId > 0, "Temporary smoke user was not created.");

  // No subscription row is inserted: production account code must correctly
  // resolve a user without a paid subscription as the Free plan.
  await connection.execute(
    `INSERT INTO monthly_usage (userId, usageMonth, searchCount)
     VALUES (?, ?, 999999)`,
    [userId, usageMonth]
  );

  await connection.execute(
    `INSERT INTO ai_oauth_clients
      (clientId, clientSecretHash, clientName, source, redirectUris, allowedScopes, isPublic, isActive)
     VALUES (?, NULL, ?, ?, ?, ?, 1, 1)`,
    [
      clientId,
      "SpyReels AI Gateway Production Smoke",
      source,
      JSON.stringify([redirectUri]),
      JSON.stringify(["spyreels:read"]),
    ]
  );

  const [registeredClientRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT clientId, source, isPublic, isActive
     FROM ai_oauth_clients WHERE clientId = ? LIMIT 1`,
    [clientId]
  );
  const registeredClient = registeredClientRows[0];
  assert(registeredClient?.clientId === clientId, "OAuth test client was not persisted.");
  assert(registeredClient?.source === source, "OAuth client source attribution was not persisted.");
  assert(Boolean(registeredClient?.isPublic) && Boolean(registeredClient?.isActive), "OAuth test client is not active/public.");
  console.log("[ai-gateway-prod-smoke] oauth_client PASS");

  // Dynamic imports happen only after all isolation/safety env is fixed.
  const [{ registerAiGatewayRoutes }, { csrfOriginGuard }, oauthService, oauthCrypto, stripeService] =
    await Promise.all([
      import("../server/aiGateway/routes"),
      import("../server/_core/csrf"),
      import("../server/aiGateway/oauth/service"),
      import("../server/aiGateway/oauth/crypto"),
      import("../server/stripe/stripe-service"),
    ]);

  const app = express();
  app.use(csrfOriginGuard);
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  registerAiGatewayRoutes(app);

  server = await new Promise<Server>((resolve, reject) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
    listener.on("error", reject);
  });
  const address = server.address();
  assert(address && typeof address === "object", "Could not resolve local smoke listener address.");
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const verifier = randomBytes(48).toString("base64url");
  const wrongVerifier = randomBytes(48).toString("base64url");
  const challenge = oauthCrypto.pkceS256Challenge(verifier);

  // The browser consent UI/path is already covered by the isolated E2E harness.
  // Here we call the same production authorization-code issuer so the grant is
  // persisted in the real production tables without needing a real customer session.
  const authorizationCode = await oauthService.issueAiOAuthAuthorizationCode({
    clientId,
    userId,
    redirectUri,
    scopes: ["spyreels:read"],
    codeChallenge: challenge,
  });
  const authorizationCodeHash = oauthCrypto.sha256Hex(authorizationCode);

  const [grantRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT codeHash, consumedAt FROM ai_oauth_authorization_codes
     WHERE clientId = ? AND userId = ? ORDER BY id DESC LIMIT 1`,
    [clientId, userId]
  );
  assert(grantRows[0]?.codeHash === authorizationCodeHash, "Authorization code hash was not persisted correctly.");
  assert(grantRows[0]?.codeHash !== authorizationCode, "Raw authorization code was persisted.");
  assert(grantRows[0]?.consumedAt == null, "Authorization code was consumed before token exchange.");

  const wrongPkceResponse = await fetch(`${baseUrl}/api/ai/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      grant_type: "authorization_code",
      client_id: clientId,
      code: authorizationCode,
      redirect_uri: redirectUri,
      code_verifier: wrongVerifier,
      resource: "https://spyreels.ai/api/ai/mcp",
    }),
  });
  const wrongPkceJson = await jsonBody(wrongPkceResponse);
  assert(wrongPkceResponse.status === 400, `Wrong PKCE verifier returned HTTP ${wrongPkceResponse.status}.`);
  assert(wrongPkceJson?.error === "invalid_grant", "Wrong PKCE verifier did not return invalid_grant.");

  const [afterWrongPkceRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT consumedAt FROM ai_oauth_authorization_codes
     WHERE codeHash = ? LIMIT 1`,
    [authorizationCodeHash]
  );
  assert(afterWrongPkceRows[0]?.consumedAt == null, "Wrong PKCE verifier burned the authorization code.");
  console.log("[ai-gateway-prod-smoke] pkce_wrong_verifier PASS");

  const tokenResponse = await fetch(`${baseUrl}/api/ai/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      grant_type: "authorization_code",
      client_id: clientId,
      code: authorizationCode,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      resource: "https://spyreels.ai/api/ai/mcp",
    }),
  });
  const tokenJson = await jsonBody(tokenResponse);
  assert(tokenResponse.status === 200, `Authorization-code exchange returned HTTP ${tokenResponse.status}.`);
  assert(typeof tokenJson?.access_token === "string" && tokenJson.access_token.length > 20, "Access token missing.");
  assert(typeof tokenJson?.refresh_token === "string" && tokenJson.refresh_token.length > 20, "Refresh token missing.");
  const accessToken = tokenJson.access_token as string;
  const refreshToken = tokenJson.refresh_token as string;
  const refreshHash = oauthCrypto.sha256Hex(refreshToken);

  const [consumedGrantRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT consumedAt FROM ai_oauth_authorization_codes WHERE codeHash = ? LIMIT 1",
    [authorizationCodeHash]
  );
  assert(consumedGrantRows[0]?.consumedAt != null, "Authorization code was not marked consumed.");

  const [refreshRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT tokenHash, familyId, source, revokedAt
     FROM ai_oauth_refresh_tokens WHERE tokenHash = ? LIMIT 1`,
    [refreshHash]
  );
  const originalRefresh = refreshRows[0];
  assert(originalRefresh?.tokenHash === refreshHash, "Refresh token hash was not persisted.");
  assert(originalRefresh?.tokenHash !== refreshToken, "Raw refresh token was persisted.");
  assert(originalRefresh?.source === source, "Refresh-token source attribution is incorrect.");
  assert(originalRefresh?.revokedAt == null, "New refresh token is already revoked.");
  console.log("[ai-gateway-prod-smoke] token_exchange PASS");
  console.log("[ai-gateway-prod-smoke] refresh_persistence PASS");

  const mcpResponse = await fetch(`${baseUrl}/api/ai/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2026-07-28",
      "Mcp-Method": "tools/call",
      "Mcp-Name": "get_usage",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "get_usage", arguments: {} },
    }),
  });
  const mcpJson = await jsonBody(mcpResponse);
  assert(mcpResponse.status === 200, `MCP get_usage returned HTTP ${mcpResponse.status}.`);
  assert(mcpJson?.result?.isError === false, "MCP get_usage returned an application error.");
  assert(mcpJson?.result?.structuredContent?.plan?.id === "free", "MCP did not resolve the temporary user as Free plan.");
  assert(
    Number(mcpJson?.result?.structuredContent?.usage?.searchCount) === 999999,
    "MCP did not read the seeded production usage row."
  );
  assert(mcpJson?.result?._meta?.spyreels?.source === source, "MCP source attribution is incorrect.");
  console.log("[ai-gateway-prod-smoke] mcp_get_usage PASS");

  const restResponse = await fetch(`${baseUrl}/api/ai/v1/tools/get_usage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      // Deliberately claim a different AI host. Attribution must still come from
      // the trusted OAuth client/token, never from this request Origin.
      Origin: "https://claude.ai",
    },
    body: JSON.stringify({}),
  });
  const restJson = await jsonBody(restResponse);
  assert(restResponse.status === 200, `REST get_usage returned HTTP ${restResponse.status}.`);
  assert(restJson?.ok === true, "REST get_usage did not succeed.");
  assert(restJson?.data?.plan?.id === "free", "REST did not resolve Free plan.");
  assert(Number(restJson?.data?.usage?.searchCount) === 999999, "REST did not read seeded usage.");
  assert(restJson?.meta?.source === source, "REST trusted source attribution was overridden by Origin.");
  console.log(`[ai-gateway-prod-smoke] rest_get_usage PASS source=${restJson.meta.source}`);

  // Safety interlock: prove the actual entitlement checker is already denying
  // this account BEFORE exercising find_top_content. If this fails, abort here
  // so the smoke can never reach the Instagram provider accidentally.
  const limitCheck = await stripeService.checkUsageLimit(
    userId,
    "searchCount",
    openId,
    { email: `ai-gateway-smoke-${runId}@example.invalid`, role: "user" }
  );
  assert(limitCheck.allowed === false, "Safety interlock failed: seeded test user is not over its search limit.");

  const limitedResponse = await fetch(`${baseUrl}/api/ai/v1/tools/find_top_content`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ handle: "garyvee", limit: 1, rankBy: "views" }),
  });
  const limitedJson = await jsonBody(limitedResponse);
  assert(limitedResponse.status === 429, `Plan-limit call returned HTTP ${limitedResponse.status}, expected 429.`);
  assert(limitedJson?.error?.code === "USAGE_LIMIT_REACHED", "Plan-limit tool did not return USAGE_LIMIT_REACHED.");
  console.log("[ai-gateway-prod-smoke] plan_limit PASS no_provider_call");

  const refreshResponse = await fetch(`${baseUrl}/api/ai/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
      resource: "https://spyreels.ai/api/ai/mcp",
    }),
  });
  const refreshJson = await jsonBody(refreshResponse);
  assert(refreshResponse.status === 200, `Refresh rotation returned HTTP ${refreshResponse.status}.`);
  assert(typeof refreshJson?.refresh_token === "string", "Rotated refresh token missing.");
  const rotatedRefreshToken = refreshJson.refresh_token as string;
  assert(rotatedRefreshToken !== refreshToken, "Refresh token was not rotated.");
  const rotatedHash = oauthCrypto.sha256Hex(rotatedRefreshToken);

  const [rotationRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT tokenHash, familyId, revokedAt, replacedByHash
     FROM ai_oauth_refresh_tokens
     WHERE tokenHash IN (?, ?)
     ORDER BY id ASC`,
    [refreshHash, rotatedHash]
  );
  const oldRow = rotationRows.find((row) => row.tokenHash === refreshHash);
  const newRow = rotationRows.find((row) => row.tokenHash === rotatedHash);
  assert(oldRow?.revokedAt != null, "Original refresh token was not revoked during rotation.");
  assert(oldRow?.replacedByHash === rotatedHash, "Original refresh token does not point to its replacement hash.");
  assert(newRow?.revokedAt == null, "Rotated refresh token is unexpectedly revoked.");
  assert(oldRow?.familyId === newRow?.familyId, "Refresh token family changed during rotation.");

  // Reuse of the old token must be rejected and revoke the replacement family.
  const reuseResponse = await fetch(`${baseUrl}/api/ai/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: refreshToken,
      resource: "https://spyreels.ai/api/ai/mcp",
    }),
  });
  const reuseJson = await jsonBody(reuseResponse);
  assert(reuseResponse.status === 400, `Refresh-token reuse returned HTTP ${reuseResponse.status}.`);
  assert(reuseJson?.error === "invalid_grant", "Refresh-token reuse did not return invalid_grant.");

  const [familyRows] = await connection.query<mysql.RowDataPacket[]>(
    `SELECT revokedAt FROM ai_oauth_refresh_tokens WHERE familyId = ?`,
    [oldRow.familyId]
  );
  assert(familyRows.length >= 2, "Expected refresh-token family rows were not persisted.");
  assert(familyRows.every((row) => row.revokedAt != null), "Refresh-token reuse did not revoke the full family.");
  console.log("[ai-gateway-prod-smoke] refresh_rotation PASS");

  await cleanup();
  const [usersAfterRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT COUNT(*) AS count FROM users"
  );
  const usersAfter = Number(usersAfterRows[0]?.count || 0);
  console.log(`[ai-gateway-prod-smoke] cleanup PASS testRows=0 usersBefore=${usersBefore} usersAfter=${usersAfter}`);
  console.log("[ai-gateway-prod-smoke] PASS");
} catch (error) {
  console.error(
    "[ai-gateway-prod-smoke] FAIL",
    error instanceof Error ? error.message : String(error)
  );
  throw error;
} finally {
  try {
    await cleanup();
  } finally {
    await connection.end();
  }
}
