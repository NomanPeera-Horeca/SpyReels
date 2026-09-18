import { describe, expect, it } from "vitest";
import {
  normalizeRequestedScopes,
  selectCimdTokenEndpointAuthMethod,
  validateAiOAuthClientSecret,
  validateAiOAuthRedirectUri,
  type ResolvedAiOAuthClient,
} from "./clientRegistry";
import { hashClientSecret } from "./crypto";

function client(overrides: Partial<ResolvedAiOAuthClient> = {}): ResolvedAiOAuthClient {
  return {
    clientId: "client-1",
    clientName: "Test client",
    source: "api",
    redirectUris: ["https://client.example/callback"],
    allowedScopes: ["spyreels:read", "spyreels:create", "offline_access"],
    isPublic: true,
    clientSecretHash: null,
    registrationKind: "database",
    ...overrides,
  };
}

describe("AI Gateway OAuth client validation", () => {
  it("requires an exact redirect URI match", () => {
    const value = client();
    expect(validateAiOAuthRedirectUri(value, "https://client.example/callback")).toBe(true);
    expect(normalizeRequestedScopes(value, "spyreels:read")).toEqual(["spyreels:read"]);
    expect(validateAiOAuthRedirectUri(value, "https://client.example/callback?next=1")).toBe(false);
    expect(validateAiOAuthRedirectUri(value, "https://evil.example/callback")).toBe(false);
  });

  it("defaults to the individual client's allowed scopes when scope is omitted", () => {
    const legacy = client({
      allowedScopes: ["spyreels:read", "offline_access"],
    });
    expect(normalizeRequestedScopes(legacy, undefined)).toEqual([
      "spyreels:read",
      "offline_access",
    ]);
  });

  it("accepts the refresh continuity scope without widening SpyReels permissions", () => {
    const value = client();
    expect(normalizeRequestedScopes(value, "spyreels:read offline_access")).toEqual([
      "spyreels:read",
      "offline_access",
    ]);
  });

  it("accepts the explicit content creation scope", () => {
    const value = client();
    expect(
      normalizeRequestedScopes(
        value,
        "spyreels:read spyreels:create offline_access"
      )
    ).toEqual(["spyreels:read", "spyreels:create", "offline_access"]);
  });

  it("rejects scopes outside the registered client scope", () => {
    const value = client();
    expect(normalizeRequestedScopes(value, "spyreels:write")).toBeNull();
  });

  it("supports public PKCE clients without a client secret", () => {
    expect(validateAiOAuthClientSecret(client(), undefined)).toBe(true);
  });

  it("validates confidential client secrets by hash", () => {
    const value = client({
      isPublic: false,
      clientSecretHash: hashClientSecret("correct-secret"),
    });
    expect(validateAiOAuthClientSecret(value, "correct-secret")).toBe(true);
    expect(validateAiOAuthClientSecret(value, "wrong-secret")).toBe(false);
    expect(validateAiOAuthClientSecret(value, undefined)).toBe(false);
  });

  it("negotiates ChatGPT transition CIMD metadata to the supported public PKCE path", () => {
    expect(
      selectCimdTokenEndpointAuthMethod({
        token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
        token_endpoint_auth_method: "private_key_jwt",
      })
    ).toBe("none");
  });

  it("keeps supporting legacy CIMD clients that explicitly use none", () => {
    expect(
      selectCimdTokenEndpointAuthMethod({
        token_endpoint_auth_method: "none",
      })
    ).toBe("none");
  });

  it("rejects CIMD clients when there is no supported auth-method intersection", () => {
    expect(
      selectCimdTokenEndpointAuthMethod({
        token_endpoint_auth_methods_supported: ["private_key_jwt"],
        token_endpoint_auth_method: "private_key_jwt",
      })
    ).toBeNull();
  });
});
