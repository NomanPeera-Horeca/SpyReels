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
 * Viral library work, every few minutes in the worker (not restarted by web
 * deploys; downloads + ffmpeg stay off the web server), starting 30s after
 * boot. Each step is idempotent and bounded:
 *   1. copy finished research into the library (no paid calls);
 *   2. match new or changed creator strategies to topics (text AI);
 *   3. understand a few viral/rising videos (daily USD cap inside).
 * Off with VIRAL_LIBRARY_UNDERSTANDING=false.
 */
function startViralLibraryUnderstanding(): void {
  if (process.env.VIRAL_LIBRARY_UNDERSTANDING === "false") return;
  const everyMs = Math.max(60_000, Number(process.env.VIRAL_LIBRARY_UNDERSTANDING_MS ?? 5 * 60_000));
  let running = false;
  const step = async (name: string, run: () => Promise<unknown>) => {
    try {
      await run();
    } catch (error) {
      console.error(`[viralLibrary] ${name} failed`, error);
    }
  };
  const tick = () => {
    if (running || draining) return;
    running = true;
    void (async () => {
      const library = await import("../viralPosts/library");
      const topics = await import("../viralPosts/topics");
      const understanding = await import("../viralPosts/videoUnderstanding");
      await step("ingest", () => library.ingestResearchJobs({ perSource: 5 }));
      await step("profile topics", () => topics.matchProfileTopics({ maxProfiles: 10 }));
      await step("keyword bank", async () => {
        const kw = await import("../viralPosts/keywords");
        await kw.harvestDueTopics({ max: 2 });
        // Viral counts per phrase change slowly: refresh about once an hour.
        if (new Date().getUTCMinutes() < 5) await kw.refreshKeywordOutcomes();
        // Google search volume (DataForSEO): up to 1,000 phrases per tick until all are checked.
        const volume = await import("../viralPosts/searchVolume");
        await volume.refreshSearchVolumes();
        // Scoring v2 preparation (topic aliases, relevance labels): only when v2 or the experiment is switched on.
        const relevance = await import("../viralPosts/keywordRelevance");
        await relevance.prepareKeywordRelevance({ maxTopics: 2 });
      });
      await step("keyword experiment", async () => {
        // Off unless KEYWORD_EXPERIMENT_RUNNER=on and an experiment row is 'ready' or 'running'.
        const experiment = await import("../viralPosts/keywordExperiment");
        await experiment.runKeywordExperimentTick();
      });
      await step("rising recheck", async () => {
        const rising = await import("../viralPosts/risingRecheck");
        await rising.runRisingRecheck({ max: 30 });
      });
      await step("youtube channels", async () => {
        const yt = await import("../viralPosts/youtubeChannels");
        await yt.repairYouTubeLibraryCreators({ max: 40 });
      });
      await step("understanding", () => understanding.processLibraryVideos());
      await step("embeddings", async () => {
        await understanding.embedMissingVideos({ max: 50 });
        await topics.embedMissingProfiles({ max: 50 });
      });
    })()
      .catch(error => console.error("[viralLibrary] tick failed", error))
      .finally(() => {
        running = false;
      });
  };
  setInterval(tick, everyMs);
  setTimeout(tick, 30_000);
}

startViralLibraryUnderstanding();

/**
 * One-time topic fill: first search of every topic pool, 3 pools every 5
 * minutes, own loop so long searches never delay the library steps above.
 * Total cap VIRAL_TOPIC_FILL_BUDGET_USD (default $20). When every topic was
 * searched (or the cap is reached) the same loop switches to the recurring
 * topic refresh (weekly cap VIRAL_TOPIC_REFRESH_WEEKLY_USD, default $10; off
 * with VIRAL_TOPIC_REFRESH=false). Off entirely with VIRAL_TOPIC_FILL=false.
 */
function startViralTopicFill(): void {
  if (process.env.VIRAL_TOPIC_FILL === "false") return;
  const everyMs = Math.max(60_000, Number(process.env.VIRAL_TOPIC_FILL_MS ?? 5 * 60_000));
  let running = false;
  let fillFinished = false;
  const tick = () => {
    if (running || draining) return;
    running = true;
    void import("../viralPosts/topicFill")
      .then(async m => {
        if (!fillFinished) {
          const r = await m.runTopicFill({ maxPools: 3 });
          if (r.skipped === "done" || r.skipped === "budget_reached") {
            fillFinished = true;
            console.info(`[viralLibrary] fill stopped: ${r.skipped}; recurring topic refresh takes over`, r);
          } else {
            return;
          }
        }
        // After the one-time fill: search topics again on a schedule (weekly cap).
        if (process.env.VIRAL_TOPIC_REFRESH !== "false") await m.runTopicRefresh({ maxPools: 3 });
      })
      .catch(error => console.error("[viralLibrary] fill tick failed", error))
      .finally(() => {
        running = false;
      });
  };
  setInterval(tick, everyMs);
  setTimeout(tick, 90_000);
}

startViralTopicFill();

/**
 * Pre-research of the creators shown on Home (server/research/prefetch.ts):
 * 2 creators every 2 minutes, daily cap RESEARCH_PREFETCH_DAILY_MAX (default
 * 150). Off with RESEARCH_PREFETCH=false.
 */
function startResearchPrefetch(): void {
  if (process.env.RESEARCH_PREFETCH === "false") return;
  const everyMs = Math.max(60_000, Number(process.env.RESEARCH_PREFETCH_MS ?? 2 * 60_000));
  let running = false;
  const tick = () => {
    if (running || draining) return;
    running = true;
    void import("../research/prefetch")
      .then(m => m.runResearchPrefetch({ max: 2 }))
      .catch(error => console.error("[research] prefetch tick failed", error))
      .finally(() => {
        running = false;
      });
  };
  setInterval(tick, everyMs);
  setTimeout(tick, 60_000);
}

startResearchPrefetch();

process.on("SIGTERM", () => startDrain("SIGTERM"));
process.on("SIGINT", () => startDrain("SIGINT"));

run().catch((error) => {
  console.error("[durableJobs] fatal worker error", error);
  process.exitCode = 1;
});
