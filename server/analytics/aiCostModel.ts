import { lookupLlmPricing } from "../carousel/generationPricing";

/**
 * Estimated AI spend per call. LLM token rates come from
 * `carousel/generationPricing.ts` (the pricing source of record);
 * speech-to-text is metered per audio minute. All figures are estimates.
 */

export const DEEPGRAM_NOVA3_USD_PER_MINUTE = 0.03; // nova-3 audio transcription
export const OPENAI_WHISPER_USD_PER_MINUTE = 0.006; // whisper-1 (dormant path)

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export type LlmCostEstimate = {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  estimated: boolean;
};

export function estimateLlmCost(opts: {
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}): LlmCostEstimate {
  const inputTokens = opts.inputTokens ?? 0;
  const outputTokens = opts.outputTokens ?? 0;
  const pricing = lookupLlmPricing(opts.model);
  const costUsd =
    (inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (outputTokens / 1_000_000) * pricing.outputPerMillionUsd;
  return {
    model: pricing.model,
    inputTokens,
    outputTokens,
    costUsd: roundUsd(costUsd),
    estimated: pricing.estimated,
  };
}

export type SttCostEstimate = {
  provider: "deepgram" | "openai";
  model: string;
  durationSec: number;
  minutes: number;
  costUsd: number;
  estimated: boolean;
};

export function estimateSttCost(opts: {
  provider: "deepgram" | "openai";
  model: string;
  durationSec: number;
}): SttCostEstimate {
  const minutes = opts.durationSec / 60;
  const usdPerMinute =
    opts.provider === "deepgram"
      ? DEEPGRAM_NOVA3_USD_PER_MINUTE
      : OPENAI_WHISPER_USD_PER_MINUTE;
  return {
    provider: opts.provider,
    model: opts.model,
    durationSec: opts.durationSec,
    minutes,
    costUsd: roundUsd(minutes * usdPerMinute),
    estimated: true,
  };
}