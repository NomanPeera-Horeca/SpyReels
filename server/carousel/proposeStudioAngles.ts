import type { CarouselAngleGenerationResult } from "./generateCarouselAngles";
import { generateCarouselAngles } from "./generateCarouselAngles";
import {
  logAngleGenerationFailed,
  resolveAngleGenerationCorrelationId,
  wrapProposeStudioAnglesError,
} from "./angleGenerationObservability";

export async function proposeStudioAngles(args: {
  sourceContent: string;
  /** Explicit Customize override only. Empty means infer audience from source. */
  niche?: string;
  brandVoice?: string;
  correlationId?: string;
  entryPoint?: string;
  requiredValidBriefs?: 1 | 3;
}): Promise<CarouselAngleGenerationResult> {
  const correlationId = resolveAngleGenerationCorrelationId(args.correlationId);
  const startedAt = performance.now();
  try {
    return await generateCarouselAngles({
      sourceContent: args.sourceContent,
      niche: args.niche,
      brandVoice: args.brandVoice,
      correlationId,
      entryPoint: args.entryPoint,
      requiredValidBriefs: args.requiredValidBriefs,
    });
  } catch (err) {
    logAngleGenerationFailed({
      correlationId,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      error: err,
      operation: "angle_generation",
      requestedModel: "claude-sonnet-4-6",
    });
    wrapProposeStudioAnglesError(err);
  }
}
