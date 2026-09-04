/**
 * Sanitized observability for carousel angle generation.
 * Logs must never include source text, prompts, messages, or private data.
 */

import { TRPCError } from "@trpc/server";
import { getActiveGenerationTelemetry } from "./generationTelemetry";

export const ANGLE_GENERATION_STARTED = "[carouselStudio] angle generation started";
export const ANGLE_GENERATION_COMPLETED = "[carouselStudio] angle generation completed";
export const ANGLE_GENERATION_FAILED = "[carouselStudio] angle generation failed";
export const ANGLE_GENERATION_SUBSTAGE_COMPLETED =
  "[carouselStudio] angle substage completed";
export const GENERATE_FROM_INPUT_FAILED =
  "[carouselStudio] generateFromInput failed";

export const INVOKE_LLM_LOGICAL_STARTED = "[invokeLLM] logical call started";
export const INVOKE_LLM_PHYSICAL_STARTED = "[invokeLLM] physical attempt started";
export const INVOKE_LLM_PHYSICAL_COMPLETED =
  "[invokeLLM] physical attempt completed";
export const INVOKE_LLM_PHYSICAL_FAILED = "[invokeLLM] physical attempt failed";
export const INVOKE_LLM_FALLBACK_STARTED = "[invokeLLM] fallback model started";
export const INVOKE_LLM_LOGICAL_COMPLETED = "[invokeLLM] logical call completed";
export const INVOKE_LLM_LOGICAL_FAILED = "[invokeLLM] logical call failed";

export type ProviderErrorFields = {
  errorName: string;
  errorMessage: string;
  statusCode: number | null;
  providerRequestId: string | null;
  stack: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object") {
    return value as Record<string, unknown>;
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
}

function readStatus(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && /^\d{3}$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function requestIdFromHeaders(headers: unknown): string | null {
  const rec = asRecord(headers);
  if (!rec) return null;
  const getter = rec.get;
  if (typeof getter === "function") {
    return (
      readString(getter.call(headers, "request-id")) ??
      readString(getter.call(headers, "request_id")) ??
      readString(getter.call(headers, "x-request-id"))
    );
  }
  return (
    readString(rec["request-id"]) ??
    readString(rec.request_id) ??
    readString(rec["x-request-id"])
  );
}

function requestIdFromMessage(message: string): string | null {
  const quoted = message.match(/"request_id"\s*:\s*"([^"]+)"/);
  if (quoted?.[1]) return quoted[1];
  const bare = message.match(/\brequest_id[=:]\s*([A-Za-z0-9_-]+)/);
  return bare?.[1] ?? null;
}

function statusFromMessage(message: string): number | null {
  const leading = message.match(/^(\d{3})\b/);
  if (leading?.[1]) return Number(leading[1]);
  const jsonStatus = message.match(/"status"\s*:\s*(\d{3})/);
  if (jsonStatus?.[1]) return Number(jsonStatus[1]);
  return null;
}

export function extractProviderErrorFields(error: unknown): ProviderErrorFields {
  const rec = asRecord(error);
  const nested = rec ? asRecord(rec.error) : null;
  const errorName =
    error instanceof Error
      ? error.name
      : readString(rec?.name) ?? "Error";
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : readString(rec?.message) ?? String(error);
  const statusCode =
    readStatus(rec?.status) ??
    readStatus(rec?.statusCode) ??
    readStatus(nested?.status) ??
    statusFromMessage(errorMessage);
  const providerRequestId =
    readString(rec?.requestID) ??
    readString(rec?.request_id) ??
    readString(nested?.request_id) ??
    requestIdFromHeaders(rec?.headers) ??
    requestIdFromMessage(errorMessage);

  return {
    errorName,
    errorMessage,
    statusCode,
    providerRequestId,
    stack: error instanceof Error ? error.stack ?? null : null,
  };
}

export function resolveAngleGenerationCorrelationId(
  explicit?: string | null
): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  const fromTelemetry = getActiveGenerationTelemetry()?.runId?.trim();
  if (fromTelemetry) return fromTelemetry;
  return crypto.randomUUID();
}

