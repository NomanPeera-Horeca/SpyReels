import { z } from "zod";
import { spyReelsAiTools } from "./tools";
import { aiGatewayIssuer, authorizationEndpoint, tokenEndpoint } from "./oauth/config";

export const AI_GATEWAY_REST_BASE_PATH = "/api/ai/v1";
export const AI_GATEWAY_OPENAPI_PATH = "/api/ai/openapi.json";

function inputSchemaFor(toolName: string): Record<string, unknown> {
  const tool = spyReelsAiTools.get(toolName);
  if (!tool) return { type: "object", additionalProperties: false };
  try {
    const schema = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
    delete schema.$schema;
    return schema;
  } catch {
    return { type: "object", additionalProperties: true };
  }
}

export function buildAiGatewayOpenApiDocument() {
  const toolPaths = Object.fromEntries(
    spyReelsAiTools.list().map((tool) => [
      `${AI_GATEWAY_REST_BASE_PATH}/tools/${tool.name}`,
      {
        post: {
          operationId: tool.name,
          summary: tool.title,
          description: tool.description,
          tags: [tool.category],
          security: [
            {
              spyreelsOAuth:
                tool.requiredScope === "spyreels:create"
                  ? ["spyreels:read", "spyreels:create"]
                  : ["spyreels:read"],
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: inputSchemaFor(tool.name),
              },
            },
          },
          responses: {
            "200": { description: "Tool executed successfully." },
            "400": { description: "Invalid tool input." },
            "401": { description: "Missing or invalid SpyReels OAuth token." },
            "404": { description: "Tool or requested resource not found." },
            "429": { description: "SpyReels plan usage limit reached." },
            "502": { description: "Upstream content provider temporarily unavailable." },
          },
        },
      },
    ])
  );

  return {
    openapi: "3.1.0",
    info: {
      title: "SpyReels AI Gateway API",
      version: "1.0.0",
      description:
        "Creator research, exact-Reel intelligence, transcription and controlled content-generation tools backed by a connected SpyReels account.",
    },
    servers: [{ url: aiGatewayIssuer() }],
    paths: {
      [`${AI_GATEWAY_REST_BASE_PATH}/tools`]: {
        get: {
          operationId: "list_spyreels_tools",
          summary: "List available SpyReels AI tools",
          security: [{ spyreelsOAuth: ["spyreels:read"] }],
          responses: {
            "200": { description: "Available tool descriptors." },
            "401": { description: "Missing or invalid SpyReels OAuth token." },
          },
        },
      },
      ...toolPaths,
    },
    components: {
      securitySchemes: {
        spyreelsOAuth: {
          type: "oauth2",
          flows: {
            authorizationCode: {
              authorizationUrl: authorizationEndpoint(),
              tokenUrl: tokenEndpoint(),
              scopes: {
                "spyreels:read":
                  "Read creator research, exact Reel metadata, transcripts and SpyReels account usage.",
                "spyreels:create":
                  "Generate content such as remake scripts using the connected SpyReels account.",
              },
            },
          },
        },
      },
    },
  };
}
