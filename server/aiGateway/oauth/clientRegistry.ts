import { lookup } from "node:dns/promises";
import net from "node:net";
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { aiOAuthClients } from "../../../drizzle/aiOAuthSchema";
import { normalizeAiGatewaySource } from "../context";
import type { AiGatewaySource } from "../types";
import { AI_GATEWAY_SCOPES } from "./config";
import { constantTimeEqual, hashClientSecret } from "./crypto";

export interface ResolvedAiOAuthClient {
  clientId: string;
  clientName: string;
  source: AiGatewaySource;
  redirectUris: string[];
  allowedScopes: string[];
  isPublic: boolean;
  clientSecretHash: string | null;
  registrationKind: "database" | "cimd";
}

type CimdDocument = {
  client_id?: unknown;
  client_name?: unknown;
  redirect_uris?: unknown;
  scope?: unknown;
  token_endpoint_auth_method?: unknown;
  response_types?: unknown;
  grant_types?: unknown;
};

const CIMD_TIMEOUT_MS = 4_000;

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

function isPrivateIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isPrivateIp(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) return isPrivateIpv4(address);
  if (version === 6) return isPrivateIpv6(address);
  return true;
}

async function assertPublicHttpsUrl(raw: string): Promise<URL> {
  const url = new URL(raw);
  if (url.protocol !== "https:") {
    throw new Error("OAuth client metadata URL must use HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("OAuth client metadata URL cannot contain credentials.");
  }
  if (url.port && url.port !== "443") {
    throw new Error("OAuth client metadata URL must use the standard HTTPS port.");
  }
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new Error("OAuth client metadata host is not allowed.");
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateIp(address))) {
    throw new Error("OAuth client metadata host resolves to a non-public address.");
  }
  return url;
}

function sourceForTrustedHost(hostname: string): AiGatewaySource {
  const host = hostname.toLowerCase();
  const matches = (domain: string) => host === domain || host.endsWith(`.${domain}`);

  if (matches("openai.com") || matches("chatgpt.com")) return "chatgpt";
  if (matches("anthropic.com") || matches("claude.ai")) return "claude";
  if (matches("microsoft.com") || matches("github.com")) return "copilot";
  if (matches("google.com") || matches("googleapis.com")) return "gemini";
  if (matches("perplexity.ai")) return "perplexity";
  if (matches("cursor.com")) return "cursor";
  return "unknown";
}

function requestedScopesFromMetadata(document: CimdDocument): string[] {
  if (typeof document.scope !== "string") return [...AI_GATEWAY_SCOPES];
  const requested = document.scope
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const supported = new Set<string>(AI_GATEWAY_SCOPES);
  const intersection = requested.filter((scope) => supported.has(scope));
  return intersection.length > 0 ? intersection : [...AI_GATEWAY_SCOPES];
}

async function fetchCimdClient(clientId: string): Promise<ResolvedAiOAuthClient> {
  const url = await assertPublicHttpsUrl(clientId);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CIMD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: "GET",
      redirect: "error",
      headers: {
        Accept: "application/json",
        "User-Agent": "SpyReels-OAuth-CIMD/1.0",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throw new Error(`OAuth client metadata request failed with HTTP ${response.status}.`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("OAuth client metadata must be JSON.");
  }

  const document = (await response.json()) as CimdDocument;
  if (
    typeof document.client_id === "string" &&
    document.client_id.trim() !== clientId
  ) {
    throw new Error("OAuth client metadata client_id does not match the requested client.");
  }

  const redirectUris = normalizeStringArray(document.redirect_uris);
  if (redirectUris.length === 0 || redirectUris.length > 20) {
    throw new Error("OAuth client metadata must declare redirect_uris.");
  }
  for (const redirectUri of redirectUris) {
    const parsed = new URL(redirectUri);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      throw new Error("OAuth client redirect URI uses an unsupported scheme.");
    }
    if (
      parsed.protocol === "http:" &&
      parsed.hostname !== "127.0.0.1" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "[::1]"
    ) {
      throw new Error("HTTP OAuth redirect URIs are allowed only for loopback clients.");
    }
  }

  if (
    document.token_endpoint_auth_method != null &&
    document.token_endpoint_auth_method !== "none"
  ) {
    throw new Error("CIMD clients must use token_endpoint_auth_method=none.");
  }

  return {
    clientId,
    clientName:
      typeof document.client_name === "string" && document.client_name.trim()
        ? document.client_name.trim().slice(0, 255)
        : url.hostname,
    source: sourceForTrustedHost(url.hostname),
    redirectUris,
    allowedScopes: requestedScopesFromMetadata(document),
    isPublic: true,
    clientSecretHash: null,
    registrationKind: "cimd",
  };
}

export async function resolveAiOAuthClient(
  clientId: string
): Promise<ResolvedAiOAuthClient | null> {
  const normalizedClientId = clientId.trim();
  if (!normalizedClientId || normalizedClientId.length > 1024) return null;

  const db = await getDb();
  if (db) {
    const rows = await db
      .select()
      .from(aiOAuthClients)
      .where(eq(aiOAuthClients.clientId, normalizedClientId))
      .limit(1);
    const row = rows[0];
    if (row) {
      if (!row.isActive) return null;
      const redirectUris = normalizeStringArray(row.redirectUris);
      const storedScopes = normalizeStringArray(row.allowedScopes);
      return {
        clientId: row.clientId,
        clientName: row.clientName,
        source: normalizeAiGatewaySource(row.source),
        redirectUris,
        allowedScopes:
          storedScopes.length > 0 ? storedScopes : [...AI_GATEWAY_SCOPES],
        isPublic: Boolean(row.isPublic),
        clientSecretHash: row.clientSecretHash ?? null,
        registrationKind: "database",
      };
    }
  }

  if (!normalizedClientId.startsWith("https://")) return null;
  try {
    return await fetchCimdClient(normalizedClientId);
  } catch (error) {
    console.warn(
      "[ai-gateway] CIMD client resolution failed",
      error instanceof Error ? error.message : String(error)
    );
    return null;
  }
}

export function validateAiOAuthRedirectUri(
  client: ResolvedAiOAuthClient,
  redirectUri: string
): boolean {
  return client.redirectUris.includes(redirectUri);
}

export function normalizeRequestedScopes(
  client: ResolvedAiOAuthClient,
  rawScope: string | undefined
): string[] | null {
  const requested = (rawScope || AI_GATEWAY_SCOPES.join(" "))
    .split(/\s+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const unique = [...new Set(requested)];
  if (unique.length === 0) return null;
  const allowed = new Set(client.allowedScopes);
  if (unique.some((scope) => !allowed.has(scope))) return null;
  return unique;
}

export function validateAiOAuthClientSecret(
  client: ResolvedAiOAuthClient,
  clientSecret: string | undefined
): boolean {
  if (client.isPublic) return !clientSecret || clientSecret.length >= 0;
  if (!client.clientSecretHash || !clientSecret) return false;
  return constantTimeEqual(hashClientSecret(clientSecret), client.clientSecretHash);
}
