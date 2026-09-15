import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import { normalizeAiGatewaySource } from "../context";
import type { AiGatewaySource } from "../types";
import {
  AI_ACCESS_TOKEN_TTL_SECONDS,
  aiGatewayIssuer,
  aiGatewayJwtSecret,
  aiGatewayResource,
} from "./config";

export interface AiGatewayAccessTokenIdentity {
  userId: number;
  clientId: string;
  source: AiGatewaySource;
  scopes: string[];
  jti: string;
}

export async function issueAiGatewayAccessToken(input: {
  userId: number;
  clientId: string;
  source: AiGatewaySource | string;
  scopes: string[];
}): Promise<{ accessToken: string; expiresIn: number }> {
  const now = Math.floor(Date.now() / 1000);
  const jti = randomUUID();
  const source = normalizeAiGatewaySource(input.source);
  const scope = [...new Set(input.scopes)].join(" ");

  const accessToken = await new SignJWT({
    client_id: input.clientId,
    source,
    scope,
  })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setIssuer(aiGatewayIssuer())
    .setAudience(aiGatewayResource())
    .setSubject(String(input.userId))
    .setJti(jti)
    .setIssuedAt(now)
    .setExpirationTime(now + AI_ACCESS_TOKEN_TTL_SECONDS)
    .sign(aiGatewayJwtSecret());

  return { accessToken, expiresIn: AI_ACCESS_TOKEN_TTL_SECONDS };
}

export async function verifyAiGatewayAccessToken(
  token: string
): Promise<AiGatewayAccessTokenIdentity> {
  const { payload, protectedHeader } = await jwtVerify(
    token,
    aiGatewayJwtSecret(),
    {
      issuer: aiGatewayIssuer(),
      audience: aiGatewayResource(),
      algorithms: ["HS256"],
    }
  );

  if (protectedHeader.typ !== "at+jwt") {
    throw new Error("Invalid access token type.");
  }

  const userId = Number(payload.sub);
  const clientId =
    typeof payload.client_id === "string" ? payload.client_id.trim() : "";
  const source = normalizeAiGatewaySource(payload.source);
  const scopes =
    typeof payload.scope === "string"
      ? payload.scope.split(/\s+/).map((value) => value.trim()).filter(Boolean)
      : [];

  if (!Number.isSafeInteger(userId) || userId <= 0 || !clientId || !payload.jti) {
    throw new Error("Invalid access token claims.");
  }

  return {
    userId,
    clientId,
    source,
    scopes,
    jti: payload.jti,
  };
}
