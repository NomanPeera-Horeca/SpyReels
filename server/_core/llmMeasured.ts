import Anthropic from "@anthropic-ai/sdk";
import { estimateLlmCost } from "../analytics/aiCostModel";
import { reportAiUsage } from "../analytics/aiUsageReporter";

/**
 * Reports token usage/cost for raw Anthropic `client.messages.create` call
 * sites that bypass `invokeLLM`. Read usage straight off the response after
 * the call; never throws. Pair each call site with an `operation` label so
 * PostHog can roll up spend by feature.
 */
export function reportDirectAnthropicUsage(
  response: Anthropic.Message,
  operation?: string
): void {
  try {
    const est = estimateLlmCost({
      model: response.model,
      inputTokens: response.usage?.input_tokens,
      outputTokens: response.usage?.output_tokens,
    });
    reportAiUsage({
      provider: "anthropic",
      model: est.model,
      operation,
      inputTokens: est.inputTokens,
      outputTokens: est.outputTokens,
      costUsd: est.costUsd,
      estimated: est.estimated,
    });
  } catch {
    // Reporting must never break the call behind it.
  }
}