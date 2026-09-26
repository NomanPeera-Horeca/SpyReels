import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import {
  claimNextDurableJob,
  completeDurableJob,
  countActiveDurableJobs,
  enqueueDurableJob,
  failDurableJob,
  heartbeatDurableJob,
} from "./durableJobs/queue";
import { isPilotQueueEnabled } from "./durableJobs/dispatch";
import type { ClaimedJob } from "./durableJobs/types";

type RefreshTask = () => Promise<void>;

export const MAX_QUEUED_REFRESHES = 25;

/** Lease long enough for large Creator Radar reconciliations; heartbeats renew it. */
export const CREATOR_RADAR_REFRESH_LEASE_SECONDS = 15 * 60;

let queuedRefreshes = 0;
let refreshTail: Promise<void> = Promise.resolve();
let webWorkerStarted = false;

export type CreatorRadarRefreshPlatform = "instagram" | "tiktok" | "youtube";

export type CreatorRadarRefreshPayload =
  | {
      platform: "instagram";
      jobId: number;
      handle: string;
      reconciliationDays: number;
    }
  | {
      platform: "tiktok" | "youtube";
      jobId: number;
      userId: number;
      workspaceId: string;
      handle: string;
      timeframeDays: number;
    };

export function getQueuedCreatorRadarRefreshes(): number {
  return queuedRefreshes;
}

/**
 * Provider-facing Creator Radar refreshes run serially. A user may request
 * several refreshes quickly, but we never fan them out into a provider burst.
 * Returns false when the bounded queue is full.
 */
export function enqueueCreatorRadarRefresh(task: RefreshTask): boolean {
  if (queuedRefreshes >= MAX_QUEUED_REFRESHES) return false;
  queuedRefreshes += 1;

  const run = refreshTail.then(task, task);
  refreshTail = run
    .catch((error) => {
      console.error(
        "[creator-radar-refresh] queued task failed:",
        error instanceof Error ? error.message : error
      );
    })
    .finally(() => {
      queuedRefreshes = Math.max(0, queuedRefreshes - 1);
    });

  return true;
}

function refreshBusyError(): TRPCError {
  return new TRPCError({
    code: "TOO_MANY_REQUESTS",
    message: "Too many refreshes are queued. Please try again shortly.",
  });
}

/**
 * Prefer durable_jobs so web deploys cannot strand Queued/0% scrapes in memory.
 * Falls back to the legacy in-process serial queue when the durable path is
 * explicitly disabled.
 */
export async function scheduleCreatorRadarRefresh(input: {
  payload: CreatorRadarRefreshPayload;
  runInline: () => Promise<void>;
}): Promise<"durable" | "inline"> {
  const { payload } = input;
  const idempotencyKey = `creator_radar_refresh:${payload.platform}:${payload.jobId}`;

  if (!isPilotQueueEnabled("creator_radar_refresh", idempotencyKey)) {
    const queued = enqueueCreatorRadarRefresh(input.runInline);
    if (!queued) throw refreshBusyError();
    return "inline";
  }

  const active = await countActiveDurableJobs("creator_radar_refresh");
  if (active >= MAX_QUEUED_REFRESHES) throw refreshBusyError();

  await enqueueDurableJob({
    jobType: "creator_radar_refresh",
    idempotencyKey,
    payload,
    requeueIfTerminal: true,
    maxAttempts: 2,
  });
  return "durable";
}

async function processClaimedRefreshJob(
  job: ClaimedJob,
  leaseSeconds: number
): Promise<void> {
  const heartbeat = setInterval(() => {
    void heartbeatDurableJob(job, leaseSeconds)
      .then((owned) => {
        if (!owned) {
          console.warn(
            `[creator-radar-refresh] lease lost for durable job ${job.id}`
          );
        }
      })
      .catch((error) =>
        console.error("[creator-radar-refresh] heartbeat failed", error)
      );
  }, Math.max(5_000, Math.floor((leaseSeconds * 1_000) / 3)));

  try {
    // Register handlers lazily to avoid circular imports with scrape routers.
    await import("./durableJobs/pilotHandlers");
    const { getDurableJobHandler } = await import("./durableJobs/handlers");
    const handler = getDurableJobHandler(job.jobType);
    await handler(job);
    const completed = await completeDurableJob(job);
    if (!completed) throw new Error("Job completed after its lease was lost");
    console.info(
      `[creator-radar-refresh] completed durable job ${job.id} (${job.jobType})`
    );
  } catch (error) {
    const outcome = await failDurableJob(job, error);
    console.error(
      `[creator-radar-refresh] ${outcome} durable job ${job.id}`,
      error
    );
  } finally {
    clearInterval(heartbeat);
  }
}

/**
 * Serial claim loop on the web process for creator_radar_refresh only.
 * Jobs live in durable_jobs, so a deploy drops the loop but the next boot
 * resumes pending work. Set CREATOR_RADAR_REFRESH_WEB_WORKER=false when a
 * dedicated durable worker owns this job type instead.
 */
export function startCreatorRadarRefreshWorker(): void {
  if (webWorkerStarted) return;
  if (!isPilotQueueEnabled("creator_radar_refresh")) return;
  const webWorker =
    process.env.CREATOR_RADAR_REFRESH_WEB_WORKER?.trim().toLowerCase();
  if (webWorker === "false" || webWorker === "0" || webWorker === "off") {
    console.info(
      "[creator-radar-refresh] web worker disabled; expect an external durable worker"
    );
    return;
  }

  webWorkerStarted = true;
  const workerId = `creator-radar-web:${process.env.RENDER_SERVICE_ID ?? "local"}:${randomUUID()}`;
  const pollMs = Number(process.env.CREATOR_RADAR_REFRESH_POLL_MS ?? 1_000);
  const leaseSeconds = Number(
    process.env.CREATOR_RADAR_REFRESH_LEASE_SECONDS ??
      CREATOR_RADAR_REFRESH_LEASE_SECONDS
  );
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  console.info(`[creator-radar-refresh] web worker started ${workerId}`);

  void (async () => {
    while (true) {
      try {
        const job = await claimNextDurableJob({
          workerId,
          leaseSeconds,
          includeJobTypes: ["creator_radar_refresh"],
        });
        if (!job) {
          await delay(pollMs);
          continue;
        }
        await processClaimedRefreshJob(job, leaseSeconds);
      } catch (error) {
        console.error("[creator-radar-refresh] web worker loop error", error);
        await delay(Math.max(pollMs, 5_000));
      }
    }
  })();
}
