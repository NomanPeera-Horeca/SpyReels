import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import type {
  AiStudioJobSnapshot,
  AiStudioScene,
  CreateVideoJobInput,
  CreatorPerformanceProfile,
  VideoJobStatus,
} from "./types";

export type CreatorProfileRecord = {
  id: string;
  userId: number;
  workspaceId: string;
  name: string;
  status: "draft" | "training" | "ready" | "failed";
  trainingVideoKey?: string | null;
  voiceSampleKey?: string | null;
  profile: CreatorPerformanceProfile;
  createdAt: string;
  updatedAt: string;
};

function firstRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

export async function createCreatorProfile(input: {
  userId: number;
  workspaceId: string;
  name: string;
  trainingVideoKey?: string;
  voiceSampleKey?: string;
  consentConfirmed: boolean;
  profile: CreatorPerformanceProfile;
}): Promise<CreatorProfileRecord> {
  if (!input.consentConfirmed) throw new Error("Creator consent is required");
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO ai_studio_creator_profiles
      (id, userId, workspaceId, name, status, presenterStyle, voiceProvider, avatarProvider,
       voiceId, avatarId, trainingVideoKey, voiceSampleKey, performanceProfile, consentConfirmedAt)
    VALUES
      (${id}, ${input.userId}, ${input.workspaceId}, ${input.name}, 'draft',
       ${input.profile.presenterStyle}, ${input.profile.voiceProvider}, ${input.profile.avatarProvider},
       ${input.profile.voiceId ?? null}, ${input.profile.avatarId ?? null},
       ${input.trainingVideoKey ?? null}, ${input.voiceSampleKey ?? null},
       ${JSON.stringify(input.profile)}, NOW())
  `);
  return {
    id,
    userId: input.userId,
    workspaceId: input.workspaceId,
    name: input.name,
    status: "draft",
    trainingVideoKey: input.trainingVideoKey,
    voiceSampleKey: input.voiceSampleKey,
    profile: input.profile,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export async function getCreatorProfile(params: {
  id: string;
  userId: number;
  workspaceId: string;
}): Promise<CreatorProfileRecord | null> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = firstRows<any>(await db.execute(sql`
    SELECT * FROM ai_studio_creator_profiles
    WHERE id = ${params.id} AND userId = ${params.userId} AND workspaceId = ${params.workspaceId}
    LIMIT 1
  `));
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    userId: Number(row.userId),
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    trainingVideoKey: row.trainingVideoKey,
    voiceSampleKey: row.voiceSampleKey,
    profile: typeof row.performanceProfile === "string" ? JSON.parse(row.performanceProfile) : row.performanceProfile,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function markCreatorProfileReady(input: {
  id: string;
  voiceId?: string;
  avatarId?: string;
  providerMetadata?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.execute(sql`
    UPDATE ai_studio_creator_profiles
    SET status = 'ready', voiceId = ${input.voiceId ?? null}, avatarId = ${input.avatarId ?? null},
        providerMetadata = ${JSON.stringify(input.providerMetadata ?? {})}
    WHERE id = ${input.id}
  `);
}

export async function createVideoJob(input: CreateVideoJobInput & { creatorProfileId: string }): Promise<AiStudioJobSnapshot> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const id = randomUUID();
  await db.execute(sql`
    INSERT INTO ai_studio_video_jobs
      (id, userId, workspaceId, creatorProfileId, scriptId, title, status, progress, currentStep, aspectRatio, inputPayload)
    VALUES
      (${id}, ${Number(input.userId)}, ${input.workspaceId}, ${input.creatorProfileId}, ${input.scriptId ?? null},
       ${input.title}, 'queued', 0, 'Queued', ${input.aspectRatio}, ${JSON.stringify(input)})
  `);
  for (const scene of input.scenes) {
    await db.execute(sql`
      INSERT INTO ai_studio_scenes (id, jobId, sceneOrder, sceneType, direction)
      VALUES (${scene.id}, ${id}, ${scene.order}, ${scene.type}, ${JSON.stringify(scene)})
    `);
  }
  const now = new Date().toISOString();
  return { id, status: "queued", progress: 0, currentStep: "Queued", createdAt: now, updatedAt: now };
}

export async function updateVideoJob(input: {
  id: string;
  status: VideoJobStatus;
  progress: number;
  currentStep: string;
  outputUrl?: string;
  outputKey?: string;
  error?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const terminal = input.status === "completed" || input.status === "failed" || input.status === "cancelled";
  await db.execute(sql`
    UPDATE ai_studio_video_jobs
    SET status = ${input.status}, progress = ${Math.max(0, Math.min(100, input.progress))},
        currentStep = ${input.currentStep}, outputUrl = ${input.outputUrl ?? null},
        outputKey = ${input.outputKey ?? null}, errorMessage = ${input.error ?? null},
        startedAt = COALESCE(startedAt, NOW()), completedAt = ${terminal ? new Date() : null}
    WHERE id = ${input.id}
  `);
}

export async function updateSceneResult(input: {
  jobId: string;
  sceneId: string;
  status: "queued" | "processing" | "completed" | "failed";
  voiceUrl?: string;
  presenterUrl?: string;
  brollUrl?: string;
  composedUrl?: string;
  qualityScore?: number;
  error?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.execute(sql`
    UPDATE ai_studio_scenes
    SET status = ${input.status}, voiceUrl = ${input.voiceUrl ?? null}, presenterUrl = ${input.presenterUrl ?? null},
        brollUrl = ${input.brollUrl ?? null}, composedUrl = ${input.composedUrl ?? null},
        qualityScore = ${input.qualityScore ?? null}, errorMessage = ${input.error ?? null}
    WHERE id = ${input.sceneId} AND jobId = ${input.jobId}
  `);
}

export async function getVideoJob(params: {
  id: string;
  userId: number;
  workspaceId: string;
}): Promise<AiStudioJobSnapshot | null> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = firstRows<any>(await db.execute(sql`
    SELECT id, status, progress, currentStep, outputUrl, errorMessage, createdAt, updatedAt
    FROM ai_studio_video_jobs
    WHERE id = ${params.id} AND userId = ${params.userId} AND workspaceId = ${params.workspaceId}
    LIMIT 1
  `));
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    status: row.status,
    progress: Number(row.progress),
    currentStep: row.currentStep,
    outputUrl: row.outputUrl ?? undefined,
    error: row.errorMessage ?? undefined,
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function getJobInput(jobId: string): Promise<(CreateVideoJobInput & { creatorProfileId: string }) | null> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = firstRows<any>(await db.execute(sql`SELECT inputPayload FROM ai_studio_video_jobs WHERE id = ${jobId} LIMIT 1`));
  const payload = rows[0]?.inputPayload;
  if (!payload) return null;
  return typeof payload === "string" ? JSON.parse(payload) : payload;
}

export async function getJobScenes(jobId: string): Promise<AiStudioScene[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = firstRows<any>(await db.execute(sql`
    SELECT direction FROM ai_studio_scenes WHERE jobId = ${jobId} ORDER BY sceneOrder ASC
  `));
  return rows.map(row => typeof row.direction === "string" ? JSON.parse(row.direction) : row.direction);
}
