import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createAiGatewayContext } from "./context";
import { AiGatewayError } from "./errors";
import { AiGatewayRegistry } from "./registry";

function createTestRegistry() {
  const registry = new AiGatewayRegistry();
  registry.register({
    name: "echo",
    title: "Echo",
    description: "Test tool",
    category: "research",
    auth: "required",
    readOnly: true,
    inputSchema: z.object({ value: z.string().min(1) }),
    execute: async (_context, input) => ({ value: input.value }),
  });
  registry.register({
    name: "create",
    title: "Create",
    description: "Test create scope",
    category: "creation",
    auth: "required",
    readOnly: false,
    requiredScope: "spyreels:create",
    inputSchema: z.object({}).strict(),
    execute: async () => ({ created: true }),
  });
  registry.register({
    name: "limited",
    title: "Limited",
    description: "Test stable errors",
    category: "account",
    auth: "required",
    readOnly: true,
    inputSchema: z.object({}).strict(),
    execute: async () => {
      throw new AiGatewayError({
        code: "USAGE_LIMIT_REACHED",
        message: "Limit reached",
        upgradePlan: "pro",
      });
    },
  });
  return registry;
}

describe("AiGatewayRegistry", () => {
  it("lists tool metadata without exposing implementation details", () => {
    const registry = createTestRegistry();
    expect(registry.list()).toEqual([
      expect.objectContaining({
        name: "echo",
        auth: "required",
        readOnly: true,
        requiredScope: "spyreels:read",
      }),
      expect.objectContaining({
        name: "create",
        auth: "required",
        readOnly: false,
        requiredScope: "spyreels:create",
      }),
      expect.objectContaining({
        name: "limited",
        auth: "required",
        readOnly: true,
        requiredScope: "spyreels:read",
      }),
    ]);
  });

  it("blocks required tools when no SpyReels account is connected", async () => {
    const result = await createTestRegistry().execute(
      "echo",
      { value: "hello" },
      createAiGatewayContext({ source: "chatgpt", requestId: "req-1" })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("UNAUTHENTICATED");
    expect(result.meta.source).toBe("chatgpt");
    expect(result.meta.requestId).toBe("req-1");
  });

  it("validates tool input before execution", async () => {
    const result = await createTestRegistry().execute(
      "echo",
      { value: "" },
      createAiGatewayContext({
        source: "claude",
        actor: { userId: 42 },
        scopes: ["spyreels:read"],
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INVALID_INPUT");
  });

  it("executes a tool through the common gateway contract", async () => {
    const result = await createTestRegistry().execute(
      "echo",
      { value: "hello" },
      createAiGatewayContext({
        source: "copilot",
        requestId: "req-2",
        actor: { userId: 42 },
        scopes: ["spyreels:read"],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ value: "hello" });
    expect(result.meta).toEqual(
      expect.objectContaining({
        requestId: "req-2",
        source: "copilot",
        tool: "echo",
      })
    );
  });

  it("blocks creation tools when the connection has read scope only", async () => {
    const result = await createTestRegistry().execute(
      "create",
      {},
      createAiGatewayContext({
        source: "claude",
        actor: { userId: 42 },
        scopes: ["spyreels:read"],
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INSUFFICIENT_SCOPE");
  });

  it("allows creation tools after content creation access is approved", async () => {
    const result = await createTestRegistry().execute(
      "create",
      {},
      createAiGatewayContext({
        source: "chatgpt",
        actor: { userId: 42 },
        scopes: ["spyreels:read", "spyreels:create"],
      })
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data).toEqual({ created: true });
  });

  it("returns stable upgrade metadata for plan limits", async () => {
    const result = await createTestRegistry().execute(
      "limited",
      {},
      createAiGatewayContext({
        source: "gemini",
        actor: { userId: 42 },
        scopes: ["spyreels:read"],
      })
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({
      code: "USAGE_LIMIT_REACHED",
      message: "Limit reached",
      retryable: false,
      upgradePlan: "pro",
    });
  });

  it("does not guess unknown AI clients", () => {
    const context = createAiGatewayContext({ source: "future-ai-host" });
    expect(context.source).toBe("unknown");
  });
});
