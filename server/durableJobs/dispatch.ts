import { enqueueDurableJob } from "./queue";
import type { PilotJobType } from "./types";

const FLAG_BY_JOB_TYPE: Record<PilotJobType, string> = {
  script_generation: "DURABLE_QUEUE_SCRIPT_ENABLED",
  remake_generation: "DURABLE_QUEUE_REMAKE_ENABLED",
  creator_discovery: "DURABLE_QUEUE_CREATOR_DISCOVERY_ENABLED",
  carousel_generation: "DURABLE_QUEUE_CAROUSEL_ENABLED",
  featured_reel_transcription: "DURABLE_QUEUE_FEATURED_TRANSCRIPTION_ENABLED",
  queue_safety_probe: "DURABLE_QUEUE_SAFETY_PROBE_ENABLED",
};

export function isPilotQueueEnabled(jobType: PilotJobType): boolean {
  return process.env[FLAG_BY_JOB_TYPE[jobType]]?.trim().toLowerCase() === "true";
}

export async function dispatchPilotJob(input: {
  jobType: PilotJobType;
  idempotencyKey: string;
  payload: unknown;
  runInline: () => Promise<void>;
  onInlineError: (error: unknown) => void;
}): Promise<"durable" | "inline"> {
  if (isPilotQueueEnabled(input.jobType)) {
    await enqueueDurableJob({
      jobType: input.jobType,
      idempotencyKey: input.idempotencyKey,
      payload: input.payload,
    });
    return "durable";
  }

  void input.runInline().catch(input.onInlineError);
  return "inline";
}
