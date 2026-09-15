import type { Express, Request, Response } from "express";
import { z } from "zod";
import { executeSpyReelsAiTool } from "./execute";
import { spyReelsAiTools } from "./tools";
import {
  AiGatewayBearerAuthError,
  authenticateAiGatewayRequest,
  sendAiGatewayBearerChallenge,
} from "./oauth/authenticate";
import { AI_GATEWAY_MCP_PATH } from "./oauth/config";

export const CURRENT_MCP_PROTOCOL_VERSION = "2026-07-28";
const LEGACY_MCP_PROTOCOL_VERSIONS = new Set([
  "2024-11-05",
  "2025-03-26",
  "2025-06-18",
  "2025-11-25",
]);
const SERVER_INFO = { name: "SpyReels", version: "1.0.0" } as const;

type JsonRpcId = string | number | null;
type JsonRpcRequest = {
  jsonrpc: "2.0";
  id?: JsonRpcId;
  method: string;
  params?: unknown;
};

function jsonRpcResult(id: JsonRpcId, result: unknown) {
  return { jsonrpc: "2.0" as const, id, result };
}

function jsonRpcError(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
) {
  return {
    jsonrpc: "2.0" as const,
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function parseJsonRpcRequest(body: unknown): JsonRpcRequest | null {
  if (!body || typeof body !== "object") return null;
  const record = body as Record<string, unknown>;
  if (record.jsonrpc !== "2.0" || typeof record.method !== "string") return null;
  const id = record.id;
  if (
    id !== undefined &&
    id !== null &&
    typeof id !== "string" &&
    typeof id !== "number"
  ) {
    return null;
  }
  return {
    jsonrpc: "2.0",
    ...(id === undefined ? {} : { id: id as JsonRpcId }),
    method: record.method,
    params: record.params,
  };
}

function headerValue(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value[0]?.trim();
  return undefined;
}

function requestedProtocolVersion(req: Request, request: JsonRpcRequest): string {
  const header = headerValue(req, "mcp-protocol-version");
  if (header) return header;
  if (request.method === "initialize") {
    const params =
      request.params && typeof request.params === "object"
        ? (request.params as Record<string, unknown>)
        : {};
    if (typeof params.protocolVersion === "string") return params.protocolVersion;
  }
  return "2025-11-25";
}

function validateModernHeaders(
  req: Request,
  request: JsonRpcRequest
): string | null {
  const methodHeader = headerValue(req, "mcp-method");
  if (!methodHeader || methodHeader !== request.method) {
    return "Mcp-Method must match the JSON-RPC method.";
  }
  if (request.method === "tools/call") {
    const params =
      request.params && typeof request.params === "object"
        ? (request.params as Record<string, unknown>)
        : {};
    const name = typeof params.name === "string" ? params.name : "";
    const nameHeader = headerValue(req, "mcp-name");
    if (!name || !nameHeader || nameHeader !== name) {
      return "Mcp-Name must match params.name for tools/call.";
    }
  }
  return null;
}

function toolInputJsonSchema(toolName: string): Record<string, unknown> {
  const tool = spyReelsAiTools.get(toolName);
  if (!tool) return { type: "object", additionalProperties: false };
  try {
    const schema = z.toJSONSchema(tool.inputSchema) as Record<string, unknown>;
    delete schema.$schema;
    return schema;
  } catch (error) {
    console.warn(
      `[ai-gateway] could not export JSON Schema for ${toolName}`,
      error instanceof Error ? error.message : String(error)
    );
    return { type: "object", additionalProperties: true };
  }
}

function listMcpTools() {
  return spyReelsAiTools.list().map((descriptor) => ({
    name: descriptor.name,
    title: descriptor.title,
    description: descriptor.description,
    inputSchema: toolInputJsonSchema(descriptor.name),
    annotations: {
      readOnlyHint: descriptor.readOnly,
      destructiveHint: false,
      idempotentHint: descriptor.readOnly,
      openWorldHint: descriptor.category === "research",
    },
  }));
}

function discoverResult() {
  return {
    capabilities: {
      tools: { listChanged: false },
    },
    _meta: {
      "io.modelcontextprotocol/protocolVersion": CURRENT_MCP_PROTOCOL_VERSION,
      "io.modelcontextprotocol/serverInfo": SERVER_INFO,
    },
  };
}

function legacyInitializeResult(protocolVersion: string) {
  const selected = LEGACY_MCP_PROTOCOL_VERSIONS.has(protocolVersion)
    ? protocolVersion
    : "2025-11-25";
  return {
    protocolVersion: selected,
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: SERVER_INFO,
    instructions:
      "SpyReels helps creators research public social content and turn performance signals into actionable content intelligence.",
  };
}

function textContent(value: unknown): Array<{ type: "text"; text: string }> {
  return [
    {
      type: "text",
      text:
        typeof value === "string"
          ? value
          : JSON.stringify(value, null, 2),
    },
  ];
}

async function handleMcpMethod(
  request: JsonRpcRequest,
  context: Awaited<ReturnType<typeof authenticateAiGatewayRequest>>["context"],
  protocolVersion: string
): Promise<unknown> {
  switch (request.method) {
    case "ping":
      return {};

    case "server/discover":
      return discoverResult();

    case "initialize":
      return legacyInitializeResult(protocolVersion);

    case "tools/list":
      return {
        tools: listMcpTools(),
        ...(protocolVersion === CURRENT_MCP_PROTOCOL_VERSION
          ? { ttlMs: 300_000, cacheScope: "private" }
          : {}),
      };

    case "tools/call": {
      const params =
        request.params && typeof request.params === "object"
          ? (request.params as Record<string, unknown>)
          : {};
      const name = typeof params.name === "string" ? params.name : "";
      if (!name) {
        return {
          content: textContent({
            code: "INVALID_INPUT",
            message: "tools/call requires params.name.",
          }),
          isError: true,
        };
      }
      const result = await executeSpyReelsAiTool(
        name,
        params.arguments ?? {},
        context
      );
      if (!result.ok) {
        return {
          content: textContent(result.error),
          structuredContent: { error: result.error, meta: result.meta },
          isError: true,
        };
      }
      return {
        content: textContent(result.data),
        structuredContent:
          result.data && typeof result.data === "object"
            ? result.data
            : { value: result.data },
        isError: false,
        _meta: {
          spyreels: result.meta,
        },
      };
    }

    default:
      throw Object.assign(new Error("Method not found"), { jsonRpcCode: -32601 });
  }
}

export function registerAiMcpRoute(app: Express): void {
  app.post(AI_GATEWAY_MCP_PATH, async (req: Request, res: Response) => {
    const request = parseJsonRpcRequest(req.body);
    if (!request) {
      res.status(400).json(jsonRpcError(null, -32600, "Invalid Request"));
      return;
    }

    let authenticated;
    try {
      authenticated = await authenticateAiGatewayRequest(req, ["spyreels:read"]);
    } catch (error) {
      if (error instanceof AiGatewayBearerAuthError) {
        sendAiGatewayBearerChallenge(res, error);
        return;
      }
      console.error("[ai-gateway] MCP authentication failed", error);
      sendAiGatewayBearerChallenge(res);
      return;
    }

    const protocolVersion = requestedProtocolVersion(req, request);
    const isModern = protocolVersion === CURRENT_MCP_PROTOCOL_VERSION;
    const isLegacy = LEGACY_MCP_PROTOCOL_VERSIONS.has(protocolVersion);
    if (!isModern && !isLegacy) {
      res.status(400).json(
        jsonRpcError(
          request.id ?? null,
          -32600,
          `Unsupported MCP protocol version: ${protocolVersion}`,
          {
            supported: [
              CURRENT_MCP_PROTOCOL_VERSION,
              ...LEGACY_MCP_PROTOCOL_VERSIONS,
            ],
          }
        )
      );
      return;
    }

    if (isModern) {
      const headerError = validateModernHeaders(req, request);
      if (headerError) {
        res.status(400).json(
          jsonRpcError(request.id ?? null, -32600, "Invalid MCP headers", {
            message: headerError,
          })
        );
        return;
      }
    }

    res.setHeader("MCP-Protocol-Version", protocolVersion);
    res.setHeader("Cache-Control", "no-store");

    // MCP notifications do not receive JSON-RPC responses.
    if (request.id === undefined && request.method === "notifications/initialized") {
      res.status(202).send("");
      return;
    }

    try {
      const result = await handleMcpMethod(
        request,
        authenticated.context,
        protocolVersion
      );
      if (request.id === undefined) {
        res.status(202).send("");
        return;
      }
      res.json(jsonRpcResult(request.id, result));
    } catch (error) {
      const code =
        error && typeof error === "object" &&
        typeof (error as { jsonRpcCode?: unknown }).jsonRpcCode === "number"
          ? (error as { jsonRpcCode: number }).jsonRpcCode
          : -32603;
      if (code === -32603) {
        console.error("[ai-gateway] MCP transport failure", error);
      }
      res
        .status(code === -32601 ? 404 : 500)
        .json(
          jsonRpcError(
            request.id ?? null,
            code,
            code === -32601 ? "Method not found" : "Internal error"
          )
        );
    }
  });

  app.get(AI_GATEWAY_MCP_PATH, (_req, res) => {
    res.setHeader("Allow", "POST");
    res.status(405).json({
      error: "method_not_allowed",
      message: "Use POST for the SpyReels MCP endpoint.",
    });
  });
}
