/**
 * One structured LLM call on top of the EXISTING server/_core/llm.ts invokeLLM:
 * same Anthropic client, model routing (default model + fallback), internal
 * transient retries, deadline (timeoutMs) and PostHog usage reporting
 * (reportAiUsage via the `operation` label). No new provider.
 *
 * Adds only what the suggestion engine needs:
 * - forced JSON schema output, parsed and validated by the caller's parser
 * - ONE repair attempt when the output is malformed or fails a guard
 * - clear failure kinds (timeout / invalid_output / llm_unavailable)
 * - accumulated token usage and estimated cost (existing aiCostModel)
 */
import type { InvokeParams, InvokeResult, MessageContent } from "../../_core/llm";
import { estimateLlmCost } from "../../analytics/aiCostModel";
import { withAiFormattingRules } from "../../utils/aiFormattingRules";

export type LlmInvoker = (params: InvokeParams) => Promise<InvokeResult>;

export type LlmUsage = {
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
};

export type ParseResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: string };

export class IntelligenceError extends Error {
  constructor(
    readonly kind: "timeout" | "invalid_output" | "llm_unavailable",
    message: string,
    readonly usage: LlmUsage,
    readonly attempts: number
  ) {
    super(message);
  }
}

export const DEFAULT_TIMEOUT_MS = 25_000;
export const MAX_STRUCTURED_ATTEMPTS = 2;

const defaultInvoker: LlmInvoker = async params => {
  const { invokeLLM } = await import("../../_core/llm");
  return invokeLLM(params);
};

function contentText(result: InvokeResult): string {
  const content = result.choices[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map(c => ("text" in c && typeof c.text === "string" ? c.text : ""))
      .join("");
  }
  return "";
}

function userContent(
  text: string,
  images: { label: string; dataUrl: string }[] | undefined
): string | MessageContent[] {
  if (!images?.length) return text;
  return [
    { type: "text", text },
    ...images.flatMap(image => [
      { type: "text" as const, text: image.label },
      { type: "image_url" as const, image_url: { url: image.dataUrl } },
    ]),
  ];
}

export async function callStructured<T>(input: {
  operation: string;
  system: string;
  user: string;
  schemaName: string;
  schema: Record<string, unknown>;
  parse: (raw: unknown) => ParseResult<T>;
  invoker?: LlmInvoker;
  timeoutMs?: number;
  maxTokens?: number;
  /** Optional observer: called for every rejected model answer (evaluation and telemetry). */
  onRejected?: (reason: string) => void;
  /** Labelled inline images (data URLs) sent after the text, e.g. post thumbnails. */
  images?: { label: string; dataUrl: string }[];
}): Promise<{ value: T; usage: LlmUsage; attempts: number }> {
  const invoker = input.invoker ?? defaultInvoker;
  const usage: LlmUsage = {
    model: null,
    inputTokens: 0,
    outputTokens: 0,
    estimatedUsd: 0,
  };
  let repairNote = "";
  let lastReason = "no attempt";

  for (let attempt = 1; attempt <= MAX_STRUCTURED_ATTEMPTS; attempt++) {
    let result: InvokeResult;
    try {
      result = await invoker({
        messages: [
          { role: "system", content: withAiFormattingRules(input.system) },
          { role: "user", content: userContent(input.user + repairNote, input.images) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: input.schemaName,
            strict: true,
            schema: input.schema,
          },
        },
        maxTokens: input.maxTokens ?? 800,
        temperature: 0.4,
        timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        operation: input.operation,
        repairIteration: attempt - 1,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const kind = /timeout|timed out|deadline|abort/i.test(message)
        ? "timeout"
        : "llm_unavailable";
      // invokeLLM already retried transient provider errors and tried the fallback model.
      throw new IntelligenceError(kind, message, usage, attempt);
    }

    const inTok = result.usage?.prompt_tokens ?? 0;
    const outTok = result.usage?.completion_tokens ?? 0;
    usage.model = result.model ?? usage.model;
    usage.inputTokens += inTok;
    usage.outputTokens += outTok;
    usage.estimatedUsd += estimateLlmCost({
      model: result.model,
      inputTokens: inTok,
      outputTokens: outTok,
    }).costUsd;

    let raw: unknown;
    try {
      raw = JSON.parse(contentText(result));
    } catch {
      lastReason = "output was not valid JSON";
      input.onRejected?.(lastReason);
      repairNote = `\n\nYour previous answer was rejected: ${lastReason}. Return only the JSON object.`;
      continue;
    }
    const parsed = input.parse(raw);
    if (parsed.ok) {
      usage.estimatedUsd =
        Math.round(usage.estimatedUsd * 1_000_000) / 1_000_000;
      return { value: parsed.value, usage, attempts: attempt };
    }
    lastReason = parsed.reason;
    input.onRejected?.(lastReason);
    repairNote = `\n\nYour previous answer was rejected: ${lastReason}. Fix it and follow every rule.`;
  }
  usage.estimatedUsd = Math.round(usage.estimatedUsd * 1_000_000) / 1_000_000;
  throw new IntelligenceError(
    "invalid_output",
    lastReason,
    usage,
    MAX_STRUCTURED_ATTEMPTS
  );
}
