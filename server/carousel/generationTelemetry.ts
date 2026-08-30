import { AsyncLocalStorage } from "node:async_hooks";
import { eq } from "drizzle-orm";
import {
  CAROUSEL_GENERATION_METRICS_SCHEMA_VERSION,
  type CarouselGenerationAggregates,
  type CarouselGenerationEntryPoint,
  type CarouselGenerationMetrics,
  type CarouselGenerationRunStatus,
  type CarouselGenerationStageMetric,
  type CarouselGenerationStageName,
  type CarouselImageSlotMetric,
  type CarouselLogicalLlmCallMetric,
  type CarouselPhysicalLlmAttemptMetric,
} from "@shared/carouselGenerationMetrics";
import { carouselRemakes } from "../../drizzle/schema";
import { getDb } from "../db";
import {
  CAROUSEL_GENERATION_PRICING_VERSION,
  estimateImageCostUsd,
  estimateLlmCostUsd,
} from "./generationPricing";

const telemetryAls = new AsyncLocalStorage<GenerationTelemetryContext>();

const FORBIDDEN_KEY_EXACT = new Set([
  "prompt",
  "content",
  "sourcecontent",
  "transcript",
  "caption",
  "apikey",
  "api_key",
  "authorization",
  "secret",
  "password",
  "token",
  "accesstoken",
  "authtoken",
  "signedurl",
  "signed",
  "upload",
  "uploadedmediaurl",
  "generatedcopy",
  "generated_copy",
]);

const FORBIDDEN_KEY_PARTIAL =
  /prompt|transcript|caption|api[_-]?key|authorization|sourcecontent|generatedcopy|signedurl|uploadedmedia/i;

function isForbiddenMetricsKey(key: string): boolean {
  const lower = key.toLowerCase();
  return FORBIDDEN_KEY_EXACT.has(lower) || FORBIDDEN_KEY_PARTIAL.test(key);
}

export type GenerationTelemetryContext = {
  runId: string;
  remakeId: number | null;
  entryPoint: CarouselGenerationEntryPoint;
  environment: string;
  codeVersion: string | null;
  startedAtIso: string;
  startedAtMono: number | null;
  collector: GenerationMetricsCollector;
};

export function parseCarouselGenerationMetricsFlag(
  raw: string | undefined | null
): boolean {
  if (raw == null || raw.trim() === "") return true;
  const v = raw.trim().toLowerCase();
  return v !== "0" && v !== "false";
}

export function isCarouselGenerationMetricsEnabled(): boolean {
  return parseCarouselGenerationMetricsFlag(
    process.env.CAROUSEL_GENERATION_METRICS
  );
}

