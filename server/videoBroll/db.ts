/**
 * DB helpers for video_broll_generations (upload + transcription pipeline).
 */

import { and, eq } from "drizzle-orm";
import {
  videoBrollGenerations,
  type VideoBrollGeneration,
  type InsertVideoBrollGeneration,
} from "../../drizzle/schema";
import type {
  VideoBrollInsertionPoint,
  VideoBrollStatus,
  VideoBrollTranscript,
  VideoBrollVideoUploadStatus,
} from "../../shared/videoBroll";
import { getDb } from "../db";

export async function createVideoBrollGeneration(
  data: {
    userId?: number | null;
    workspaceId?: string | null;
    accessToken?: string | null;
    sourceVideoUrl: string;
    status?: VideoBrollStatus;
    sourceAudioUrl?: string | null;
    videoUploadStatus?: VideoBrollVideoUploadStatus | null;
  }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const values: InsertVideoBrollGeneration = {
    userId: data.userId ?? null,
    workspaceId: data.workspaceId ?? null,
    accessToken: data.accessToken ?? null,
    sourceVideoUrl: data.sourceVideoUrl,
    sourceAudioUrl: data.sourceAudioUrl ?? null,
    videoUploadStatus: data.videoUploadStatus ?? null,
    status: data.status ?? "pending",
  };
  const result = await db.insert(videoBrollGenerations).values(values);
  return result[0].insertId;
}

export async function getVideoBrollGenerationById(
  id: number
): Promise<VideoBrollGeneration | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(videoBrollGenerations)
    .where(eq(videoBrollGenerations.id, id))
    .limit(1);
  return rows[0];
}

export async function getVideoBrollGenerationForWorkspace(
  id: number,
  workspaceId: string,
  userId: number
): Promise<VideoBrollGeneration | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(videoBrollGenerations)
    .where(
      and(
        eq(videoBrollGenerations.id, id),
        eq(videoBrollGenerations.workspaceId, workspaceId),
        eq(videoBrollGenerations.userId, userId)
      )
    )
    .limit(1);
  return rows[0];
}

/** Anonymous landing preview: id + accessToken must both match. */
export async function getVideoBrollGenerationByAccessToken(
  id: number,
  accessToken: string
): Promise<VideoBrollGeneration | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(videoBrollGenerations)
    .where(
      and(
        eq(videoBrollGenerations.id, id),
        eq(videoBrollGenerations.accessToken, accessToken)
      )
    )
    .limit(1);
  return rows[0];
}

export async function updateVideoBrollGeneration(
  id: number,
  data: {
    status?: VideoBrollStatus;
    sourceVideoUrl?: string;
    sourceAudioUrl?: string | null;
    videoUploadStatus?: VideoBrollVideoUploadStatus | null;
    durationSeconds?: number | null;
    transcript?: VideoBrollTranscript | null;
    insertionPoints?: VideoBrollInsertionPoint[] | null;
    errorMessage?: string | null;
    internalErrorDetail?: string | null;
  }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .update(videoBrollGenerations)
    .set(data)
    .where(eq(videoBrollGenerations.id, id));
}
