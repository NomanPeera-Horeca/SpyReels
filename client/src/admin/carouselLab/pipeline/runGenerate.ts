import { mockBuildPipelineResult } from "../mockPipeline";
import { PIPELINE_STEPS, type GenerateInput, type PipelineProgressStep, type PipelineResult } from "../types";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ProgressCallback = (step: PipelineProgressStep, index: number) => void;

/**
 * Orchestrates generate stages. Today: mock only.
 * Later: swap body for tRPC admin.carouselLab.generate while keeping progress UX.
 */
export async function runGenerate(
  input: GenerateInput,
  onProgress?: ProgressCallback
): Promise<PipelineResult> {
  for (let i = 0; i < PIPELINE_STEPS.length; i++) {
    const step = PIPELINE_STEPS[i]!;
    onProgress?.(step.id, i);
    await delay(420 + Math.floor(Math.random() * 220));
  }
  return mockBuildPipelineResult(input);
}