export function resolveCodeVersion(): string | null {
  const candidates = [
    process.env.RAILWAY_GIT_COMMIT_SHA,
    process.env.RAILWAY_GIT_SHA,
    process.env.GIT_COMMIT_SHA,
    process.env.GIT_SHA,
    process.env.COMMIT_SHA,
    process.env.SOURCE_VERSION,
  ];
  for (const value of candidates) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

export function createGenerationTelemetryContext(args: {
  entryPoint: CarouselGenerationEntryPoint;
  remakeId?: number | null;
  existing?: CarouselGenerationMetrics | null;
}): GenerationTelemetryContext | undefined {
  if (!isCarouselGenerationMetricsEnabled()) return undefined;

  const existing = isGenerationMetrics(args.existing) ? args.existing : null;
  const runId =
    existing && typeof existing.runId === "string" && existing.runId.trim()
      ? existing.runId
      : crypto.randomUUID();
  const collector = new GenerationMetricsCollector();
  if (existing) collector.hydrate(existing);

  return {
    runId,
    remakeId: args.remakeId ?? existing?.remakeId ?? null,
    entryPoint: existing?.entryPoint ?? args.entryPoint,
    environment: process.env.NODE_ENV || "development",
    codeVersion: existing?.codeVersion ?? resolveCodeVersion(),
    startedAtIso: existing?.startedAt ?? new Date().toISOString(),
    startedAtMono: existing ? null : performance.now(),
    collector,
  };
}

export function runWithGenerationTelemetry<T>(
  ctx: GenerationTelemetryContext | undefined,
  fn: () => T
): T {
  if (!ctx) return fn();
  return telemetryAls.run(ctx, fn);
}

export function getActiveGenerationTelemetry():
  | GenerationTelemetryContext
  | undefined {
  return telemetryAls.getStore();
}

export function resolveInvokeTelemetry(
  explicit?: GenerationTelemetryContext
): GenerationTelemetryContext | undefined {
  if (!isCarouselGenerationMetricsEnabled()) return undefined;
  return explicit ?? getActiveGenerationTelemetry();
}

export function categorizeGenerationError(error: unknown): string {
  const status = (error as { status?: number })?.status;
  const message = error instanceof Error ? error.message : String(error);
  if (status === 429 || /rate.?limit/i.test(message)) return "rate_limit";
  if (status === 401 || status === 403 || /api key|unauthorized|forbidden/i.test(message)) {
    return "auth";
  }
  if (status === 408 || /timeout|timed out|aborted/i.test(message)) return "timeout";
  if (/unknown carousel template/i.test(message)) return "unknown_template";
  if (/slot text missing|failed validation/i.test(message)) return "validation";
  if (/could not analyze|source carousel/i.test(message)) {
    return "source_vision_analysis";
  }
  if (/could not load|could not read|not enough text|paste an instagram/i.test(message)) {
    return "source_resolution";
  }
  if (/storage|r2|s3/i.test(message)) return "storage";
  if (/image generation|openai image/i.test(message)) return "image_api";
  if (/llm|anthropic|overloaded/i.test(message)) return "llm_error";
  return "unknown";
}

export class GenerationMetricsCollector {
  private stages = new Map<CarouselGenerationStageName, CarouselGenerationStageMetric>();
  private llmCalls: CarouselLogicalLlmCallMetric[] = [];
  private imageCalls: CarouselImageSlotMetric[] = [];
  private failureStage: string | null = null;
  private errorCategory: string | null = null;
  private slidesGenerated: number | null = null;
  private currentPhysicalAttempts: CarouselPhysicalLlmAttemptMetric[] = [];

  hydrate(existing: CarouselGenerationMetrics): void {
    this.safe(() => {
      for (const stage of existing.stages ?? []) {
        if (!stage?.name) continue;
        this.stages.set(stage.name, { ...stage });
      }
      this.llmCalls = [...(existing.llmCalls ?? [])];
      this.imageCalls = [...(existing.imageCalls ?? [])];
      this.failureStage = existing.failureStage ?? null;
      this.errorCategory = existing.errorCategory ?? null;
      this.slidesGenerated = existing.aggregates?.slidesGenerated ?? null;
    });
  }

  setFailureStage(stage: string | null): void {
    this.safe(() => {
      this.failureStage = stage;
    });
  }

  setErrorCategory(category: string | null): void {
    this.safe(() => {
      this.errorCategory = category;
    });
  }

  setSlidesGenerated(count: number): void {
    this.safe(() => {
      this.slidesGenerated = count;
    });
  }

  recordStage(
    name: CarouselGenerationStageName,
    durationMs: number,
    status: "ok" | "failed"
  ): void {
    this.safe(() => {
      const prev = this.stages.get(name);
      if (!prev) {
        this.stages.set(name, {
          name,
          durationMs: Math.max(0, Math.round(durationMs)),
          status,
          occurrenceCount: 1,
        });
        return;
      }
      this.stages.set(name, {
        name,
        durationMs: prev.durationMs + Math.max(0, Math.round(durationMs)),
        status: prev.status === "failed" || status === "failed" ? "failed" : "ok",
        occurrenceCount: prev.occurrenceCount + 1,
      });
    });
  }

  recordPhysicalLlmAttempt(attempt: CarouselPhysicalLlmAttemptMetric): void {
    this.safe(() => {
      this.currentPhysicalAttempts.push(attempt);
    });
  }

  beginLogicalLlmCall(): void {
    this.safe(() => {
      this.currentPhysicalAttempts = [];
    });
  }

  recordLogicalLlmCall(
    call: Omit<CarouselLogicalLlmCallMetric, "physicalAttempts" | "estimatedCostUsd" | "estimated">
  ): void {
    this.safe(() => {
      const physicalAttempts = this.currentPhysicalAttempts;
      this.currentPhysicalAttempts = [];
      const billable = physicalAttempts.find(
        (row) => row.success && row.totalTokens != null
      );
      const inputTokens = billable?.inputTokens ?? call.inputTokens;
      const outputTokens = billable?.outputTokens ?? call.outputTokens;
      const totalTokens =
        billable?.totalTokens ??
        call.totalTokens ??
        (inputTokens != null && outputTokens != null
          ? inputTokens + outputTokens
          : null);
      const cost = estimateLlmCostUsd(
        call.actualModel ?? call.requestedModel,
        inputTokens ?? 0,
        outputTokens ?? 0
      );
      this.llmCalls.push({
        ...call,
        inputTokens,
        outputTokens,
        totalTokens,
        estimatedCostUsd: call.success ? cost.estimatedCostUsd : 0,
        estimated: true,
        physicalAttempts,
      });
    });
  }

  recordImageSlot(
    slot: Omit<CarouselImageSlotMetric, "estimatedCostUsd" | "estimated"> & {
      estimatedCostUsd?: number;
    }
  ): void {
    this.safe(() => {
      const billable = slot.apiRequestSucceeded;
      const cost = billable
        ? estimateImageCostUsd(
            slot.model ?? "gpt-image-1.5",
            slot.requestedSize ?? "1024x1536",
            slot.requestedQuality
          )
        : { estimatedCostUsd: 0, estimated: true as const };
      this.imageCalls.push({
        ...slot,
        estimatedCostUsd: slot.estimatedCostUsd ?? cost.estimatedCostUsd,
        estimated: true,
      });
    });
  }

  snapshot(
    ctx: GenerationTelemetryContext,
    status: CarouselGenerationRunStatus,
    remakeId: number | null
  ): CarouselGenerationMetrics {
    const nowIso = new Date().toISOString();
    return {
      schemaVersion: CAROUSEL_GENERATION_METRICS_SCHEMA_VERSION,
      pricingVersion: CAROUSEL_GENERATION_PRICING_VERSION,
      runId: ctx.runId,
      remakeId,
      entryPoint: ctx.entryPoint,
      environment: ctx.environment,
      codeVersion: ctx.codeVersion,
      startedAt: ctx.startedAtIso,
      completedAt: status === "completed" ? nowIso : null,
      failedAt: status === "failed" ? nowIso : null,
      durationMs: durationMsFromContext(ctx),
      status,
      failureStage: status === "failed" ? this.failureStage : null,
      errorCategory: status === "failed" ? this.errorCategory : null,
      stages: [...this.stages.values()],
      llmCalls: this.llmCalls.map((call) => ({
        ...call,
        physicalAttempts: [...call.physicalAttempts],
      })),
      imageCalls: [...this.imageCalls],
      aggregates: buildAggregates(this.llmCalls, this.imageCalls, this.slidesGenerated),
    };
  }

  private safe(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error("[carouselTelemetry] collector record failed", err);
    }
  }
}

