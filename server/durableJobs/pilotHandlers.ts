import { eq } from "drizzle-orm";
import {
  carouselRemakes,
  creatorDiscoveryJobs,
  featuredReels,
  recreatedScripts,
  scriptIdeas,
} from "../../drizzle/schema";
import { createGenerationTelemetryContext } from "../carousel/generationTelemetry";
import type { CarouselGenerationEntryPoint } from "@shared/carouselGenerationMetrics";
import { generateCarouselRemake } from "../carousel/generateCarouselRemake";
import { getDb } from "../db";
import { runCreatorDiscoveryJob } from "../routers/creatorDiscoveryRouter";
import { processIdeaInBackground } from "../routers/ideasRouter";
import { runScriptGeneration } from "../routers/recreateRouter";
import { runFeaturedReelTranscription } from "../routers/_shared";
import { registerDurableJobHandler } from "./handlers";
import type { ClaimedJob } from "./types";

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
  const payload = job.payload as CarouselPayload;
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
