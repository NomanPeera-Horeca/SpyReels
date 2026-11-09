/**
 * Remake from a shared library video (Home, Viral Posts, Agent, Discovery)
 * without copying it into the user's Collected Reels (REMAKE_LIBRARY_SOURCE=on).
 *
 * A library video is a public video in viral_post_candidates. Its spoken
 * transcript is made once, from the video link, with the same downloader the
 * Collected Reels path and the public Transcript tool use, and saved against
 * the library video so everyone after the first person gets it instantly.
 * Only public spoken words are shared; drafts and typed ideas stay private.
 *
 * Needs drizzle/0117_remake_library_source.sql; without it every entry point
 * here reports "not ready" and callers keep the old path.
 */
import { sql } from "drizzle-orm";
import { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export function librarySourceEnabled(): boolean {
  return process.env.REMAKE_LIBRARY_SOURCE === "on";
}

/** A transcription stuck in "processing" this long is retried. */
const STALE_PROCESSING_MS = 15 * 60_000;
const MAX_TRANSCRIPT_CHARS = 60_000;

export type LibraryPlatform = "instagram" | "tiktok" | "youtube";

export type LibraryCandidate = {
  id: number;
  platform: LibraryPlatform;
  sourceId: string;
  sourceUrl: string;
  caption: string;
  creatorHandle: string | null;
};

export type LibraryTranscript = {
  candidateId: number;
  status: "processing" | "completed" | "failed";
  transcript: string | null;
  segments: unknown;
  errorMessage: string | null;
  startedAt: Date | null;
};

let ready: boolean | null = null;
export async function libraryTablesReady(db: Db): Promise<boolean> {
  if (ready) return true;
  try {
    const [rows] = (await db.execute(sql`
      SELECT COUNT(*) AS n FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('library_transcripts', 'library_remake_scripts')
    `)) as unknown as [Array<{ n: number }>];
    ready = Number(rows?.[0]?.n ?? 0) === 2;
  } catch {
    ready = false;
  }
  return ready;
}

export async function loadLibraryCandidate(db: Db, candidateId: number): Promise<LibraryCandidate | null> {
  const [rows] = (await db.execute(sql`
    SELECT id, platform, sourceId, sourceUrl, caption, creatorHandle
    FROM viral_post_candidates WHERE id = ${candidateId} LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>];
  const r = rows?.[0];
  if (!r) return null;
  const platform = String(r.platform);
  if (platform !== "instagram" && platform !== "tiktok" && platform !== "youtube") return null;
  return {
    id: Number(r.id),
    platform,
    sourceId: String(r.sourceId ?? ""),
    sourceUrl: String(r.sourceUrl ?? ""),
    caption: String(r.caption ?? ""),
    creatorHandle: r.creatorHandle ? String(r.creatorHandle) : null,
  };
}

function parseSegments(v: unknown): unknown {
  if (typeof v !== "string") return v ?? null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

export async function getLibraryTranscript(db: Db, candidateId: number): Promise<LibraryTranscript | null> {
  const [rows] = (await db.execute(sql`
    SELECT candidateId, status, transcript, segments, errorMessage, startedAt
    FROM library_transcripts WHERE candidateId = ${candidateId} LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>];
  const r = rows?.[0];
  if (!r) return null;
  return {
    candidateId: Number(r.candidateId),
    status: String(r.status) as LibraryTranscript["status"],
    transcript: r.transcript == null ? null : String(r.transcript),
    segments: parseSegments(r.segments),
    errorMessage: r.errorMessage == null ? null : String(r.errorMessage),
    startedAt: r.startedAt ? new Date(String(r.startedAt)) : null,
  };
}

/** Same shape the remake chain already reads from transcribe.status. Pure; exported for tests. */
export function toTranscriptionStatus(t: LibraryTranscript | null) {
  if (!t) return null;
  return {
    id: t.candidateId,
    status: t.status,
    transcript: t.transcript,
    segments: t.segments,
    errorMessage: t.errorMessage,
  };
}

/**
 * Whether a new transcription should start: never made, failed before, or
 * stuck in processing. A finished transcript or a fresh run is reused. Pure.
 */
export function shouldStartLibraryTranscription(t: LibraryTranscript | null, now = Date.now()): boolean {
  if (!t) return true;
  if (t.status === "completed") return !(t.transcript ?? "").trim();
  if (t.status === "failed") return true;
  return !t.startedAt || now - t.startedAt.getTime() > STALE_PROCESSING_MS;
}

/**
 * Claim the transcription so two people clicking Remake on the same video at
 * once start only one job. Returns true when this caller won the claim.
 */
export async function claimLibraryTranscription(db: Db, c: LibraryCandidate): Promise<boolean> {
  const affected = (res: unknown) => Number((Array.isArray(res) ? res[0] : res as { affectedRows?: number })?.affectedRows ?? 0);
  // First person: a new row.
  const inserted = await db.execute(sql`
    INSERT IGNORE INTO library_transcripts (candidateId, platform, status, attempts, startedAt)
    VALUES (${c.id}, ${c.platform}, 'processing', 1, NOW())
  `);
  if (affected(inserted) === 1) return true;
  // Existing row: take it over only when it failed, is stuck, or finished empty.
  const staleBefore = new Date(Date.now() - STALE_PROCESSING_MS);
  const updated = await db.execute(sql`
    UPDATE library_transcripts
    SET status = 'processing', attempts = attempts + 1, errorMessage = NULL, startedAt = NOW()
    WHERE candidateId = ${c.id}
      AND (status = 'failed'
        OR (status = 'processing' AND (startedAt IS NULL OR startedAt < ${staleBefore}))
        OR (status = 'completed' AND (transcript IS NULL OR transcript = '')))
  `);
  return affected(updated) === 1;
}

async function finish(db: Db, candidateId: number, ok: { transcript: string; segments: unknown } | { error: string }) {
  if ("transcript" in ok) {
    await db.execute(sql`
      UPDATE library_transcripts
      SET status = 'completed', transcript = ${ok.transcript.slice(0, MAX_TRANSCRIPT_CHARS)},
          segments = ${JSON.stringify(ok.segments ?? [])}, errorMessage = NULL, completedAt = NOW()
      WHERE candidateId = ${candidateId}
    `);
  } else {
    await db.execute(sql`
      UPDATE library_transcripts SET status = 'failed', errorMessage = ${ok.error.slice(0, 500)}
      WHERE candidateId = ${candidateId}
    `);
  }
}

/**
 * Download and transcribe one library video from its link (same downloader
 * and speech-to-text as Collected Reels). Writes the result to
 * library_transcripts. Never throws.
 */
export async function runLibraryTranscription(c: LibraryCandidate): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    const { parseCollectedVideoUrl } = await import("../socialVideoUrl");
    const parsed = await parseCollectedVideoUrl(c.sourceUrl);
    const externalId = parsed?.externalId || c.sourceId;
    const canonicalUrl = parsed?.canonicalUrl || c.sourceUrl;
    if (c.platform === "youtube") {
      const { fetchYouTubeTranscript } = await import("../youtube");
      const yt = await fetchYouTubeTranscript(canonicalUrl);
      const transcript = yt?.transcript?.trim() ?? "";
      if (!transcript) {
        await finish(db, c.id, { error: "No captions found for this YouTube video." });
        return;
      }
      await finish(db, c.id, { transcript, segments: yt?.segments ?? [] });
      return;
    }
    const { fetchCollectedReelMetadataForPlatform } = await import("../collectedReelFetch");
    const meta = await fetchCollectedReelMetadataForPlatform(c.platform, externalId, canonicalUrl);
    if (!meta.ok) {
      await finish(db, c.id, { error: meta.message || "This video isn't available anymore. It may be private or deleted." });
      return;
    }
    const videoUrl = (meta.data.videoUrl || "").trim();
    if (!videoUrl) {
      await finish(db, c.id, { error: "Could not load a playable video for this post." });
      return;
    }
    const { transcribeReel } = await import("../services/transcribeReel");
    const result = await transcribeReel({ videoUrl, shortcode: externalId });
    if (!result.success) {
      await finish(db, c.id, { error: result.userMessage });
      return;
    }
    if (!result.transcript.trim()) {
      await finish(db, c.id, { error: "No spoken audio detected in this video." });
      return;
    }
    await finish(db, c.id, { transcript: result.transcript.trim(), segments: result.segments });
  } catch (err) {
    console.warn("[remake] library_transcription_failed", {
      candidateId: c.id,
      error: err instanceof Error ? err.message : String(err),
    });
    await finish(db, c.id, { error: "Transcription failed. Try again." }).catch(() => {});
  }
}

/** Link a remake (recreated_scripts.id) to the library video it came from. */
export async function linkLibraryRemake(db: Db, scriptId: number, candidateId: number): Promise<void> {
  await db.execute(sql`
    INSERT IGNORE INTO library_remake_scripts (scriptId, candidateId) VALUES (${scriptId}, ${candidateId})
  `);
}

/**
 * The library video a pasted link points to, if the library has it (Agent box,
 * Discovery). Links not in the library keep the Collected Reels path.
 */
export async function findLibraryCandidateIdByUrl(db: Db, url: string): Promise<number | null> {
  const { parseCollectedVideoUrlSync } = await import("../socialVideoUrl");
  const parsed = parseCollectedVideoUrlSync(url);
  if (!parsed?.externalId) return null;
  const [rows] = (await db.execute(sql`
    SELECT id FROM viral_post_candidates
    WHERE platform = ${parsed.platform} AND sourceId = ${parsed.externalId}
    ORDER BY id LIMIT 1
  `)) as unknown as [Array<{ id: number }>];
  return rows?.[0]?.id != null ? Number(rows[0].id) : null;
}
