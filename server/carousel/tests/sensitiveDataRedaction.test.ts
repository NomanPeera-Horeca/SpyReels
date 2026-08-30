import { describe, expect, it } from "vitest";
import type { CarouselGenerationMetrics } from "@shared/carouselGenerationMetrics";
import { sanitizeGenerationMetrics } from "../generationTelemetry";

function baseMetrics(): CarouselGenerationMetrics {
  return {
    schemaVersion: 1,
    pricingVersion: "2026-08-30",
    runId: "run-redact-1",
    remakeId: 11,
    entryPoint: "carouselRemake.generateFromContent",
    environment: "test",
    codeVersion: "abc123",
    startedAt: "2026-08-30T12:00:00.000Z",
    completedAt: "2026-08-30T12:00:08.000Z",
    failedAt: null,
    durationMs: 8000,
    status: "completed",
    failureStage: null,
    errorCategory: null,
    stages: [
      {
        name: "copy_generation",
        durationMs: 400,
        status: "ok",
        occurrenceCount: 1,
      },
    ],
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
      slidesGenerated: 5,
    },
  };
}

describe("carousel generation metrics redaction", () => {
  it("strips prompts, source content, transcripts, copy, keys, and URLs", () => {
    const dirty = {
      ...baseMetrics(),
      prompt: "Write a carousel about secret sauce",
      sourceContent: "Full blog post about my product",
      transcript: "Spoken transcript of the reel",
      caption: "Instagram caption text",
      generatedCopy: "Slide headline that must never persist",
      apiKey: "sk-secret-key",
      authorization: "Bearer secret",
      signedUrl:
        "https://cdn.example.com/photo.jpg?X-Amz-Signature=abc&token=1",
      uploadedMediaUrl: "https://uploads.example.com/user/photo.png?sig=9",
      imageCalls: [
        {
          slideId: "slide_01",
          imageSlotId: "photo",
          sourcePath: "generated" as const,
          model: "gpt-image-1.5",
          requestedSize: "1024x1536",
          requestedQuality: "default",
          attemptNumber: 1,
          durationMs: 10,
          apiRequestSucceeded: true,
          imageReturned: true,
          storageSucceeded: true,
          slotResolved: true,
          retryCount: 0,
          estimatedCostUsd: 0.07,
          estimated: true,
          errorCategory: null,
          prompt: "A realistic photo of a founder",
        },
      ],
    } as CarouselGenerationMetrics;

    const saved = sanitizeGenerationMetrics(dirty);
    const blob = JSON.stringify(saved);

    expect(blob).not.toMatch(/secret sauce/i);
    expect(blob).not.toMatch(/Full blog post/i);
    expect(blob).not.toMatch(/Spoken transcript/i);
    expect(blob).not.toMatch(/Instagram caption/i);
    expect(blob).not.toMatch(/Slide headline/i);
    expect(blob).not.toMatch(/sk-secret-key/);
    expect(blob).not.toMatch(/Bearer secret/);
    expect(blob).not.toMatch(/X-Amz-Signature/);
    expect(blob).not.toMatch(/cdn\.example\.com/);
    expect(blob).not.toMatch(/uploads\.example\.com/);
    expect(blob).not.toMatch(/A realistic photo/);
    expect(saved).not.toHaveProperty("prompt");
    expect(saved).not.toHaveProperty("sourceContent");
    expect(saved).not.toHaveProperty("transcript");
    expect(saved).not.toHaveProperty("caption");
    expect(saved).not.toHaveProperty("apiKey");
    expect(saved.imageCalls[0]).not.toHaveProperty("prompt");
    expect(saved.runId).toBe("run-redact-1");
    expect(saved.aggregates.slidesGenerated).toBe(5);
  });
});
