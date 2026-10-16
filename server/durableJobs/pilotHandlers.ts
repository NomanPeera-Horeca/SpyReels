import { eq } from "drizzle-orm";
import {
  carouselRemakes,
  creatorDiscoveryJobs,
  featuredReels,
  recreatedScripts,
  scriptIdeas,
} from "../../drizzle/schema";
import type { CarouselGenerationEntryPoint } from "@shared/carouselGenerationMetrics";
import { getDb } from "../db";
import { registerDurableJobHandler } from "./handlers";
import type { ClaimedJob } from "./types";
import { registerPersonalizationJobHandlers } from "../personalization/jobs";

type RemakePayload = {
  scriptId: number;
  userId: number;
  originalTranscript: string;
  segments: unknown;
  caption: string;
  reel: unknown;
  topic: string;
  gradeLevel: string;
  addCues: boolean;
  platformLabel: "Instagram Reel" | "TikTok video" | "YouTube Short";
};

type CarouselPayload = {
  remakeId: number;
  templateId: string;
  niche: string;
  options: Record<string, unknown>;
  telemetryEntryPoint: CarouselGenerationEntryPoint;
};

async function readStatus(
  table: typeof scriptIdeas | typeof recreatedScripts | typeof creatorDiscoveryJobs | typeof carouselRemakes | typeof featuredReels,
  id: number
): Promise<string | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select({ status: (table as any).status ?? (table as any).transcriptionStatus })
    .from(table as any)
    .where(eq((table as any).id, id))
    .limit(1);
  return rows[0]?.status == null ? null : String(rows[0].status);
}

async function requireTerminalStatus(input: {
  table: Parameters<typeof readStatus>[0];
  id: number;
  success: readonly string[];
  label: string;
}): Promise<void> {
  const status = await readStatus(input.table, input.id);
  if (!status) throw new Error(`${input.label} ${input.id} disappeared`);
  if (!input.success.includes(status)) {
    throw new Error(`${input.label} ${input.id} ended with status ${status}`);
  }
}

registerDurableJobHandler("script_generation", async (job: ClaimedJob) => {
  const { processIdeaInBackground } = await import("../routers/ideasRouter");
  const { ideaId } = job.payload as { ideaId: number };
  await processIdeaInBackground(ideaId);
  await requireTerminalStatus({
    table: scriptIdeas,
    id: ideaId,
    success: ["completed"],
    label: "Script idea",
  });
});

registerDurableJobHandler("remake_generation", async (job: ClaimedJob) => {
  const { runScriptGeneration } = await import("../routers/recreateRouter");
  const payload = job.payload as RemakePayload;
  await runScriptGeneration(
    payload.scriptId,
    payload.userId,
    payload.originalTranscript,
    payload.segments,
    payload.caption,
    payload.reel,
    payload.topic,
    payload.gradeLevel,
    payload.addCues,
    payload.platformLabel
  );
  await requireTerminalStatus({
    table: recreatedScripts,
    id: payload.scriptId,
    success: ["completed"],
    label: "Remake",
  });
});

registerDurableJobHandler("creator_discovery", async (job: ClaimedJob) => {
  const { runCreatorDiscoveryJob } = await import("../routers/creatorDiscoveryRouter");
  const payload = job.payload as {
    jobId: number;
    userId: number;
    businessDescription: string;
  };
  await runCreatorDiscoveryJob(
    payload.jobId,
    payload.userId,
    payload.businessDescription
  );
  await requireTerminalStatus({
    table: creatorDiscoveryJobs,
    id: payload.jobId,
    success: ["completed"],
    label: "Creator discovery",
  });
});

registerDurableJobHandler("carousel_generation", async (job: ClaimedJob) => {
  const [{ createGenerationTelemetryContext }, { generateCarouselRemake }] = await Promise.all([
    import("../carousel/generationTelemetry"),
    import("../carousel/generateCarouselRemake"),
  ]);
  const payload = job.payload as CarouselPayload;
  const existingStatus = await readStatus(carouselRemakes, payload.remakeId);
  if (!existingStatus) {
    throw new Error(`Carousel ${payload.remakeId} disappeared`);
  }
  if (existingStatus === "completed") {
    return;
  }

  const telemetry = createGenerationTelemetryContext({
    entryPoint: payload.telemetryEntryPoint,
  });
  if (telemetry) telemetry.remakeId = payload.remakeId;
  await generateCarouselRemake(
    payload.remakeId,
    payload.templateId,
    payload.niche,
    { ...payload.options, telemetry } as any
  );
  await requireTerminalStatus({
    table: carouselRemakes,
    id: payload.remakeId,
    success: ["completed"],
    label: "Carousel",
  });
});

registerDurableJobHandler("featured_reel_transcription", async (job: ClaimedJob) => {
  const { runFeaturedReelTranscription } = await import("../routers/_shared");
  const { reel } = job.payload as {
    reel: { id: number; shortcode: string; videoUrl: string | null };
  };
  await runFeaturedReelTranscription(reel);
  await requireTerminalStatus({
    table: featuredReels,
    id: reel.id,
    success: ["completed", "no_speech"],
    label: "Featured reel transcription",
  });
});

registerDurableJobHandler("creator_radar_refresh", async (job: ClaimedJob) => {
  const payload = job.payload as {
    platform: "instagram" | "tiktok" | "youtube";
    jobId: number;
    handle: string;
    reconciliationDays?: number;
    userId?: number;
    workspaceId?: string;
    timeframeDays?: number;
  };

  if (payload.platform === "instagram") {
    const { runResyncJob } = await import("../routers/scrapeRouter");
    await runResyncJob(
      payload.jobId,
      payload.handle,
      Number(payload.reconciliationDays ?? 30)
    );
    return;
  }

  if (!payload.workspaceId) {
    throw new Error(`creator_radar_refresh ${payload.platform} missing workspaceId`);
  }

  if (payload.platform === "tiktok") {
    const { runTikTokScrapeJob } = await import("../tiktokScrape/runJob");
    await runTikTokScrapeJob(
      payload.jobId,
      Number(payload.userId),
      payload.workspaceId,
      payload.handle,
      {
        timeframeDays: Number(payload.timeframeDays ?? 30),
        replaceExisting: true,
      }
    );
    return;
  }

  const { runYouTubeScrapeJob } = await import("../youtubeScrape/runJob");
  await runYouTubeScrapeJob(
    payload.jobId,
    Number(payload.userId),
    payload.workspaceId,
    payload.handle,
    {
      timeframeDays: Number(payload.timeframeDays ?? 30),
      replaceExisting: true,
    }
  );
});

registerDurableJobHandler("queue_safety_probe", async (job: ClaimedJob) => {
  if (process.env.DURABLE_QUEUE_SAFETY_PROBE_ENABLED !== "true") {
    throw new Error("Queue safety probes are disabled");
  }
  const payload = job.payload as { sleepMs?: number; failUntilAttempt?: number };
  const sleepMs = Math.max(0, Math.min(Number(payload.sleepMs ?? 0), 120_000));
  const failUntilAttempt = Math.max(0, Number(payload.failUntilAttempt ?? 0));
  if (sleepMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, sleepMs));
  }
  if (job.attempt <= failUntilAttempt) {
    throw new Error(`Intentional queue safety probe failure on attempt ${job.attempt}`);
  }
});

// Onboarding v2: profile analysis and Goal/Audience/Pillars recommendations.
registerPersonalizationJobHandlers();
