import { describe, expect, it, vi } from "vitest";

// OpenAPI generation only needs the tool descriptors and schemas. Keep this
// contract test isolated from Stripe runtime configuration so it can run in a
// clean CI/validation environment without billing credentials.
vi.mock("../stripe/stripe-service", () => ({
  checkUsageLimit: vi.fn(),
  incrementUsage: vi.fn(),
  decrementUsage: vi.fn(),
  getUserSubscription: vi.fn(),
  getMonthlyUsage: vi.fn(),
}));

import {
  AI_GATEWAY_OPENAPI_PATH,
  AI_GATEWAY_REST_BASE_PATH,
  buildAiGatewayOpenApiDocument,
} from "./openapi";

describe("AI Gateway OpenAPI", () => {
  it("publishes the canonical read-only tool surface", () => {
    const document = buildAiGatewayOpenApiDocument() as any;

    expect(AI_GATEWAY_OPENAPI_PATH).toBe("/api/ai/openapi.json");
    expect(document.openapi).toBe("3.1.0");
    expect(document.paths[`${AI_GATEWAY_REST_BASE_PATH}/tools`]?.get).toBeTruthy();

    for (const name of [
      "find_creator",
      "find_top_content",
      "inspect_reel",
      "transcribe_reel",
      "get_usage",
    ]) {
      const operation = document.paths[`${AI_GATEWAY_REST_BASE_PATH}/tools/${name}`]?.post;
      expect(operation?.operationId).toBe(name);
      expect(operation?.security).toEqual([{ spyreelsOAuth: ["spyreels:read"] }]);
      expect(operation?.requestBody?.content?.["application/json"]?.schema).toBeTruthy();
    }
  });

  it("does not expose browser-session auth in the API contract", () => {
    const document = buildAiGatewayOpenApiDocument() as any;
    const security = document.components.securitySchemes.spyreelsOAuth;

    expect(security.type).toBe("oauth2");
    expect(security.flows.authorizationCode.scopes["spyreels:read"]).toBeTruthy();
  });
});
