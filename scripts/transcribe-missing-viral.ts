/**
 * Transcribe viral library reels that lack a completed transcription.
 *
 * Target reels:
 *   viralFlag = 1 AND no row in transcriptions with status = 'completed' for that reelId.
 *
 * Per reel: UPSERT one transcription row (reuse latest non-completed row or INSERT),
 * refresh IG `videoUrl` via ScrapeCreators (`fetchReelByShortcode`, mirrors featured backfill),
 * persist fresh URL on `reels.videoUrl` only, then Deepgram Nova-3 via `transcribeReel`.
 *
 * Env:
 *   DATABASE_URL              — MySQL
 *   DEEPGRAM_API_KEY          — required except for --dry-run
 *   SCRAPECREATORS_API_KEY    — required except for --dry-run (URL refresh)
 *
 * Flags:
 *   --dry-run   print target count + first 5 (id, shortcode); no DB writes, no APIs
 *   --limit=N   process only first N targets (ORDER BY reel id ASC)
 *   --verbose   log each reel
 *
 * Run:
 *   DATABASE_URL=... DEEPGRAM_API_KEY=... SCRAPECREATORS_API_KEY=... npx tsx scripts/transcribe-missing-viral.ts
 */

import * as dotenv from "dotenv";
import type { RowDataPacket } from "mysql2";
import mysql from "mysql2/promise";
import { fetchReelByShortcode } from "../server/instagram";
import {
  transcribeReel,
  type Segment,
} from "../server/services/transcribeReel";

dotenv.config();

const TARGET_SQL = `
SELECT id, shortcode, videoUrl
  FROM reels
 WHERE viralFlag = 1
   AND id NOT IN (
         SELECT reelId FROM transcriptions
          WHERE status = 'completed' AND reelId IS NOT NULL
       )
 ORDER BY id ASC
`;

interface ViralReelRow extends RowDataPacket {
  id: number;
  shortcode: string;
  videoUrl: string | null;
}

interface CliOptions {
  dryRun: boolean;
  verbose: boolean;
  limit: number;
}

interface RunStats {
  totalTargets: number;
  successful: number;
  failed: number;
  noSpeech: number;
  urlRefreshFailed: number;
  reusedRow: number;
  insertedRow: number;
}

function parseArgs(argv: string[]): CliOptions {
  const args = argv.slice(2);
  let dryRun = false;
  let verbose = false;
  let limit = Infinity;

  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--verbose") verbose = true;
    else if (a.startsWith("--limit=")) {
      const n = Number(a.slice("--limit=".length));
      limit = Number.isFinite(n) && n >= 0 ? Math.floor(n) : Infinity;
    } else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  npx tsx scripts/transcribe-missing-viral.ts [--dry-run] [--verbose] [--limit=N]`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }

  return { dryRun, verbose, limit };
}

async function connect(): Promise<mysql.Connection> {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL not set");
  const url = new URL(raw);
  return mysql.createConnection({
    host: url.hostname,
    port: Number(url.port),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ""),
    connectTimeout: 60_000,
  });
}

async function fetchTargets(conn: mysql.Connection): Promise<ViralReelRow[]> {
  const [rows] = await conn.query<ViralReelRow[]>(TARGET_SQL);
  return rows;
}

async function findReusableTranscriptionId(
  conn: mysql.Connection,
  reelId: number
): Promise<number | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT id FROM transcriptions
      WHERE reelId = ? AND status != 'completed'
      ORDER BY id DESC
      LIMIT 1`,
    [reelId]
  );
  const id = rows[0]?.id;
  return typeof id === "number" ? id : null;
}

async function resetRowToPending(
  conn: mysql.Connection,
  transcriptionId: number
): Promise<void> {
  await conn.query(
    `UPDATE transcriptions
        SET status = 'pending',
            errorMessage = NULL,
            queuedAt = NOW(),
            updatedAt = NOW()
      WHERE id = ?`,
    [transcriptionId]
  );
}

async function insertPendingRow(
  conn: mysql.Connection,
  reelId: number
): Promise<number> {
  const [result] = await conn.query<mysql.ResultSetHeader>(
    `INSERT INTO transcriptions (reelId, featuredReelId, status, queuedAt)
     VALUES (?, NULL, 'pending', NOW())`,
    [reelId]
  );
  return result.insertId;
}

async function markCompletedOk(
  conn: mysql.Connection,
  transcriptionId: number,
  transcript: string,
  segments: Segment[]
): Promise<void> {
  await conn.query(
    `UPDATE transcriptions
        SET status = 'completed',
            transcript = ?,
            segments = ?,
            errorMessage = NULL,
            updatedAt = NOW()
      WHERE id = ?`,
    [transcript, JSON.stringify(segments), transcriptionId]
  );
}

async function markCompletedNoSpeech(
  conn: mysql.Connection,
  transcriptionId: number
): Promise<void> {
  await conn.query(
    `UPDATE transcriptions
        SET status = 'completed',
            transcript = '',
            segments = ?,
            errorMessage = 'NO_SPEECH_DETECTED',
            updatedAt = NOW()
      WHERE id = ?`,
    [JSON.stringify([]), transcriptionId]
  );
}

