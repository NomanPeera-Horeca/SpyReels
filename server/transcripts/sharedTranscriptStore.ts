/**
 * One transcript per PUBLIC video (platform + the video's own id), shared by
 * every feature: remake, Collected, research and the viral library. A video
 * is transcribed once and every later request reuses it, so we never pay
 * Deepgram twice for the same public video.
 *
 * Only public video audio is stored here. Users' scripts, edits and remakes
 * stay in their own private tables.
 *
 * Safe before migration 0109: a missing table makes every call a no-op
 * (lookups return null, saves are skipped). Never throws into the caller.
 */
import { and, eq, sql } from "drizzle-orm";
import { sharedTranscripts } from "../../drizzle/viralLibrarySchema";
import { getDb } from "../db";

export type SharedTranscriptPlatform = "instagram" | "tiktok" | "youtube";
export type SharedTranscriptSource = "deepgram" | "youtube_captions";

export type SharedTranscript =
  | {
      status: "ok";
      transcript: string;
      segments: Array<{ start: number; end: number; text: string }>;
      durationSec: number;
      source: SharedTranscriptSource;
      /** True when only the start of a long video was transcribed. */
      partial: boolean;
    }
  | { status: "no_speech"; durationSec: number; source: SharedTranscriptSource };

const READY_RECHECK_MS = 10 * 60 * 1000;
let readyCache: { ready: boolean; at: number } | null = null;

async function ready(): Promise<NonNullable<Awaited<ReturnType<typeof getDb>>> | null> {
  const db = await getDb();
  if (!db) return null;
  if (readyCache?.ready) return db;
  if (readyCache && Date.now() - readyCache.at < READY_RECHECK_MS) return null;
  try {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'shared_transcripts'`
    )) as unknown as [Array<{ n: number | string }>];
    const ok = Number(rows?.[0]?.n ?? 0) === 1;
    readyCache = { ready: ok, at: Date.now() };
    return ok ? db : null;
  } catch {
    readyCache = { ready: false, at: Date.now() };
    return null;
  }
}

export function resetSharedTranscriptCacheForTests(): void {
  readyCache = null;
}

export function sharedTranscriptKey(platform: string, sourceId: string): {
  platform: SharedTranscriptPlatform;
  sourceId: string;
} | null {
  const p = platform.trim().toLowerCase();
  const id = sourceId.trim();
  if (!id || id.length > 128) return null;
  if (p !== "instagram" && p !== "tiktok" && p !== "youtube") return null;
  return { platform: p, sourceId: id };
}

export async function getSharedTranscript(
  platform: string,
  sourceId: string
): Promise<SharedTranscript | null> {
  const key = sharedTranscriptKey(platform, sourceId);
  if (!key) return null;
  try {
    const db = await ready();
    if (!db) return null;
    const [row] = await db
      .select()
      .from(sharedTranscripts)
      .where(and(eq(sharedTranscripts.platform, key.platform), eq(sharedTranscripts.sourceId, key.sourceId)))
      .limit(1);
    if (!row) return null;
    const source = row.source === "youtube_captions" ? "youtube_captions" : "deepgram";
    if (row.status === "no_speech") return { status: "no_speech", durationSec: row.durationSec ?? 0, source };
    if (row.status !== "ok" || !row.transcript?.trim()) return null;
    const segments = Array.isArray(row.segments)
      ? (row.segments as Array<{ start: number; end: number; text: string }>)
      : [];
    return {
      status: "ok",
      transcript: row.transcript,
      segments,
      durationSec: row.durationSec ?? 0,
      source,
      partial: Boolean(row.partial),
    };
  } catch (err) {
    console.warn("[sharedTranscripts] read_failed", {
      platform: key.platform,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export async function saveSharedTranscript(
  platform: string,
  sourceId: string,
  value: SharedTranscript
): Promise<void> {
  const key = sharedTranscriptKey(platform, sourceId);
  if (!key) return;
  try {
    const db = await ready();
    if (!db) return;
    const row = {
      platform: key.platform,
      sourceId: key.sourceId,
      status: value.status,
      transcript: value.status === "ok" ? value.transcript : null,
      segments: value.status === "ok" ? value.segments : null,
      durationSec: Math.round(value.durationSec || 0),
      source: value.source,
      partial: value.status === "ok" && value.partial ? 1 : 0,
      createdAt: new Date(),
    };
    await db
      .insert(sharedTranscripts)
      .values(row)
      .onDuplicateKeyUpdate({
        set: {
          status: row.status,
          transcript: row.transcript,
          segments: row.segments,
          durationSec: row.durationSec,
          source: row.source,
          partial: row.partial,
        },
      });
  } catch (err) {
    console.warn("[sharedTranscripts] save_failed", {
      platform: key.platform,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
