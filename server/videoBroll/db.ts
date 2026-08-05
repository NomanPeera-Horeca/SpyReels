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
  data: Pick<
    InsertVideoBrollGeneration,
    "userId" | "workspaceId" | "sourceVideoUrl"
  > & {
    status?: VideoBrollStatus;
    sourceAudioUrl?: string | null;
    videoUploadStatus?: VideoBrollVideoUploadStatus | null;
  }
): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(videoBrollGenerations).values({
    userId: data.userId,
    workspaceId: data.workspaceId,
    sourceVideoUrl: data.sourceVideoUrl,
    sourceAudioUrl: data.sourceAudioUrl ?? null,
    videoUploadStatus: data.videoUploadStatus ?? null,
    status: data.status ?? "pending",
  });
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
