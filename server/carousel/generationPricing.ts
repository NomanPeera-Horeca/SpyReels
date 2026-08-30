/**
 * Centralized carousel generation pricing (Phase 0 estimates).
 * Do not scatter model prices elsewhere. All figures are estimated
 * unless a provider invoice line is available.
 */

export const CAROUSEL_GENERATION_PRICING_VERSION = "2026-08-30";

export type LlmTokenPricing = {
  provider: "anthropic";
  model: string;
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  calculationMethod: "token_rate_per_million";
  estimated: true;
};

export type ImageFlatPricing = {
  provider: "openai";
  model: string;
  size: string;
  quality: string;
  usdPerImage: number;
  calculationMethod: "flat_per_image";
  estimated: true;
};

const LLM_PRICING: Record<string, LlmTokenPricing> = {
  "claude-sonnet-4-6": {
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    inputPerMillionUsd: 3,
    outputPerMillionUsd: 15,
    calculationMethod: "token_rate_per_million",
    estimated: true,
  },
  "claude-haiku-4-5-20251001": {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    inputPerMillionUsd: 1,
    outputPerMillionUsd: 5,
    calculationMethod: "token_rate_per_million",
    estimated: true,
  },
};

const IMAGE_PRICING: Record<string, ImageFlatPricing> = {
  "gpt-image-1.5:1024x1536": {
    provider: "openai",
    model: "gpt-image-1.5",
    size: "1024x1536",
    quality: "default",
    usdPerImage: 0.07,
    calculationMethod: "flat_per_image",
    estimated: true,
  },
};

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function lookupLlmPricing(model: string): LlmTokenPricing {
  const exact = LLM_PRICING[model];
  if (exact) return exact;
  const lower = model.toLowerCase();
  if (lower.includes("haiku")) return LLM_PRICING["claude-haiku-4-5-20251001"]!;
  return LLM_PRICING["claude-sonnet-4-6"]!;
}

export function lookupImagePricing(
  model: string,
  size: string,
  _quality?: string | null
): ImageFlatPricing {
  const key = `${model}:${size}`;
  const exact = IMAGE_PRICING[key];
  if (exact) return exact;
  return {
    provider: "openai",
    model,
    size,
    quality: _quality?.trim() || "default",
    usdPerImage: 0.07,
    calculationMethod: "flat_per_image",
    estimated: true,
  };
}

export function estimateLlmCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): { estimatedCostUsd: number; estimated: true; provider: string; calculationMethod: "token_rate_per_million" } {
  const rate = lookupLlmPricing(model);
  const cost =
    (Math.max(0, inputTokens) / 1_000_000) * rate.inputPerMillionUsd +
    (Math.max(0, outputTokens) / 1_000_000) * rate.outputPerMillionUsd;
  return {
    estimatedCostUsd: roundUsd(cost),
    estimated: true,
    provider: rate.provider,
    calculationMethod: "token_rate_per_million",
  };
}

export function estimateImageCostUsd(
  model: string,
  size: string,
  quality?: string | null
): { estimatedCostUsd: number; estimated: true; provider: string; calculationMethod: "flat_per_image" } {
  const rate = lookupImagePricing(model, size, quality);
  return {
    estimatedCostUsd: roundUsd(rate.usdPerImage),
    estimated: true,
    provider: rate.provider,
    calculationMethod: "flat_per_image",
  };
}