function durationMsFromContext(ctx: GenerationTelemetryContext): number {
  if (ctx.startedAtMono != null) {
    return Math.max(0, Math.round(performance.now() - ctx.startedAtMono));
  }
  const started = Date.parse(ctx.startedAtIso);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Date.now() - started);
}

function buildAggregates(
  llmCalls: CarouselLogicalLlmCallMetric[],
  imageCalls: CarouselImageSlotMetric[],
  slidesGenerated: number | null
): CarouselGenerationAggregates {
  const physical = llmCalls.flatMap((call) => call.physicalAttempts);
  const billableLlm = physical.filter(
    (row) => row.success && row.totalTokens != null
  );
  let llmInputTokens = 0;
  let llmOutputTokens = 0;
  let llmTotalTokens = 0;
  let llmEstimatedCostUsd = 0;
  for (const row of billableLlm) {
    llmInputTokens += row.inputTokens ?? 0;
    llmOutputTokens += row.outputTokens ?? 0;
    llmTotalTokens += row.totalTokens ?? 0;
    llmEstimatedCostUsd += estimateLlmCostUsd(
      row.model,
      row.inputTokens ?? 0,
      row.outputTokens ?? 0
    ).estimatedCostUsd;
  }

  const billableImages = imageCalls.filter((row) => row.apiRequestSucceeded);
  const imageEstimatedCostUsd = billableImages.reduce(
    (sum, row) => sum + row.estimatedCostUsd,
    0
  );

  return {
    llmLogicalCallCount: llmCalls.length,
    llmPhysicalAttemptCount: physical.length,
    llmBillableAttemptCount: billableLlm.length,
    llmInputTokens,
    llmOutputTokens,
    llmTotalTokens,
    llmEstimatedCostUsd: roundUsd(llmEstimatedCostUsd),
    imageSlotCount: imageCalls.length,
    imageBillableCount: billableImages.length,
    imageSlotsResolved: imageCalls.filter((row) => row.slotResolved).length,
    imageSlotsFailed: imageCalls.filter((row) => !row.slotResolved).length,
    imageEstimatedCostUsd: roundUsd(imageEstimatedCostUsd),
    totalEstimatedCostUsd: roundUsd(llmEstimatedCostUsd + imageEstimatedCostUsd),
    slidesGenerated,
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function isGenerationMetrics(
  value: unknown
): value is CarouselGenerationMetrics {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<CarouselGenerationMetrics>;
  return typeof row.runId === "string" && typeof row.schemaVersion === "number";
}

function looksLikeUrl(value: string): boolean {
  return /^(https?:\/\/|data:)/i.test(value.trim());
}

function stripUrlQuery(value: string): string {
  try {
    const parsed = new URL(value);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    const q = value.indexOf("?");
    return q >= 0 ? value.slice(0, q) : value;
  }
}

function sanitizeNode(
  key: string,
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): unknown {
  if (isForbiddenMetricsKey(key)) return undefined;
  if (value == null) return value;
  if (typeof value === "string") {
    if (looksLikeUrl(value)) return undefined;
    if (value.includes("?") && /[&=]/.test(value)) return stripUrlQuery(value);
    if (value.length > 240) return undefined;
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") {
    if (seen.has(value)) {
      throw new Error("carousel telemetry sanitize hit a circular reference");
    }
    seen.add(value);
    if (Array.isArray(value)) {
      return value
        .map((item) => sanitizeNode("item", item, seen))
        .filter((item) => item !== undefined);
    }
    const out: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(
      value as Record<string, unknown>
    )) {
      const sanitized = sanitizeNode(childKey, childValue, seen);
      if (sanitized !== undefined) out[childKey] = sanitized;
    }
    return out;
  }
  return undefined;
}

export function sanitizeGenerationMetrics(
  metrics: CarouselGenerationMetrics
): CarouselGenerationMetrics {
  const sanitized = sanitizeNode("metrics", metrics);
  if (!sanitized || typeof sanitized !== "object") {
    throw new Error("carousel telemetry sanitize produced an empty payload");
  }
  const serialized = JSON.parse(JSON.stringify(sanitized)) as CarouselGenerationMetrics;
  return serialized;
}

export async function withGenerationStage<T>(
  ctx: GenerationTelemetryContext | undefined,
  stage: CarouselGenerationStageName,
  fn: () => Promise<T> | T
): Promise<T> {
  if (!ctx || !isCarouselGenerationMetricsEnabled()) {
    return await fn();
  }
  const started = performance.now();
  let status: "ok" | "failed" = "ok";
  try {
    return await fn();
  } catch (err) {
    status = "failed";
    ctx.collector.setFailureStage(stage);
    ctx.collector.setErrorCategory(categorizeGenerationError(err));
    throw err;
  } finally {
    ctx.collector.recordStage(stage, performance.now() - started, status);
  }
}

export function finalizeGenerationMetrics(
  ctx: GenerationTelemetryContext | undefined,
  status: "completed" | "failed",
  remakeId: number,
  extra?: { failureStage?: string | null; errorCategory?: string | null }
): CarouselGenerationMetrics | null {
  if (!ctx || !isCarouselGenerationMetricsEnabled()) return null;
  if (extra?.failureStage) ctx.collector.setFailureStage(extra.failureStage);
  if (extra?.errorCategory) ctx.collector.setErrorCategory(extra.errorCategory);
  return ctx.collector.snapshot(ctx, status, remakeId);
}

export async function persistInProgressMetrics(
  remakeId: number,
  ctx: GenerationTelemetryContext | undefined
): Promise<void> {
  if (!ctx || !isCarouselGenerationMetricsEnabled()) return;
  try {
    const db = await getDb();
    if (!db) return;
    const sanitized = sanitizeGenerationMetrics(
      ctx.collector.snapshot(ctx, "in_progress", remakeId)
    );
    await db
      .update(carouselRemakes)
      .set({ generationMetricsJson: sanitized })
      .where(eq(carouselRemakes.id, remakeId));
  } catch (err) {
    console.error(
      `[carouselTelemetry] in-progress persist failed remake=${remakeId}`,
      err
    );
  }
}

export async function persistTerminalRemakeWithUpdate(
  update: (fields: Record<string, unknown>) => Promise<void>,
  remakeId: number,
  statusFields: Record<string, unknown>,
  metrics: CarouselGenerationMetrics | null | undefined
): Promise<void> {
  if (!isCarouselGenerationMetricsEnabled() || !metrics) {
    await update(statusFields);
    return;
  }

  let sanitized: CarouselGenerationMetrics;
  try {
    sanitized = sanitizeGenerationMetrics(metrics);
    JSON.stringify(sanitized);
  } catch (err) {
    console.error(
      `[carouselTelemetry] metrics serialize failed remake=${remakeId}`,
      err
    );
    await update(statusFields);
    return;
  }

  try {
    await update({
      ...statusFields,
      generationMetricsJson: sanitized,
    });
  } catch (err) {
    console.error(
      `[carouselTelemetry] metrics persist failed remake=${remakeId}`,
      err
    );
    await update(statusFields);
  }
}

export async function persistTerminalRemake(
  remakeId: number,
  statusFields: Record<string, unknown>,
  metrics: CarouselGenerationMetrics | null | undefined
): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error(
      `[carouselTelemetry] database unavailable; cannot persist remake ${remakeId}`
    );
    return;
  }
  await persistTerminalRemakeWithUpdate(
    async (fields) => {
      await db
        .update(carouselRemakes)
        .set(fields as Partial<typeof carouselRemakes.$inferInsert>)
        .where(eq(carouselRemakes.id, remakeId));
    },
    remakeId,
    statusFields,
    metrics
  );
}
