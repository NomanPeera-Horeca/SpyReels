import { beforeEach, describe, expect, it } from "vitest";
import {
  createGenerationTelemetryContext,
  finalizeGenerationMetrics,
  persistTerminalRemakeWithUpdate,
  sanitizeGenerationMetrics,
} from "../generationTelemetry";

function buildCompletedMetrics() {
  const ctx = createGenerationTelemetryContext({
    entryPoint: "carouselRemake.start",
    remakeId: 42,
  });
  if (!ctx) throw new Error("expected telemetry context");
  ctx.collector.recordStage("copy_generation", 120, "ok");
  ctx.collector.recordStage("image_generation", 800, "ok");
  ctx.collector.beginLogicalLlmCall();
  ctx.collector.recordPhysicalLlmAttempt({
    model: "claude-sonnet-4-6",
    attemptNumber: 1,
    durationMs: 110,
    success: true,
    errorCategory: null,
    fallbackOccurred: false,
    inputTokens: 200,
    outputTokens: 80,
    totalTokens: 280,
  });
  ctx.collector.recordLogicalLlmCall({
    operation: "copy_generation",
    requestedModel: "claude-sonnet-4-6",
    actualModel: "claude-sonnet-4-6",
    durationMs: 120,
    success: true,
    inputTokens: 200,
    outputTokens: 80,
    totalTokens: 280,
    repairIteration: 0,
  });
  ctx.collector.recordImageSlot({
    slideId: "slide_01",
    imageSlotId: "photo",
    sourcePath: "generated",
    model: "gpt-image-1.5",
    requestedSize: "1024x1536",
    requestedQuality: "default",
    attemptNumber: 1,
    durationMs: 800,
    apiRequestSucceeded: true,
    imageReturned: true,
    storageSucceeded: true,
    slotResolved: true,
    retryCount: 0,
    errorCategory: null,
  });
  ctx.collector.setSlidesGenerated(6);
  ctx.collector.recordStage("final_save", 0, "ok");
  return finalizeGenerationMetrics(ctx, "completed", 42);
}

function buildFailedMetrics() {
  const ctx = createGenerationTelemetryContext({
    entryPoint: "carouselStudio.generateFromInput",
    remakeId: 7,
  });
  if (!ctx) throw new Error("expected telemetry context");
  ctx.collector.recordStage("source_resolution", 40, "ok");
  ctx.collector.recordStage("copy_generation", 90, "failed");
  ctx.collector.beginLogicalLlmCall();
  ctx.collector.recordPhysicalLlmAttempt({
    model: "claude-sonnet-4-6",
    attemptNumber: 1,
    durationMs: 90,
    success: false,
    errorCategory: "rate_limit",
    fallbackOccurred: false,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
  });
  ctx.collector.recordLogicalLlmCall({
    operation: "copy_generation",
    requestedModel: "claude-sonnet-4-6",
    actualModel: null,
    durationMs: 90,
    success: false,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    repairIteration: 0,
  });
  return finalizeGenerationMetrics(ctx, "failed", 7, {
    failureStage: "copy_generation",
    errorCategory: "rate_limit",
  });
}

describe("carousel generation terminal-state isolation", () => {
  beforeEach(() => {
    delete process.env.CAROUSEL_GENERATION_METRICS;
  });

  it("persists completed generation metrics with completed status", async () => {
    const writes: Record<string, unknown>[] = [];
    const metrics = buildCompletedMetrics();
    expect(metrics).not.toBeNull();
    expect(metrics?.status).toBe("completed");
    expect(metrics?.aggregates.llmTotalTokens).toBe(280);
    expect(metrics?.aggregates.imageBillableCount).toBe(1);

    await persistTerminalRemakeWithUpdate(
      async (fields) => {
        writes.push(fields);
      },
      42,
      {
        status: "completed",
        progressStage: null,
        errorMessage: null,
        slotValuesJson: { slide_01: { headline: "ok" } },
      },
      metrics
    );

    expect(writes).toHaveLength(1);
    expect(writes[0]?.status).toBe("completed");
    expect(writes[0]?.generationMetricsJson).toMatchObject({
      status: "completed",
      remakeId: 42,
      schemaVersion: 1,
    });
    const saved = writes[0]?.generationMetricsJson as { aggregates: { llmTotalTokens: number } };
    expect(saved.aggregates.llmTotalTokens).toBe(280);
  });

  it("persists partial failed metrics with failed status", async () => {
    const writes: Record<string, unknown>[] = [];
    const metrics = buildFailedMetrics();
    expect(metrics?.status).toBe("failed");
    expect(metrics?.failureStage).toBe("copy_generation");
    expect(metrics?.imageCalls).toEqual([]);

    await persistTerminalRemakeWithUpdate(
      async (fields) => {
        writes.push(fields);
      },
      7,
      {
        status: "failed",
        progressStage: null,
        errorMessage: "LLM request failed",
      },
      metrics
    );

    expect(writes).toHaveLength(1);
    expect(writes[0]?.status).toBe("failed");
    expect(writes[0]?.generationMetricsJson).toMatchObject({
      status: "failed",
      failureStage: "copy_generation",
      errorCategory: "rate_limit",
    });
  });

  it("keeps completed status when metrics serialization fails", async () => {
    const writes: Record<string, unknown>[] = [];
    const circular = buildCompletedMetrics() as ReturnType<typeof buildCompletedMetrics> & {
      loop?: unknown;
    };
    if (!circular) throw new Error("expected metrics");
    circular.loop = circular;

    await persistTerminalRemakeWithUpdate(
      async (fields) => {
        writes.push(fields);
      },
      42,
      { status: "completed", progressStage: null, errorMessage: null },
      circular
    );

    expect(writes).toHaveLength(1);
    expect(writes[0]?.status).toBe("completed");
    expect(writes[0]?.generationMetricsJson).toBeUndefined();
  });

  it("retries status-only when metrics DB write fails", async () => {
    const writes: Record<string, unknown>[] = [];
    const metrics = buildFailedMetrics();

    await persistTerminalRemakeWithUpdate(
      async (fields) => {
        writes.push(fields);
        if ("generationMetricsJson" in fields) {
          throw new Error("generationMetricsJson column too large");
        }
      },
      7,
      { status: "failed", progressStage: null, errorMessage: "unknown template" },
      metrics
    );

    expect(writes).toHaveLength(2);
    expect(writes[0]?.status).toBe("failed");
    expect(writes[0]?.generationMetricsJson).toBeDefined();
    expect(writes[1]?.status).toBe("failed");
    expect(writes[1]?.generationMetricsJson).toBeUndefined();
  });

  it("does not double-count logical plus physical tokens in aggregates", () => {
    const metrics = buildCompletedMetrics();
    expect(metrics?.aggregates.llmLogicalCallCount).toBe(1);
    expect(metrics?.aggregates.llmPhysicalAttemptCount).toBe(1);
    expect(metrics?.aggregates.llmBillableAttemptCount).toBe(1);
    expect(metrics?.aggregates.llmTotalTokens).toBe(280);
    const serialized = sanitizeGenerationMetrics(metrics!);
    expect(serialized.aggregates.llmTotalTokens).toBe(280);
  });
});
