export const AI_GATEWAY_DEFAULT_ISSUER = "https://spyreels.ai";
export const AI_GATEWAY_MCP_PATH = "/api/ai/mcp";
export const AI_GATEWAY_AUTHORIZATION_PATH = "/api/ai/oauth/authorize";
export const AI_GATEWAY_TOKEN_PATH = "/api/ai/oauth/token";
export const AI_GATEWAY_REVOCATION_PATH = "/api/ai/oauth/revoke";
export const AI_GATEWAY_PROTECTED_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource";
export const AI_GATEWAY_AUTHORIZATION_SERVER_METADATA_PATH =
  "/.well-known/oauth-authorization-server";

export const AI_GATEWAY_SCOPES = ["spyreels:read"] as const;
export type AiGatewayScope = (typeof AI_GATEWAY_SCOPES)[number];

export const AI_ACCESS_TOKEN_TTL_SECONDS = 60 * 60;
export const AI_AUTHORIZATION_CODE_TTL_MS = 5 * 60 * 1000;
export const AI_REFRESH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000;

function normalizeOrigin(value: string): string {
  const url = new URL(value);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("SPYREELS_AI_OAUTH_ISSUER must be an origin without a path, query, or hash.");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new Error("SPYREELS_AI_OAUTH_ISSUER must use HTTPS in production.");
  }
  return url.origin;
}

export function isAiGatewayEnabled(): boolean {
  return process.env.SPYREELS_AI_GATEWAY_ENABLED?.trim().toLowerCase() === "true";
}

export function aiGatewayIssuer(): string {
  return normalizeOrigin(
    process.env.SPYREELS_AI_OAUTH_ISSUER?.trim() || AI_GATEWAY_DEFAULT_ISSUER
  );
}

export function aiGatewayResource(): string {
  return `${aiGatewayIssuer()}${AI_GATEWAY_MCP_PATH}`;
}

export function aiGatewayJwtSecret(): Uint8Array {
  const raw = process.env.SPYREELS_AI_OAUTH_JWT_SECRET?.trim();
  if (!raw) {
    throw new Error(
      "SPYREELS_AI_OAUTH_JWT_SECRET is required when the SpyReels AI Gateway is enabled."
    );
  }
  if (raw.length < 32) {
    throw new Error("SPYREELS_AI_OAUTH_JWT_SECRET must be at least 32 characters.");
  }
  return new TextEncoder().encode(raw);
}

export function protectedResourceMetadataUrl(): string {
  return `${aiGatewayIssuer()}${AI_GATEWAY_PROTECTED_RESOURCE_METADATA_PATH}`;
}

export function authorizationServerMetadataUrl(): string {
  return `${aiGatewayIssuer()}${AI_GATEWAY_AUTHORIZATION_SERVER_METADATA_PATH}`;
}

export function authorizationEndpoint(): string {
  return `${aiGatewayIssuer()}${AI_GATEWAY_AUTHORIZATION_PATH}`;
}

export function tokenEndpoint(): string {
  return `${aiGatewayIssuer()}${AI_GATEWAY_TOKEN_PATH}`;
}

export function revocationEndpoint(): string {
  return `${aiGatewayIssuer()}${AI_GATEWAY_REVOCATION_PATH}`;
}

/**
 * Fail fast during boot when the feature flag is on. This avoids exposing
 * half-configured OAuth discovery endpoints in production.
 */
export function assertAiGatewayConfiguration(): void {
  if (!isAiGatewayEnabled()) return;
  void aiGatewayIssuer();
  void aiGatewayJwtSecret();
}
