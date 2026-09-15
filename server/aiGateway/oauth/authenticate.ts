import type { Request, Response } from "express";
import { getUserById } from "../../db";
import { createAiGatewayContext } from "../context";
import type { AiGatewayContext } from "../types";
import {
  verifyAiGatewayAccessToken,
  type AiGatewayAccessTokenIdentity,
} from "./accessToken";
import { protectedResourceMetadataUrl } from "./config";

export class AiGatewayBearerAuthError extends Error {
  readonly requiredScope?: string;

  constructor(message: string, requiredScope?: string) {
    super(message);
    this.name = "AiGatewayBearerAuthError";
    this.requiredScope = requiredScope;
  }
}

function bearerFromRequest(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

export async function authenticateAiGatewayRequest(
  req: Request,
  requiredScopes: string[] = []
): Promise<{
  context: AiGatewayContext;
  identity: AiGatewayAccessTokenIdentity;
}> {
  const token = bearerFromRequest(req);
  if (!token) {
    throw new AiGatewayBearerAuthError("A SpyReels connection is required.");
  }

  let identity: AiGatewayAccessTokenIdentity;
  try {
    identity = await verifyAiGatewayAccessToken(token);
  } catch {
    throw new AiGatewayBearerAuthError("The SpyReels access token is invalid or expired.");
  }

  for (const scope of requiredScopes) {
    if (!identity.scopes.includes(scope)) {
      throw new AiGatewayBearerAuthError(
        `The SpyReels connection is missing the required scope: ${scope}`,
        scope
      );
    }
  }

  const user = await getUserById(identity.userId);
  if (!user) {
    throw new AiGatewayBearerAuthError("The connected SpyReels account no longer exists.");
  }

  return {
    identity,
    context: createAiGatewayContext({
      requestId:
        typeof req.headers["x-request-id"] === "string"
          ? req.headers["x-request-id"]
          : undefined,
      source: identity.source,
      clientName: identity.clientId,
      actor: {
        userId: user.id,
        openId: user.openId,
        email: user.email,
        role: user.role,
      },
    }),
  };
}

export function sendAiGatewayBearerChallenge(
  res: Response,
  error?: AiGatewayBearerAuthError
): void {
  const params = [
    `resource_metadata="${protectedResourceMetadataUrl()}"`,
  ];
  if (error?.requiredScope) {
    params.push(`scope="${error.requiredScope}"`);
  }
  res.setHeader("WWW-Authenticate", `Bearer ${params.join(", ")}`);
  res.status(401).json({
    error: "unauthorized",
    message: error?.message || "Connect your SpyReels account to continue.",
  });
}