export function resolveAngleGenerationEntryPoint(
  explicit?: string | null
): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  return getActiveGenerationTelemetry()?.entryPoint ?? "generateCarouselAngles";
}

export function logAngleGenerationStarted(fields: {
  entryPoint: string;
  correlationId: string;
  sourceCharacterCount: number;
  hasNicheOverride: boolean;
  hasBrandVoice: boolean;
  timestamp: string;
}): void {
  console.info(ANGLE_GENERATION_STARTED, {
    entryPoint: fields.entryPoint,
    correlationId: fields.correlationId,
    sourceCharacterCount: fields.sourceCharacterCount,
    hasNicheOverride: fields.hasNicheOverride,
    hasBrandVoice: fields.hasBrandVoice,
    timestamp: fields.timestamp,
  });
}

export type SemanticIssuesByCandidate = {
  attempt: "first" | "repair";
  candidateIndex: number;
  codes: string[];
};

export type AngleSubstageName = "compact" | "expansion";

export type CompactSubstageMetrics = {
  inputCharacterCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  rawCandidateCount: number;
  validCompactCandidateCount: number;
};

export type ExpansionSubstageMetrics = {
  candidateIndex: number;
  inputCharacterCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  firstPassValid: boolean;
  repairRan: boolean;
};

export type CarouselAngleGenerationMode =
  | "full_briefs"
  | "parallel_full_expansions";

export function logAngleSubstageCompleted(fields: {
  correlationId: string;
  substage: AngleSubstageName;
  inputCharacterCount: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  rawCandidateCount?: number | null;
  validCompactCandidateCount?: number | null;
  candidateIndex?: number | null;
  firstPassValid?: boolean | null;
  repairRan?: boolean | null;
}): void {
  console.info(ANGLE_GENERATION_SUBSTAGE_COMPLETED, {
    correlationId: fields.correlationId,
    substage: fields.substage,
    inputCharacterCount: fields.inputCharacterCount,
    inputTokens: fields.inputTokens,
    outputTokens: fields.outputTokens,
    durationMs: fields.durationMs,
    rawCandidateCount: fields.rawCandidateCount ?? null,
    validCompactCandidateCount: fields.validCompactCandidateCount ?? null,
    candidateIndex: fields.candidateIndex ?? null,
    firstPassValid: fields.firstPassValid ?? null,
    repairRan: fields.repairRan ?? null,
  });
}

export function logAngleGenerationCompleted(fields: {
  correlationId: string;
  durationMs: number;
  rawCandidateCount: number | null;
  normalizedCandidateCount: number;
  acceptedSemanticCandidateCount: number;
  repairRan: boolean;
  firstAttemptValidCount?: number;
  repairAttemptValidCount?: number;
  mergedValidCount?: number;
  requiredValidBriefs?: 1 | 3;
  proceededWithGracefulDegradation?: boolean;
  semanticIssuesByCandidate?: SemanticIssuesByCandidate[];
  requestedModel?: string | null;
  angleGenerationMode?: CarouselAngleGenerationMode;
  expansionRan?: boolean;
  compactCandidateCount?: number | null;
  repairReason?: string | null;
  compact?: CompactSubstageMetrics | null;
  expansions?: ExpansionSubstageMetrics[] | null;
  parallelExpansionWallClockMs?: number | null;
}): void {
  console.info(ANGLE_GENERATION_COMPLETED, {
    correlationId: fields.correlationId,
    durationMs: fields.durationMs,
    rawCandidateCount: fields.rawCandidateCount,
    normalizedCandidateCount: fields.normalizedCandidateCount,
    acceptedSemanticCandidateCount: fields.acceptedSemanticCandidateCount,
    repairRan: fields.repairRan,
    firstAttemptValidCount: fields.firstAttemptValidCount ?? null,
    repairAttemptValidCount: fields.repairAttemptValidCount ?? null,
    mergedValidCount: fields.mergedValidCount ?? null,
    requiredValidBriefs: fields.requiredValidBriefs ?? null,
    proceededWithGracefulDegradation:
      fields.proceededWithGracefulDegradation ?? false,
    semanticIssuesByCandidate: fields.semanticIssuesByCandidate ?? [],
    requestedModel: fields.requestedModel ?? null,
    angleGenerationMode: fields.angleGenerationMode ?? "full_briefs",
    expansionRan: fields.expansionRan ?? false,
    compactCandidateCount: fields.compactCandidateCount ?? null,
    repairReason: fields.repairReason ?? null,
    compact: fields.compact ?? null,
    expansions: fields.expansions ?? null,
    parallelExpansionWallClockMs: fields.parallelExpansionWallClockMs ?? null,
  });
}

