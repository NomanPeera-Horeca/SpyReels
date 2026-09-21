import type { ClaimedJob, PilotJobType } from "./types";

export type DurableJobHandler = (job: ClaimedJob) => Promise<void>;

const handlers = new Map<PilotJobType, DurableJobHandler>();

export function registerDurableJobHandler(
  jobType: PilotJobType,
  handler: DurableJobHandler
): void {
  if (handlers.has(jobType)) {
    throw new Error(`Duplicate durable job handler: ${jobType}`);
  }
  handlers.set(jobType, handler);
}

export function getDurableJobHandler(jobType: PilotJobType): DurableJobHandler {
  const handler = handlers.get(jobType);
  if (!handler) throw new Error(`No durable job handler registered for ${jobType}`);
  return handler;
}

export function registeredDurableJobTypes(): PilotJobType[] {
  return [...handlers.keys()];
}
