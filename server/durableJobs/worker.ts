import "dotenv/config";
import { randomUUID } from "node:crypto";
import {
  claimNextDurableJob,
  completeDurableJob,
  failDurableJob,
  heartbeatDurableJob,
  isTransientLockConflict,
  requeueDeadDurableJobByKey,
} from "./queue";
import { getDurableJobHandler } from "./handlers";
import "./pilotHandlers";

const workerId = `${process.env.RENDER_SERVICE_ID ?? "local"}:${randomUUID()}`;
const pollMs = Number(process.env.DURABLE_JOB_POLL_MS ?? 1_000);
const leaseSeconds = Number(process.env.DURABLE_JOB_LEASE_SECONDS ?? 300);
let draining = false;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function processNext(): Promise<boolean> {
  const job = await claimNextDurableJob({
    workerId,
    leaseSeconds,
    // Creator Radar refreshes are claimed by the web serial poller by default
    // so provider scrapes stay rate-limited and survive deploys independently.
    excludeJobTypes: ["creator_radar_refresh"],
  });
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

  const replayJobId = Number(
    process.env.CREATOR_DISCOVERY_CANARY_REPLAY_JOB_ID ?? 0
  );
  if (Number.isSafeInteger(replayJobId) && replayJobId > 0) {
    const replayed = await requeueDeadDurableJobByKey({
      jobType: "creator_discovery",
      idempotencyKey: `creator_discovery:${replayJobId}`,
    });
    console.info(
      `[durableJobs] creator canary replay jobId=${replayJobId} replayed=${replayed}`
    );
  }
  while (!draining) {
    try {
      const worked = await processNext();
      if (!worked) await delay(pollMs);
    } catch (error) {
      if (!isTransientLockConflict(error)) throw error;
      console.warn("[durableJobs] transient claim conflict");
      await delay(pollMs);
    }
  }
  console.info("[durableJobs] worker drained");
}

function startDrain(signal: string): void {
  if (draining) return;
  draining = true;
  console.info(`[durableJobs] received ${signal}; stopping new claims`);
}

/**
 * Viral library video understanding: a few videos every few minutes, in the
 * worker (downloads + ffmpeg stay off the web server). Daily USD cap inside.
 * Off with VIRAL_LIBRARY_UNDERSTANDING=false.
 */
function startViralLibraryUnderstanding(): void {
  if (process.env.VIRAL_LIBRARY_UNDERSTANDING === "false") return;
  const everyMs = Math.max(60_000, Number(process.env.VIRAL_LIBRARY_UNDERSTANDING_MS ?? 5 * 60_000));
  let running = false;
  const tick = () => {
    if (running || draining) return;
    running = true;
    void import("../viralPosts/videoUnderstanding")
      .then(m => m.processLibraryVideos({ maxVideos: 8 }))
      .catch(error => console.error("[viralLibrary] understanding tick failed", error))
      .finally(() => {
        running = false;
      });
  };
  setInterval(tick, everyMs);
  setTimeout(tick, 30_000);
}

startViralLibraryUnderstanding();

process.on("SIGTERM", () => startDrain("SIGTERM"));
process.on("SIGINT", () => startDrain("SIGINT"));

run().catch((error) => {
  console.error("[durableJobs] fatal worker error", error);
  process.exitCode = 1;
});
