import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeSpyReelsAiTool: vi.fn(async (name: string) => ({
    ok: true,
    data: { tool: name, ok: true },
    meta: { source: "chatgpt" },
  })),
  authenticateAiGatewayRequest: vi.fn(async () => ({
    context: { userId: 1, source: "chatgpt", scopes: ["spyreels:read"] },
  })),
}));

vi.mock("./execute", () => ({
  executeSpyReelsAiTool: mocks.executeSpyReelsAiTool,
}));

vi.mock("./tools", async () => {
  const { z } = await import("zod");
  const descriptors = [
    {
      name: "find_creator",
      title: "Find creator",
      description: "Research a public creator.",
      category: "research",
      readOnly: true,
    },
    {
      name: "find_top_content",
      title: "Find top content",
      description: "Find top-performing public content.",
      category: "research",
      readOnly: true,
    },
    {
      name: "inspect_reel",
      title: "Inspect Reel",
      description: "Inspect one exact public Instagram Reel URL.",
      category: "research",
      readOnly: true,
    },
    {
      name: "transcribe_reel",
      title: "Transcribe Reel",
      description: "Transcribe one exact public Instagram Reel URL.",
      category: "analysis",
      readOnly: true,
    },
    {
      name: "remake_reel",
      title: "Remake Reel",
      description: "Generate a remake from one exact Instagram Reel.",
      category: "creation",
      readOnly: false,
      requiredScope: "spyreels:create",
    },
    {
      name: "get_usage",
      title: "Get SpyReels usage",
      description: "Read current SpyReels account usage.",
      category: "account",
      readOnly: true,
    },
  ] as const;
  const schemas = new Map(
    descriptors.map((descriptor) => [
      descriptor.name,
      { inputSchema: z.object({}).strict() },
    ])
  );
  return {
    spyReelsAiTools: {
      list: () => descriptors,
      get: (name: string) => schemas.get(name),
    },
  };
});

vi.mock("./oauth/authenticate", () => {
  class AiGatewayBearerAuthError extends Error {}
  return {
    AiGatewayBearerAuthError,
    authenticateAiGatewayRequest: mocks.authenticateAiGatewayRequest,
    sendAiGatewayBearerChallenge: vi.fn(),
  };
});

vi.mock("./oauth/config", () => ({
  AI_GATEWAY_MCP_PATH: "/api/ai/mcp",
}));

async function makeApp() {
  const { registerAiMcpRoute } = await import("./mcp");
  const app = express();
  app.use(express.json());
  registerAiMcpRoute(app);
  return app;
}

const modernHeaders = {
  Authorization: "Bearer test-token",
  "MCP-Protocol-Version": "2026-07-28",
};

describe("SpyReels MCP 2026-07-28 wire contract", () => {
  it("returns a standards-shaped server/discover result", async () => {
    const app = await makeApp();
    const response = await request(app)
      .post("/api/ai/mcp")
      .set({ ...modernHeaders, "Mcp-Method": "server/discover" })
      .send({
        jsonrpc: "2.0",
        id: "discover-1",
        method: "server/discover",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": {
              name: "ChatGPT",
              version: "test",
            },
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      resultType: "complete",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "SpyReels", version: "1.0.0" },
      ttlMs: 300000,
      cacheScope: "private",
    });
    expect(response.body.result.supportedVersions).toContain("2026-07-28");
  });

  it("returns all six callable tools with modern cache/result metadata", async () => {
    const app = await makeApp();
    const response = await request(app)
      .post("/api/ai/mcp")
      .set({ ...modernHeaders, "Mcp-Method": "tools/list" })
      .send({
        jsonrpc: "2.0",
        id: "tools-1",
        method: "tools/list",
        params: {
          _meta: {
            "io.modelcontextprotocol/protocolVersion": "2026-07-28",
            "io.modelcontextprotocol/clientInfo": {
              name: "ChatGPT",
              version: "test",
            },
            "io.modelcontextprotocol/clientCapabilities": {},
          },
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.result.resultType).toBe("complete");
    expect(response.body.result.ttlMs).toBe(300000);
    expect(response.body.result.cacheScope).toBe("private");
    expect(response.body.result.tools.map((tool: any) => tool.name)).toEqual([
      "find_creator",
      "find_top_content",
      "inspect_reel",
      "transcribe_reel",
      "remake_reel",
      "get_usage",
    ]);
    expect(
      response.body.result.tools.every(
        (tool: any) => tool.inputSchema?.type === "object"
      )
    ).toBe(true);
    const remakeTool = response.body.result.tools.find(
      (tool: any) => tool.name === "remake_reel"
    );
    expect(remakeTool?.annotations?.readOnlyHint).toBe(false);
    expect(remakeTool?.inputSchema?.properties?.instruction).toBeTruthy();
    expect(remakeTool?.inputSchema?.properties?.mode).toBeUndefined();
  });

  it("marks modern tool-call results complete while preserving legacy initialize", async () => {
    const app = await makeApp();
    const call = await request(app)
      .post("/api/ai/mcp")
      .set({
        ...modernHeaders,
        "Mcp-Method": "tools/call",
        "Mcp-Name": "get_usage",
      })
      .send({
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: { name: "get_usage", arguments: {} },
      });

    expect(call.status).toBe(200);
    expect(call.body.result.resultType).toBe("complete");
    expect(call.body.result.isError).toBe(false);
    expect(call.body.result.structuredContent).toEqual({
      tool: "get_usage",
      ok: true,
    });

    const legacy = await request(app)
      .post("/api/ai/mcp")
      .set({ Authorization: "Bearer test-token" })
      .send({
        jsonrpc: "2.0",
        id: "legacy-1",
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "legacy-test", version: "1.0.0" },
        },
      });

    expect(legacy.status).toBe(200);
    expect(legacy.body.result.protocolVersion).toBe("2025-06-18");
    expect(legacy.body.result.resultType).toBeUndefined();
  });
});
