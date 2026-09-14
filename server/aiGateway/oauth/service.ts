import { and, eq, gt, isNull } from "drizzle-orm";
import { getDb, getUserById } from "../../db";
import {
  aiOAuthAuthorizationCodes,
  aiOAuthRefreshTokens,
} from "../../../drizzle/aiOAuthSchema";
import type { AiGatewaySource } from "../types";
import { issueAiGatewayAccessToken } from "./accessToken";
import {
  AI_AUTHORIZATION_CODE_TTL_MS,
  AI_REFRESH_TOKEN_TTL_MS,
} from "./config";
import { randomOpaqueToken, sha256Hex, verifyPkceS256 } from "./crypto";
import { AiOAuthError } from "./errors";

export interface AiOAuthTokenSet {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  scope: string;
}

function scopeString(scopes: string[]): string {
  return [...new Set(scopes)].join(" ");
}

function parseStoredScope(scope: string): string[] {
  return scope.split(/\s+/).map((value) => value.trim()).filter(Boolean);
}

function affectedRows(result: unknown): number {
  if (Array.isArray(result) && result[0] && typeof result[0] === "object") {
    const value = (result[0] as { affectedRows?: unknown }).affectedRows;
    return typeof value === "number" ? value : 0;
  }
  return 0;
}

async function requireDb() {
  const db = await getDb();
  if (!db) {
    throw new AiOAuthError("server_error", "OAuth storage is temporarily unavailable.", 503);
  }
  return db;
}

export async function issueAiOAuthAuthorizationCode(input: {
  clientId: string;
  userId: number;
  redirectUri: string;
  scopes: string[];
  codeChallenge: string;
}): Promise<string> {
  const db = await requireDb();
  const rawCode = randomOpaqueToken(32);
  await db.insert(aiOAuthAuthorizationCodes).values({
    codeHash: sha256Hex(rawCode),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    scope: scopeString(input.scopes),
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: "S256",
    expiresAt: new Date(Date.now() + AI_AUTHORIZATION_CODE_TTL_MS),
  });
  return rawCode;
}

async function createRefreshToken(input: {
  clientId: string;
  userId: number;
  source: AiGatewaySource;
  scopes: string[];
  familyId?: string;
}): Promise<{ raw: string; hash: string; familyId: string }> {
  const db = await requireDb();
  const raw = randomOpaqueToken(48);
  const hash = sha256Hex(raw);
  const familyId = input.familyId || randomOpaqueToken(24);
  await db.insert(aiOAuthRefreshTokens).values({
    tokenHash: hash,
    familyId,
    clientId: input.clientId,
    userId: input.userId,
    source: input.source,
    scope: scopeString(input.scopes),
    expiresAt: new Date(Date.now() + AI_REFRESH_TOKEN_TTL_MS),
  });
  return { raw, hash, familyId };
}

async function tokenSet(input: {
  userId: number;
  clientId: string;
  source: AiGatewaySource;
  scopes: string[];
  familyId?: string;
}): Promise<AiOAuthTokenSet & { refreshHash: string; familyId: string }> {
  const access = await issueAiGatewayAccessToken(input);
  const refresh = await createRefreshToken(input);
  return {
    accessToken: access.accessToken,
    refreshToken: refresh.raw,
    tokenType: "Bearer",
    expiresIn: access.expiresIn,
    scope: scopeString(input.scopes),
    refreshHash: refresh.hash,
    familyId: refresh.familyId,
  };
}

export async function exchangeAiOAuthAuthorizationCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
  source: AiGatewaySource;
}): Promise<AiOAuthTokenSet> {
  const db = await requireDb();
  const now = new Date();
  const codeHash = sha256Hex(input.code);
  const rows = await db
    .select()
    .from(aiOAuthAuthorizationCodes)
    .where(
      and(
        eq(aiOAuthAuthorizationCodes.codeHash, codeHash),
        eq(aiOAuthAuthorizationCodes.clientId, input.clientId),
        isNull(aiOAuthAuthorizationCodes.consumedAt),
        gt(aiOAuthAuthorizationCodes.expiresAt, now)
      )
    )
    .limit(1);
  const grant = rows[0];

  if (!grant || grant.redirectUri !== input.redirectUri) {
    throw new AiOAuthError("invalid_grant", "Authorization code is invalid or expired.");
  }
  if (grant.codeChallengeMethod !== "S256") {
    throw new AiOAuthError("invalid_grant", "Authorization code has an unsupported PKCE method.");
  }
  if (!verifyPkceS256(input.codeVerifier, grant.codeChallenge)) {
    throw new AiOAuthError("invalid_grant", "PKCE verification failed.");
  }

  const consumed = await db
    .update(aiOAuthAuthorizationCodes)
    .set({ consumedAt: now })
    .where(
      and(
        eq(aiOAuthAuthorizationCodes.id, grant.id),
        isNull(aiOAuthAuthorizationCodes.consumedAt),
        gt(aiOAuthAuthorizationCodes.expiresAt, now)
      )
    );
  if (affectedRows(consumed) !== 1) {
    throw new AiOAuthError("invalid_grant", "Authorization code was already used.");
  }

  const user = await getUserById(grant.userId);
  if (!user) {
    throw new AiOAuthError("invalid_grant", "Authorization grant is no longer valid.");
  }

  const created = await tokenSet({
    userId: grant.userId,
    clientId: input.clientId,
    source: input.source,
    scopes: parseStoredScope(grant.scope),
  });
  const { refreshHash: _refreshHash, familyId: _familyId, ...publicSet } = created;
  return publicSet;
}

async function revokeRefreshFamily(familyId: string): Promise<void> {
  const db = await requireDb();
  await db
    .update(aiOAuthRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(aiOAuthRefreshTokens.familyId, familyId), isNull(aiOAuthRefreshTokens.revokedAt)));
}

export async function refreshAiOAuthTokens(input: {
  refreshToken: string;
  clientId: string;
}): Promise<AiOAuthTokenSet> {
  const db = await requireDb();
  const now = new Date();
  const tokenHash = sha256Hex(input.refreshToken);
  const rows = await db
    .select()
    .from(aiOAuthRefreshTokens)
    .where(eq(aiOAuthRefreshTokens.tokenHash, tokenHash))
    .limit(1);
  const existing = rows[0];

  if (!existing || existing.clientId !== input.clientId) {
    throw new AiOAuthError("invalid_grant", "Refresh token is invalid.");
  }

  if (existing.revokedAt) {
    await revokeRefreshFamily(existing.familyId);
    throw new AiOAuthError(
      "invalid_grant",
      "Refresh token reuse was detected. Reconnect your SpyReels account."
    );
  }
  if (existing.expiresAt <= now) {
    await revokeRefreshFamily(existing.familyId);
    throw new AiOAuthError("invalid_grant", "Refresh token has expired.");
  }

  const user = await getUserById(existing.userId);
  if (!user) {
    await revokeRefreshFamily(existing.familyId);
    throw new AiOAuthError("invalid_grant", "Refresh token is no longer valid.");
  }

  const scopes = parseStoredScope(existing.scope);
  const access = await issueAiGatewayAccessToken({
    userId: existing.userId,
    clientId: existing.clientId,
    source: existing.source,
    scopes,
  });
  const next = await createRefreshToken({
    userId: existing.userId,
    clientId: existing.clientId,
    source: existing.source,
    scopes,
    familyId: existing.familyId,
  });

  const rotated = await db
    .update(aiOAuthRefreshTokens)
    .set({
      revokedAt: now,
      replacedByHash: next.hash,
      lastUsedAt: now,
    })
    .where(
      and(
        eq(aiOAuthRefreshTokens.id, existing.id),
        isNull(aiOAuthRefreshTokens.revokedAt)
      )
    );

  if (affectedRows(rotated) !== 1) {
    await revokeRefreshFamily(existing.familyId);
    throw new AiOAuthError(
      "invalid_grant",
      "Refresh token reuse was detected. Reconnect your SpyReels account."
    );
  }

  return {
    accessToken: access.accessToken,
    refreshToken: next.raw,
    tokenType: "Bearer",
    expiresIn: access.expiresIn,
    scope: scopeString(scopes),
  };
}

export async function revokeAiOAuthRefreshToken(input: {
  token: string;
  clientId: string;
}): Promise<void> {
  const db = await requireDb();
  const hash = sha256Hex(input.token);
  const rows = await db
    .select({
      familyId: aiOAuthRefreshTokens.familyId,
      clientId: aiOAuthRefreshTokens.clientId,
    })
    .from(aiOAuthRefreshTokens)
    .where(eq(aiOAuthRefreshTokens.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row || row.clientId !== input.clientId) return;
  await revokeRefreshFamily(row.familyId);
}
