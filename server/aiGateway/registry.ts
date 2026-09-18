import { AiGatewayError } from "./errors";
import type {
  AiGatewayContext,
  AiGatewayExecutionMeta,
  AiGatewayExecutionResult,
  AiGatewayToolDefinition,
} from "./types";

type AnyToolDefinition = AiGatewayToolDefinition<any, any>;

export interface AiGatewayToolDescriptor {
  name: string;
  title: string;
  description: string;
  category: AnyToolDefinition["category"];
  auth: AnyToolDefinition["auth"];
  readOnly: boolean;
  requiredScope: string;
}

export class AiGatewayRegistry {
  private readonly tools = new Map<string, AnyToolDefinition>();

  register<T extends AnyToolDefinition>(tool: T): T {
    if (this.tools.has(tool.name)) {
      throw new Error(`AI gateway tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return tool;
  }

  get(name: string): AnyToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): AiGatewayToolDescriptor[] {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      category: tool.category,
      auth: tool.auth,
      readOnly: tool.readOnly,
      requiredScope: tool.requiredScope ?? "spyreels:read",
    }));
  }

  async execute(
    name: string,
    rawInput: unknown,
    context: AiGatewayContext
  ): Promise<AiGatewayExecutionResult> {
    const startedAt = Date.now();
    const tool = this.tools.get(name);

    const meta = (): AiGatewayExecutionMeta => ({
      requestId: context.requestId,
      source: context.source,
      tool: name,
      durationMs: Date.now() - startedAt,
    });

    if (!tool) {
      return {
        ok: false,
        error: {
          code: "TOOL_NOT_FOUND",
          message: `Unknown SpyReels tool: ${name}`,
          retryable: false,
        },
        meta: meta(),
      };
    }

    if (tool.auth === "required" && !context.actor) {
      return {
        ok: false,
        error: {
          code: "UNAUTHENTICATED",
          message: "Connect your SpyReels account to use this tool.",
          retryable: false,
        },
        meta: meta(),
      };
    }

    const requiredScope = tool.requiredScope ?? "spyreels:read";
    if (tool.auth === "required" && !context.scopes.includes(requiredScope)) {
      return {
        ok: false,
        error: {
          code: "INSUFFICIENT_SCOPE",
          message:
            requiredScope === "spyreels:create"
              ? "Reconnect SpyReels and approve content creation access to use this tool."
              : "Reconnect SpyReels and approve the required access to use this tool.",
          retryable: false,
        },
        meta: meta(),
      };
    }

    const normalizedInput = tool.normalizeInput
      ? tool.normalizeInput(rawInput)
      : rawInput;
    const parsed = await tool.inputSchema.safeParseAsync(normalizedInput);
    if (!parsed.success) {
      return {
        ok: false,
        error: {
          code: "INVALID_INPUT",
          message: parsed.error.issues
            .map((issue: { path: PropertyKey[]; message: string }) => {
              const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
              return `${path}${issue.message}`;
            })
            .join("; "),
          retryable: false,
        },
        meta: meta(),
      };
    }

    try {
      const data = await tool.execute(context, parsed.data);
      return { ok: true, data, meta: meta() };
    } catch (error) {
      if (error instanceof AiGatewayError) {
        return { ok: false, error: error.toShape(), meta: meta() };
      }

      console.error(
        `[ai-gateway] tool=${name} source=${context.source} requestId=${context.requestId} failed`,
        error
      );
      return {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "SpyReels could not complete that request right now.",
          retryable: true,
        },
        meta: meta(),
      };
    }
  }
}
