import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  claimNextDurableJob,
  completeDurableJob,
  failDurableJob,
  heartbeatDurableJob,
} from "./queue";
import { getDurableJobHandler } from "./handlers";

const workerId = `${process.env.RENDER_SERVICE_ID ?? "local"}:${randomUUID()}`;
const pollMs = Number(process.env.DURABLE_JOB_POLL_MS ?? 1_000);
const leaseSeconds = Number(process.env.DURABLE_JOB_LEASE_SECONDS ?? 300);
let draining = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processNext(): Promise<boolean> {
  const job = await claimNextDurableJob({ workerId, leaseSeconds });
  if (!job) return false;

  const heartbeat = setInterval(() => {
    void heartbeatDurableJob(job, leaseSeconds).then((owned) => {
      if (!owned) console.warn(`[durableJobs] lease lost for job ${job.id}`);
    }).catch((error) => console.error("[durableJobs] heartbeat failed", error));
  }, Math.max(5_000, Math.floor((leaseSeconds * 1_000) / 3)));

  try {
    const handler = getDurableJobHandler(job.jobType);
    await handler(job);
    const completed = await completeDurableJob(job);
    if (!completed) throw new Error("Job completed after its lease was lost");
    console.info(`[durableJobs] completed ${job.jobType} job ${job.id}`);
  } catch (error) {
    const outcome = await failDurableJob(job, error);
    console.error(`[durableJobs] ${outcome} ${job.jobType} job ${job.id}`, error);
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

async function run(): Promise<void> {
  console.info(`[durableJobs] worker started ${workerId}`);
  while (!draining) {
    const worked = await processNext();
    if (!worked) await delay(pollMs);
  }
  console.info("[durableJobs] worker drained");
}

function startDrain(signal: string): void {
  if (draining) return;
  draining = true;
  console.info(`[durableJobs] received ${signal}; stopping new claims`);
}

process.on("SIGTERM", () => startDrain("SIGTERM"));
process.on("SIGINT", () => startDrain("SIGINT"));

run().catch((error) => {
  console.error("[durableJobs] fatal worker error", error);
  process.exitCode = 1;
});
