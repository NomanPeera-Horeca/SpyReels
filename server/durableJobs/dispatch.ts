import { enqueueDurableJob } from "./queue";
import type { PilotJobType } from "./types";

const FLAG_BY_JOB_TYPE: Record<PilotJobType, string> = {
  script_generation: "DURABLE_QUEUE_SCRIPT_ENABLED",
  remake_generation: "DURABLE_QUEUE_REMAKE_ENABLED",
  creator_discovery: "DURABLE_QUEUE_CREATOR_DISCOVERY_ENABLED",
  carousel_generation: "DURABLE_QUEUE_CAROUSEL_ENABLED",
  featured_reel_transcription: "DURABLE_QUEUE_FEATURED_TRANSCRIPTION_ENABLED",
  creator_radar_refresh: "DURABLE_QUEUE_CREATOR_RADAR_REFRESH_ENABLED",
  queue_safety_probe: "DURABLE_QUEUE_SAFETY_PROBE_ENABLED",
};

const ROLLOUT_PERCENT_ENV_BY_JOB_TYPE: Partial<Record<PilotJobType, string>> = {
  creator_discovery: "DURABLE_QUEUE_CREATOR_DISCOVERY_ROLLOUT_PERCENT",
  carousel_generation: "DURABLE_QUEUE_CAROUSEL_ROLLOUT_PERCENT",
};

function rolloutPercent(jobType: PilotJobType): number | null {
  const envName = ROLLOUT_PERCENT_ENV_BY_JOB_TYPE[jobType];
  if (!envName) return null;

  const raw = process.env[envName]?.trim();
  if (!raw || !/^\d+$/.test(raw)) return 0;

  const percent = Number(raw);
  return Number.isInteger(percent) && percent >= 0 && percent <= 100
    ? percent
    : 0;
}

export function stableRolloutBucket(key: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 100;
}

export function isPilotQueueEnabled(
  jobType: PilotJobType,
  rolloutKey?: string
): boolean {
  const flagValue = process.env[FLAG_BY_JOB_TYPE[jobType]]?.trim().toLowerCase();

  // Creator Radar refresh defaults ON so deploys cannot strand Queued jobs.
  // Set DURABLE_QUEUE_CREATOR_RADAR_REFRESH_ENABLED=false to force inline.
  if (jobType === "creator_radar_refresh") {
    if (flagValue === "false" || flagValue === "0" || flagValue === "off") {
      return false;
    }
    return true;
  }

  if (flagValue !== "true") {
    return false;
  }

  const percent = rolloutPercent(jobType);
  if (percent === null) return true;
  if (percent === 0 || !rolloutKey) return false;
  if (percent === 100) return true;

  return stableRolloutBucket(rolloutKey) < percent;
}

export async function dispatchPilotJob(input: {
  jobType: PilotJobType;
  idempotencyKey: string;
  payload: unknown;
  rolloutKey?: string;
  runInline: () => Promise<void>;
  onInlineError: (error: unknown) => void;
}): Promise<"durable" | "inline"> {
  if (isPilotQueueEnabled(input.jobType, input.rolloutKey)) {
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
