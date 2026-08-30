import { afterEach, describe, expect, it } from "vitest";
import {
  createGenerationTelemetryContext,
  finalizeGenerationMetrics,
  isCarouselGenerationMetricsEnabled,
  parseCarouselGenerationMetricsFlag,
  persistTerminalRemakeWithUpdate,
} from "../generationTelemetry";

const ORIGINAL = process.env.CAROUSEL_GENERATION_METRICS;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.CAROUSEL_GENERATION_METRICS;
  } else {
    process.env.CAROUSEL_GENERATION_METRICS = ORIGINAL;
  }
});

describe("carousel generation metrics feature flag", () => {
  it("defaults enabled when the variable is missing or empty", () => {
    expect(parseCarouselGenerationMetricsFlag(undefined)).toBe(true);
    expect(parseCarouselGenerationMetricsFlag("")).toBe(true);
    expect(parseCarouselGenerationMetricsFlag("   ")).toBe(true);
    expect(parseCarouselGenerationMetricsFlag("1")).toBe(true);
    expect(parseCarouselGenerationMetricsFlag("true")).toBe(true);
  });

  it("disables collection for explicit 0 or false", () => {
    expect(parseCarouselGenerationMetricsFlag("0")).toBe(false);
    expect(parseCarouselGenerationMetricsFlag("false")).toBe(false);
    expect(parseCarouselGenerationMetricsFlag("FALSE")).toBe(false);
    expect(parseCarouselGenerationMetricsFlag(" False ")).toBe(false);
  });

  it("does not write generationMetricsJson when the flag is off", async () => {
    process.env.CAROUSEL_GENERATION_METRICS = "0";
    expect(isCarouselGenerationMetricsEnabled()).toBe(false);
    expect(
      createGenerationTelemetryContext({
        entryPoint: "carouselRemake.start",
        remakeId: 9,
      })
    ).toBeUndefined();

    const writes: Record<string, unknown>[] = [];
    const statusFields = {
      status: "completed",
      progressStage: null,
      slotValuesJson: { slide_01: { headline: "unchanged" } },
      errorMessage: null,
    };

    await persistTerminalRemakeWithUpdate(
      async (fields) => {
        writes.push(fields);
      },
      9,
      statusFields,
      {
        schemaVersion: 1,
        pricingVersion: "2026-08-30",
        runId: "should-not-write",
        remakeId: 9,
        entryPoint: "carouselRemake.start",
        environment: "test",
        codeVersion: null,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        failedAt: null,
        durationMs: 10,
        status: "completed",
        failureStage: null,
        errorCategory: null,
        stages: [],
        llmCalls: [],
        imageCalls: [],
        aggregates: {
          llmLogicalCallCount: 0,
          llmPhysicalAttemptCount: 0,
          llmBillableAttemptCount: 0,
          llmInputTokens: 0,
          llmOutputTokens: 0,
          llmTotalTokens: 0,
          llmEstimatedCostUsd: 0,
          imageSlotCount: 0,
          imageBillableCount: 0,
          imageSlotsResolved: 0,
          imageSlotsFailed: 0,
          imageEstimatedCostUsd: 0,
          totalEstimatedCostUsd: 0,
          slidesGenerated: 3,
        },
      }
    );

    expect(writes).toHaveLength(1);
    expect(writes[0]).toEqual(statusFields);
    expect(writes[0]).not.toHaveProperty("generationMetricsJson");
  });

  it("leaves finalize as a no-op when the flag is off", () => {
    process.env.CAROUSEL_GENERATION_METRICS = "false";
    expect(
      finalizeGenerationMetrics(undefined, "completed", 1)
    ).toBeNull();
  });
});
