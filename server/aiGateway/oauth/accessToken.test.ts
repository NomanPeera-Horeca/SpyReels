import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  issueAiGatewayAccessToken,
  verifyAiGatewayAccessToken,
} from "./accessToken";

const originalSecret = process.env.SPYREELS_AI_OAUTH_JWT_SECRET;
const originalIssuer = process.env.SPYREELS_AI_OAUTH_ISSUER;

beforeEach(() => {
  process.env.SPYREELS_AI_OAUTH_JWT_SECRET =
    "test-only-ai-oauth-secret-that-is-long-enough-123456";
  process.env.SPYREELS_AI_OAUTH_ISSUER = "https://spyreels.test";
});

afterEach(() => {
  if (originalSecret === undefined) delete process.env.SPYREELS_AI_OAUTH_JWT_SECRET;
  else process.env.SPYREELS_AI_OAUTH_JWT_SECRET = originalSecret;
  if (originalIssuer === undefined) delete process.env.SPYREELS_AI_OAUTH_ISSUER;
  else process.env.SPYREELS_AI_OAUTH_ISSUER = originalIssuer;
});

describe("AI Gateway access tokens", () => {
  it("round-trips the authenticated user, client, source, and scopes", async () => {
    const issued = await issueAiGatewayAccessToken({
      userId: 42,
      clientId: "https://client.example/oauth-metadata.json",
      source: "chatgpt",
      scopes: ["spyreels:read"],
    });

    const identity = await verifyAiGatewayAccessToken(issued.accessToken);
    expect(identity.userId).toBe(42);
    expect(identity.clientId).toBe("https://client.example/oauth-metadata.json");
    expect(identity.source).toBe("chatgpt");
    expect(identity.scopes).toEqual(["spyreels:read"]);
    expect(identity.jti).toBeTruthy();
    expect(issued.expiresIn).toBe(3600);
  });

  it("rejects a token when the configured issuer/resource changes", async () => {
    const issued = await issueAiGatewayAccessToken({
      userId: 7,
      clientId: "client-test",
      source: "api",
      scopes: ["spyreels:read"],
    });

    process.env.SPYREELS_AI_OAUTH_ISSUER = "https://different.spyreels.test";
    await expect(verifyAiGatewayAccessToken(issued.accessToken)).rejects.toThrow();
  });
});
