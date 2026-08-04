/**
 * DB helpers for persisted B-roll generations (one row per saved script).
 */

import { and, eq, inArray } from "drizzle-orm";
import {
  brollGenerations,
  type BrollGeneration,
} from "../../drizzle/schema";
import type { SuggestBrollResult } from "../../shared/broll";
import { getDb } from "../db";

export async function getBrollGenerationByScriptId(
  scriptId: number,
  workspaceId: string
): Promise<BrollGeneration | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(brollGenerations)
    .where(
      and(
        eq(brollGenerations.scriptId, scriptId),
        eq(brollGenerations.workspaceId, workspaceId)
      )
    )
    .limit(1);
  return rows[0];
}

/** Upsert full generation payload for a script (unique on scriptId). */
export async function upsertBrollGeneration(args: {
  userId: number;
  workspaceId: string;
  scriptId: number;
  result: SuggestBrollResult;
}): Promise<void> {
  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .insert(brollGenerations)
    .values({
      userId: args.userId,
      workspaceId: args.workspaceId,
      scriptId: args.scriptId,
      beatsJson: args.result,
    })
    .onDuplicateKeyUpdate({
      set: {
        userId: args.userId,
        workspaceId: args.workspaceId,
        beatsJson: args.result,
      },
    });
}

/**
 * Patch one beat's clips inside the stored SuggestBrollResult JSON.
 * No-op (returns false) when no row exists for the script.
 */
export async function updateBrollGenerationBeatClips(args: {
  scriptId: number;
  workspaceId: string;
  beatIndex: number;
  clips: SuggestBrollResult["beats"][number]["clips"];
}): Promise<boolean> {
  const existing = await getBrollGenerationByScriptId(
    args.scriptId,
    args.workspaceId
  );
  if (!existing) return false;

  const prev = existing.beatsJson;
  const next: SuggestBrollResult = {
    ...prev,
    beats: prev.beats.map((beat) =>
      beat.index === args.beatIndex ? { ...beat, clips: args.clips } : beat
    ),
  };

  const db = await getDb();
  if (!db) {
    throw new Error("Database not available");
  }

  await db
    .update(brollGenerations)
    .set({ beatsJson: next })
    .where(
      and(
        eq(brollGenerations.scriptId, args.scriptId),
        eq(brollGenerations.workspaceId, args.workspaceId)
      )
    );
  return true;
}

/** Lightweight set of scriptIds in this workspace that have saved B-roll. */
export async function listScriptIdsWithBroll(
  workspaceId: string,
  scriptIds?: number[]
): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [eq(brollGenerations.workspaceId, workspaceId)];
  if (scriptIds && scriptIds.length > 0) {
    conditions.push(inArray(brollGenerations.scriptId, scriptIds));
  }

  const rows = await db
    .select({ scriptId: brollGenerations.scriptId })
    .from(brollGenerations)
    .where(and(...conditions));

  return rows.map((r) => r.scriptId);
}
