export const PILOT_JOB_TYPES = [
  "script_generation",
  "remake_generation",
  "creator_discovery",
  "carousel_generation",
  "featured_reel_transcription",
] as const;

export type PilotJobType = (typeof PILOT_JOB_TYPES)[number];
export type DurableJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "dead";

export type DurableJob<TPayload = unknown> = {
  id: number;
  jobType: PilotJobType;
  idempotencyKey: string;
  payload: TPayload;
  status: DurableJobStatus;
  attempt: number;
  maxAttempts: number;
  availableAt: Date;
  leaseExpiresAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type ClaimedJob<TPayload = unknown> = DurableJob<TPayload> & {
  claimToken: string;
};
