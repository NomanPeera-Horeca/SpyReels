import type { z } from "zod";

/**
 * AI surfaces that can call SpyReels through the gateway.
 * Keep this list transport-neutral: MCP, REST, OpenAPI and future adapters
 * all resolve into the same source field before business logic executes.
 */
export const AI_GATEWAY_SOURCES = [
  "chatgpt",
  "claude",
  "copilot",
  "gemini",
  "perplexity",
  "cursor",
  "api",
  "internal",
  "unknown",
] as const;

export type AiGatewaySource = (typeof AI_GATEWAY_SOURCES)[number];

export interface AiGatewayActor {
  userId: number;
  openId?: string | null;
  email?: string | null;
  role?: string | null;
}

export interface AiGatewayContext {
  requestId: string;
  source: AiGatewaySource;
  clientName?: string | null;
  actor: AiGatewayActor | null;
  startedAt: Date;
}

export type AiGatewayAuthMode = "public" | "required";
export type AiGatewayToolCategory =
  | "research"
  | "analysis"
  | "creation"
  | "account";

export interface AiGatewayToolDefinition<TInput extends z.ZodType = z.ZodType, TOutput = unknown> {
  name: string;
  title: string;
  description: string;
  category: AiGatewayToolCategory;
  auth: AiGatewayAuthMode;
  readOnly: boolean;
  inputSchema: TInput;
  execute: (
    context: AiGatewayContext,
    input: z.infer<TInput>
  ) => Promise<TOutput>;
}

export type AiGatewayErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_INPUT"
  | "TOOL_NOT_FOUND"
  | "USAGE_LIMIT_REACHED"
  | "UPSTREAM_UNAVAILABLE"
  | "NOT_FOUND"
  | "PRIVATE_ACCOUNT"
  | "INTERNAL_ERROR";

export interface AiGatewayErrorShape {
  code: AiGatewayErrorCode;
  message: string;
  retryable: boolean;
  upgradePlan?: string;
}

export interface AiGatewayExecutionMeta {
  requestId: string;
  source: AiGatewaySource;
  tool: string;
  durationMs: number;
}

export type AiGatewayExecutionResult<T = unknown> =
  | {
      ok: true;
      data: T;
      meta: AiGatewayExecutionMeta;
    }
  | {
      ok: false;
      error: AiGatewayErrorShape;
      meta: AiGatewayExecutionMeta;
    };