export function logAngleGenerationFailed(fields: {
  correlationId: string;
  durationMs: number;
  error: unknown;
  operation: string;
  requestedModel: string;
  repairIteration?: number | null;
}): void {
  const extracted = extractProviderErrorFields(fields.error);
  console.error(ANGLE_GENERATION_FAILED, {
    correlationId: fields.correlationId,
    durationMs: fields.durationMs,
    errorName: extracted.errorName,
    errorMessage: extracted.errorMessage,
    statusCode: extracted.statusCode,
    providerRequestId: extracted.providerRequestId,
    stack: extracted.stack,
    operation: fields.operation,
    requestedModel: fields.requestedModel,
    repairIteration: fields.repairIteration ?? null,
  });
}

export function wrapProposeStudioAnglesError(error: unknown): never {
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message:
      error instanceof Error
        ? error.message
        : "Could not generate carousel angles.",
  });
}

export function logGenerateFromInputCaughtError(fields: {
  correlationId: string;
  durationMs: number;
  error: unknown;
}): void {
  const extracted = extractProviderErrorFields(fields.error);
  const code =
    fields.error instanceof TRPCError
      ? fields.error.code
      : readString(asRecord(fields.error)?.code);
  console.error(GENERATE_FROM_INPUT_FAILED, {
    correlationId: fields.correlationId,
    durationMs: fields.durationMs,
    errorMessage: extracted.errorMessage,
    errorCode: code ?? null,
    stack: extracted.stack,
  });
}

export type AngleInvokeLlmEvent =
  | "logical_started"
  | "physical_started"
  | "physical_completed"
  | "physical_failed"
  | "fallback_started"
  | "logical_completed"
  | "logical_failed";

const INVOKE_LLM_EVENT_LABEL: Record<AngleInvokeLlmEvent, string> = {
  logical_started: INVOKE_LLM_LOGICAL_STARTED,
  physical_started: INVOKE_LLM_PHYSICAL_STARTED,
  physical_completed: INVOKE_LLM_PHYSICAL_COMPLETED,
  physical_failed: INVOKE_LLM_PHYSICAL_FAILED,
  fallback_started: INVOKE_LLM_FALLBACK_STARTED,
  logical_completed: INVOKE_LLM_LOGICAL_COMPLETED,
  logical_failed: INVOKE_LLM_LOGICAL_FAILED,
};

export function isAngleGenerationOperation(operation?: string): boolean {
  return operation === "angle_generation";
}

export function logAngleInvokeLlmEvent(
  event: AngleInvokeLlmEvent,
  fields: {
    correlationId?: string | null;
    operation: string;
    requestedModel: string;
    actualModel?: string | null;
    attemptNumber?: number | null;
    repairIteration?: number | null;
    durationMs?: number | null;
    httpStatus?: number | null;
    providerRequestId?: string | null;
    errorMessage?: string | null;
  }
): void {
  if (!isAngleGenerationOperation(fields.operation)) return;
  const payload = {
    correlationId: fields.correlationId ?? null,
    operation: fields.operation,
    requestedModel: fields.requestedModel,
    actualModel: fields.actualModel ?? null,
    attemptNumber: fields.attemptNumber ?? null,
    repairIteration: fields.repairIteration ?? null,
    durationMs: fields.durationMs ?? null,
    httpStatus: fields.httpStatus ?? null,
    providerRequestId: fields.providerRequestId ?? null,
    errorMessage: fields.errorMessage ?? null,
  };
  const label = INVOKE_LLM_EVENT_LABEL[event];
  if (event === "physical_failed" || event === "logical_failed") {
    console.error(label, payload);
    return;
  }
  console.info(label, payload);
}
