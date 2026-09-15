import {
  capturePostHogEvent,
  posthogDistinctIdForUser,
} from "../analytics/posthogServer";
import { spyReelsAiTools } from "./tools";
import type {
  AiGatewayContext,
  AiGatewayExecutionResult,
} from "./types";

/**
 * Canonical entry point for every transport (MCP, REST/OpenAPI, partner API).
 * Platform adapters should translate auth + protocol details, then call this.
 */
export async function executeSpyReelsAiTool(
  toolName: string,
  input: unknown,
  context: AiGatewayContext
): Promise<AiGatewayExecutionResult> {
  const result = await spyReelsAiTools.execute(toolName, input, context);

  if (context.actor) {
    void capturePostHogEvent({
      distinctId: posthogDistinctIdForUser(context.actor.userId),
      event: "ai_gateway_tool_executed",
      properties: {
        ai_source: context.source,
        ai_client_name: context.clientName ?? undefined,
        ai_tool: toolName,
        ai_request_id: context.requestId,
        success: result.ok,
        error_code: result.ok ? undefined : result.error.code,
        duration_ms: result.meta.durationMs,
      },
    });
  }

  return result;
}

export function listSpyReelsAiTools() {
  return spyReelsAiTools.list();
}
