/**
 * Versioned carousel generation telemetry schema (Phase 0 instrumentation).
 * Persisted on carousel_remakes.generationMetricsJson.
 * Must never include prompts, source text, transcripts, slide copy, or URLs.
 */

export const CAROUSEL_GENERATION_METRICS_SCHEMA_VERSION = 1 as const;

export type CarouselGenerationMetricsSchemaVersion =
  typeof CAROUSEL_GENERATION_METRICS_SCHEMA_VERSION;

export type CarouselGenerationEntryPoint =
  | "carouselRemake.start"
  | "carouselRemake.generateFromContent"
  | "carouselRemake.generateFromSourceCarousel"
  | "carouselStudio.generateAngles"
  | "carouselStudio.generateFromInput"
  | "carouselStudio.generateCarousel"
  | "generateCarouselRemake";

export type CarouselGenerationRunStatus =
  | "in_progress"
  | "completed"
  | "failed";

export type CarouselGenerationStageName =
  | "source_resolution"
  | "source_slide_fetch"
  | "source_vision_analysis"
  | "angle_generation"
  | "slide_count_decision"
  | "visual_direction"
  | "copy_generation"
  | "image_prompt_generation"
  | "image_generation"
  | "image_storage"
  | "final_save";

export type CarouselImageSourcePath =
  | "uploaded"
  | "source"
  | "stock"
  | "generated"
  | "pool"
  | "fallback";

export type CarouselGenerationStageMetric = {
  name: CarouselGenerationStageName;
  durationMs: number;
  status: "ok" | "failed";
  occurrenceCount: number;
};

export type CarouselPhysicalLlmAttemptMetric = {
  model: string;
  attemptNumber: number;
  durationMs: number;
  success: boolean;
  errorCategory: string | null;
  fallbackOccurred: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type CarouselLogicalLlmCallMetric = {
  operation: string;
  requestedModel: string;
  actualModel: string | null;
  durationMs: number;
  success: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostUsd: number;
  estimated: boolean;
  repairIteration: number;
  physicalAttempts: CarouselPhysicalLlmAttemptMetric[];
};

export type CarouselImageSlotMetric = {
  slideId: string;
  imageSlotId: string;
  sourcePath: CarouselImageSourcePath;
  model: string | null;
  requestedSize: string | null;
  requestedQuality: string | null;
  attemptNumber: number;
  durationMs: number;
  apiRequestSucceeded: boolean;
  imageReturned: boolean;
  storageSucceeded: boolean;
  slotResolved: boolean;
  retryCount: number;
  estimatedCostUsd: number;
  estimated: boolean;
  errorCategory: string | null;
};

export type CarouselGenerationAggregates = {
  llmLogicalCallCount: number;
  llmPhysicalAttemptCount: number;
  llmBillableAttemptCount: number;
  llmInputTokens: number;
  llmOutputTokens: number;
  llmTotalTokens: number;
  llmEstimatedCostUsd: number;
  imageSlotCount: number;
  imageBillableCount: number;
  imageSlotsResolved: number;
  imageSlotsFailed: number;
  imageEstimatedCostUsd: number;
  totalEstimatedCostUsd: number;
  slidesGenerated: number | null;
};

export type CarouselGenerationMetrics = {
  schemaVersion: CarouselGenerationMetricsSchemaVersion;
  pricingVersion: string;
  runId: string;
  remakeId: number | null;
  entryPoint: CarouselGenerationEntryPoint;
  environment: string;
  codeVersion: string | null;
  startedAt: string;
  completedAt: string | null;
  failedAt: string | null;
  durationMs: number;
  status: CarouselGenerationRunStatus;
  failureStage: string | null;
  errorCategory: string | null;
  stages: CarouselGenerationStageMetric[];
  llmCalls: CarouselLogicalLlmCallMetric[];
  imageCalls: CarouselImageSlotMetric[];
  aggregates: CarouselGenerationAggregates;
};
