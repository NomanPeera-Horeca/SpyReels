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
  providerMetadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

function firstRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) return result[0] as T[];
  if (Array.isArray(result)) return result as T[];
  return [];
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

export async function createCreatorProfile(input: {
  id?: string;
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
  const id = input.id ?? randomUUID();
  const normalizedProfile = { ...input.profile, creatorId: id };

  await db.execute(sql`
    INSERT INTO ai_studio_creator_profiles
      (id, userId, workspaceId, name, status, presenterStyle, voiceProvider, avatarProvider,
       voiceId, avatarId, trainingVideoKey, voiceSampleKey, performanceProfile, consentConfirmedAt)
    VALUES
      (${id}, ${input.userId}, ${input.workspaceId}, ${input.name}, 'draft',
       ${normalizedProfile.presenterStyle}, ${normalizedProfile.voiceProvider}, ${normalizedProfile.avatarProvider},
       ${normalizedProfile.voiceId ?? null}, ${normalizedProfile.avatarId ?? null},
       ${input.trainingVideoKey ?? null}, ${input.voiceSampleKey ?? null},
       ${JSON.stringify(normalizedProfile)}, NOW())
  `);

  const now = new Date().toISOString();
  return {
    id,
    userId: input.userId,
    workspaceId: input.workspaceId,
    name: input.name,
    status: "draft",
    trainingVideoKey: input.trainingVideoKey,
    voiceSampleKey: input.voiceSampleKey,
    profile: normalizedProfile,
    providerMetadata: null,
    createdAt: now,
    updatedAt: now,
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

  const storedProfile = parseJson<CreatorPerformanceProfile>(row.performanceProfile, null as never);
  const profile: CreatorPerformanceProfile = {
    ...storedProfile,
    creatorId: row.id,
    presenterStyle: row.presenterStyle,
    voiceProvider: row.voiceProvider,
    avatarProvider: row.avatarProvider,
    voiceId: row.voiceId ?? storedProfile?.voiceId,
    avatarId: row.avatarId ?? storedProfile?.avatarId,
  };

  return {
    id: row.id,
    userId: Number(row.userId),
    workspaceId: row.workspaceId,
    name: row.name,
    status: row.status,
    trainingVideoKey: row.trainingVideoKey,
    voiceSampleKey: row.voiceSampleKey,
    profile,
    providerMetadata: parseJson<Record<string, unknown> | null>(row.providerMetadata, null),
    createdAt: new Date(row.createdAt).toISOString(),
    updatedAt: new Date(row.updatedAt).toISOString(),
  };
}

export async function updateCreatorProfileAssets(input: {
  id: string;
  userId: number;
  workspaceId: string;
  trainingVideoKey?: string;
  voiceSampleKey?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!input.trainingVideoKey && !input.voiceSampleKey) return;

  if (input.trainingVideoKey) {
    await db.execute(sql`
      UPDATE ai_studio_creator_profiles
      SET trainingVideoKey = ${input.trainingVideoKey}, status = 'training'
      WHERE id = ${input.id} AND userId = ${input.userId} AND workspaceId = ${input.workspaceId}
    `);
  }
  if (input.voiceSampleKey) {
    await db.execute(sql`
      UPDATE ai_studio_creator_profiles
      SET voiceSampleKey = ${input.voiceSampleKey}, status = 'training'
      WHERE id = ${input.id} AND userId = ${input.userId} AND workspaceId = ${input.workspaceId}
    `);
  }
}

export async function markCreatorProfileReady(input: {
  id: string;
  voiceId?: string;
  avatarId?: string;
  providerMetadata?: Record<string, unknown>;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = firstRows<any>(await db.execute(sql`
    SELECT performanceProfile FROM ai_studio_creator_profiles WHERE id = ${input.id} LIMIT 1
  `));
  const current = parseJson<Record<string, unknown>>(rows[0]?.performanceProfile, {});
  const nextProfile = {
    ...current,
    ...(input.voiceId ? { voiceId: input.voiceId, voiceProvider: "elevenlabs" } : {}),
    ...(input.avatarId ? { avatarId: input.avatarId, avatarProvider: "heygen" } : {}),
  };

  await db.execute(sql`
    UPDATE ai_studio_creator_profiles
    SET status = 'ready',
        voiceId = COALESCE(${input.voiceId ?? null}, voiceId),
        avatarId = COALESCE(${input.avatarId ?? null}, avatarId),
        performanceProfile = ${JSON.stringify(nextProfile)},
        providerMetadata = ${JSON.stringify(input.providerMetadata ?? {})}
    WHERE id = ${input.id}
  `);
}

export async function markCreatorProfileFailed(input: {
  id: string;
  error: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.execute(sql`
    UPDATE ai_studio_creator_profiles
    SET status = 'failed', providerMetadata = ${JSON.stringify({ error: input.error })}
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
        currentStep = ${input.currentStep},
        outputUrl = COALESCE(${input.outputUrl ?? null}, outputUrl),
        outputKey = COALESCE(${input.outputKey ?? null}, outputKey),
        errorMessage = ${input.error ?? null},
        startedAt = COALESCE(startedAt, NOW()),
        completedAt = ${terminal ? new Date() : null}
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
    SET status = ${input.status},
        voiceUrl = COALESCE(${input.voiceUrl ?? null}, voiceUrl),
        presenterUrl = COALESCE(${input.presenterUrl ?? null}, presenterUrl),
        brollUrl = COALESCE(${input.brollUrl ?? null}, brollUrl),
        composedUrl = COALESCE(${input.composedUrl ?? null}, composedUrl),
        qualityScore = COALESCE(${input.qualityScore ?? null}, qualityScore),
        errorMessage = ${input.error ?? null}
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
  return parseJson(payload, null as never);
}

export async function getJobScenes(jobId: string): Promise<AiStudioScene[]> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = firstRows<any>(await db.execute(sql`
    SELECT direction FROM ai_studio_scenes WHERE jobId = ${jobId} ORDER BY sceneOrder ASC
  `));
  return rows.map(row => parseJson<AiStudioScene>(row.direction, null as never)).filter(Boolean);
}
