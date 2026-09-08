import { capturePostHogEvent } from "./posthogServer";

/**
 * Fires a fire-and-forget PostHog `ai_usage` event so AI spend can be broken
 * down by provider, model, and feature in PostHog Insights. Never throws.
 */

export type AiUsageReport = {
  provider: "anthropic" | "deepgram" | "openai";
  model: string;
  operation?: string;
  inputTokens?: number;
  outputTokens?: number;
  durationSec?: number;
  costUsd: number;
  estimated: boolean;
  distinctId?: string;
};

export function reportAiUsage(report: AiUsageReport): void {
  try {
    void capturePostHogEvent({
      distinctId: report.distinctId ?? "spyreels-server",
      event: "ai_usage",
      properties: {
        provider: report.provider,
        model: report.model,
        operation: report.operation ?? "unlabeled",
        costUsd: report.costUsd,
        estimated: report.estimated,
        inputTokens: report.inputTokens ?? null,
        outputTokens: report.outputTokens ?? null,
        durationSec: report.durationSec ?? null,
        costBasis:
          report.inputTokens != null ? "token_rates_per_million" : "per_audio_minute",
      },
    });
  } catch {
    // Never let the reporting path take down a request.
  }
}