async function markFailed(
  conn: mysql.Connection,
  transcriptionId: number,
  errorMessage: string
): Promise<void> {
  await conn.query(
    `UPDATE transcriptions
        SET status = 'failed',
            errorMessage = ?,
            updatedAt = NOW()
      WHERE id = ?`,
    [errorMessage, transcriptionId]
  );
}

async function updateReelVideoUrl(
  conn: mysql.Connection,
  reelId: number,
  videoUrl: string
): Promise<void> {
  await conn.query(`UPDATE reels SET videoUrl = ? WHERE id = ?`, [
    videoUrl,
    reelId,
  ]);
}

async function claimOrInsertRow(
  conn: mysql.Connection,
  reelId: number,
  stats: RunStats
): Promise<number> {
  const existing = await findReusableTranscriptionId(conn, reelId);
  if (existing !== null) {
    await resetRowToPending(conn, existing);
    stats.reusedRow++;
    return existing;
  }
  stats.insertedRow++;
  return insertPendingRow(conn, reelId);
}

async function processReel(
  conn: mysql.Connection,
  reel: ViralReelRow,
  opts: { dryRun: boolean; verbose: boolean },
  stats: RunStats
): Promise<void> {
  if (opts.verbose) {
    console.log(
      `[transcribe-missing-viral] reel id=${reel.id} shortcode=${reel.shortcode}`
    );
  }

  if (opts.dryRun) return;

  let transcriptionId: number;
  try {
    transcriptionId = await claimOrInsertRow(conn, reel.id, stats);
  } catch (e) {
    console.error(`[transcribe-missing-viral] DB claim failed reel=${reel.id}`, e);
    stats.failed++;
    return;
  }

  let fresh;
  try {
    fresh = await fetchReelByShortcode(reel.shortcode);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    if (opts.verbose) {
      console.log(`  [refresh FAIL: ${reason}]`);
    }
    await markFailed(conn, transcriptionId, "URL_REFRESH_FAILED");
    stats.urlRefreshFailed++;
    return;
  }

  if (!fresh?.videoUrl) {
    const reason = fresh == null ? "no post data" : "missing videoUrl";
    if (opts.verbose) {
      console.log(`  [refresh FAIL: ${reason}]`);
    }
    await markFailed(conn, transcriptionId, "URL_REFRESH_FAILED");
    stats.urlRefreshFailed++;
    return;
  }

  if (opts.verbose) {
    console.log(`  [refresh OK]`);
  }

  await updateReelVideoUrl(conn, reel.id, fresh.videoUrl);

  const result = await transcribeReel({
    videoUrl: fresh.videoUrl,
    shortcode: reel.shortcode,
  });

  if (result.success) {
    await markCompletedOk(
      conn,
      transcriptionId,
      result.transcript,
      result.segments
    );
    stats.successful++;
    return;
  }

  if (result.errorCode === "NO_SPEECH_DETECTED") {
    await markCompletedNoSpeech(conn, transcriptionId);
    stats.noSpeech++;
    return;
  }

  const msg = `${result.errorCode}: ${result.userMessage}`;
  await markFailed(conn, transcriptionId, msg);
  stats.failed++;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const started = Date.now();

  if (!opts.dryRun && !process.env.DEEPGRAM_API_KEY) {
    throw new Error("DEEPGRAM_API_KEY is not set (required unless --dry-run)");
  }
  if (!opts.dryRun && !process.env.SCRAPECREATORS_API_KEY?.trim()) {
    throw new Error(
      "SCRAPECREATORS_API_KEY is not set (required unless --dry-run)"
    );
  }

  const conn = await connect();
  try {
    const allTargets = await fetchTargets(conn);
    const slice =
      opts.limit === Infinity
        ? allTargets
        : allTargets.slice(0, opts.limit);

    const stats: RunStats = {
      totalTargets: slice.length,
      successful: 0,
      failed: 0,
      noSpeech: 0,
      urlRefreshFailed: 0,
      reusedRow: 0,
      insertedRow: 0,
    };

    console.log(`Total target reels: ${slice.length}`);
    if (opts.dryRun) {
      console.log(
        "Dry run — no database writes, no ScrapeCreators refresh, no Deepgram."
      );
      for (let i = 0; i < Math.min(5, slice.length); i++) {
        const r = slice[i];
        console.log(`  (${r.id}, ${r.shortcode})`);
      }
    } else {
      for (const reel of slice) {
        await processReel(conn, reel, opts, stats);
      }
    }

    const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
    console.log("");
    console.log("===== transcribe-missing-viral summary =====");
    console.log(`  total targets:     ${stats.totalTargets}`);
    console.log(`  successful:        ${stats.successful}`);
    console.log(`  failed:            ${stats.failed}`);
    console.log(`  no_speech:         ${stats.noSpeech}`);
    console.log(`  url_refresh_failed: ${stats.urlRefreshFailed}`);
    if (!opts.dryRun) {
      console.log(`  reused (updated):  ${stats.reusedRow}`);
      console.log(`  inserted (new):    ${stats.insertedRow}`);
    }
    console.log(`  elapsed seconds:   ${elapsedSec}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
