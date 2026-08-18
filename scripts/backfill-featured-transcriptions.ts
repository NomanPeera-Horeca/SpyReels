/**
 * One-shot backfill: fills the `featured_reels.transcript*` columns
 * added in migration 0029 for every reel still in `transcriptionStatus
 * = 'pending'`. Idempotent — completed / no_speech / processing /
 * failed rows are skipped (`failed` can be retried by flipping it to
 * `pending` manually or by using `--retry-failed`).
 *
 * Pipeline per reel:
 *   1. Refetch the IG video URL by shortcode (catalog URLs go stale).
 *   2. Run Deepgram Nova-3 via the existing `transcribeReel` pipeline.
 *   3. Write transcript + segments to `featured_reels` directly —
 *      featured reels don't get rows in the per-user `transcriptions`
 *      table, the catalog owns one shared transcript.
 *
 * Terminal states:
 *   completed   — transcript + segments populated
 *   no_speech   — valid state for music/visual-only reels (empty
 *                 transcript + [], NOT counted as failure)
 *   failed      — Deepgram / network / extraction error; retry later
 *
 * Concurrency is capped at 5 (Deepgram rate limits + our single IP).
 * Progress logged every 10 completions + a final roll-up summary.
 *
 * Budget sanity check: ~3000 reels × 40 s avg × $0.0043/min Nova-3 ≈ $9
 * (budget spec said $6 at Nova-2 pricing; Nova-3 is ~50% more).
 *
 * Env required:
 *   DATABASE_URL             — MySQL connection (via .env)
 *   DEEPGRAM_API_KEY         — for transcribeReel
 *   SCRAPECREATORS_API_KEY   — for fetchReelByShortcode
 *
 * Run:
 *   npx tsx scripts/backfill-featured-transcriptions.ts
 *
 * Flags:
 *   --retry-failed    also pick up rows in `failed` state
 *   --limit=N         stop after N successful completions (for sampling)
 *   --dry-run         list what would be transcribed, don't call Deepgram
 */

import "dotenv/config";
import mysql from "mysql2/promise";
import { fetchReelByShortcode } from "../server/instagram";
import { transcribeReel } from "../server/services/transcribeReel";

const CONCURRENCY = 5;
const PROGRESS_EVERY = 10;

interface PendingRow {
  id: number;
  reelShortcode: string;
  videoUrl: string | null;
  featuredAccountId: number;
}

interface RunStats {
  attempted: number;
  completed: number;
  noSpeech: number;
  failed: number;
  skippedMissingUrl: number;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const retryFailed = args.includes("--retry-failed");
  const dryRun = args.includes("--dry-run");
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Infinity;
  const accountIdsArg = args.find((a) => a.startsWith("--account-ids="));
  const accountIds = accountIdsArg
    ? accountIdsArg
        .slice("--account-ids=".length)
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0)
    : [];
  return { retryFailed, dryRun, limit, accountIds };
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
    // Deepgram + mysql2 can sit idle for minutes during long batches.
    // Keep the socket open with an extended timeout.
    connectTimeout: 60_000,
  });
}

async function fetchPending(
  conn: mysql.Connection,
  retryFailed: boolean,
  accountIds: number[] = []
): Promise<PendingRow[]> {
  const statuses = retryFailed ? ["pending", "failed"] : ["pending"];
  const accountClause =
    accountIds.length > 0
      ? ` AND featuredAccountId IN (${accountIds.map(() => "?").join(",")})`
      : "";
  const [rows] = await conn.query(
    `SELECT id, reelShortcode, videoUrl, featuredAccountId
       FROM featured_reels
      WHERE transcriptionStatus IN (${statuses.map(() => "?").join(",")})${accountClause}
      ORDER BY id ASC`,
    [...statuses, ...accountIds]
  );
  return rows as PendingRow[];
}

async function markProcessing(
  conn: mysql.Connection,
  id: number
): Promise<void> {
  await conn.query(
    `UPDATE featured_reels SET transcriptionStatus = 'processing' WHERE id = ?`,
    [id]
  );
}

async function markCompleted(
  conn: mysql.Connection,
  id: number,
  transcript: string,
  segments: { start: number; end: number; text: string }[]
): Promise<void> {
  await conn.query(
    `UPDATE featured_reels
        SET transcriptionStatus = 'completed',
            transcript = ?,
            transcriptSegments = ?,
            transcribedAt = NOW()
      WHERE id = ?`,
    [transcript, JSON.stringify(segments), id]
  );
}

async function markNoSpeech(
  conn: mysql.Connection,
  id: number
): Promise<void> {
  await conn.query(
    `UPDATE featured_reels
        SET transcriptionStatus = 'no_speech',
            transcript = '',
            transcriptSegments = '[]',
            transcribedAt = NOW()
      WHERE id = ?`,
    [id]
  );
}

async function markFailed(
  conn: mysql.Connection,
  id: number
): Promise<void> {
  await conn.query(
    `UPDATE featured_reels SET transcriptionStatus = 'failed' WHERE id = ?`,
    [id]
  );
}

async function transcribeOne(
  conn: mysql.Connection,
  row: PendingRow,
  stats: RunStats,
  dryRun: boolean
): Promise<void> {
  stats.attempted++;
  try {
    // IG CDN URLs stored in featured_reels go stale within days, so
    // always refresh before hitting Deepgram — matches the runtime
    // behavior of runTranscription / runFeaturedReelTranscription.
    const fresh = await fetchReelByShortcode(row.reelShortcode);
    if (!fresh?.videoUrl) {
      console.warn(
        `  [${row.id}] @shortcode=${row.reelShortcode} — no fresh videoUrl; marking failed`
      );
      if (!dryRun) await markFailed(conn, row.id);
      stats.skippedMissingUrl++;
      stats.failed++;
      return;
    }

    if (dryRun) {
      console.log(`  [${row.id}] would transcribe ${row.reelShortcode}`);
      stats.completed++;
      return;
    }

    await markProcessing(conn, row.id);
    const result = await transcribeReel({
      videoUrl: fresh.videoUrl,
      shortcode: row.reelShortcode,
    });

    if (!result.success) {
      if (result.errorCode === "NO_SPEECH_DETECTED") {
        await markNoSpeech(conn, row.id);
        stats.noSpeech++;
        return;
      }
      console.warn(
        `  [${row.id}] ${row.reelShortcode} failed: ${result.errorCode} — ${result.userMessage}`
      );
      await markFailed(conn, row.id);
      stats.failed++;
      return;
    }

    await markCompleted(conn, row.id, result.transcript, result.segments);
    stats.completed++;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`  [${row.id}] ${row.reelShortcode} threw: ${msg}`);
    if (!dryRun) await markFailed(conn, row.id).catch(() => {});
    stats.failed++;
  }
}

async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
  onAfter?: (completedSoFar: number) => void
): Promise<void> {
  let cursor = 0;
  let done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      await worker(items[i], i);
      done++;
      onAfter?.(done);
    }
  });
  await Promise.all(workers);
}

async function main(): Promise<void> {
  const { retryFailed, dryRun, limit, accountIds } = parseArgs();
  const conn = await connect();
  console.log(
    `Backfill featured_reels transcripts — retryFailed=${retryFailed}, dryRun=${dryRun}, limit=${limit}, accountIds=${accountIds.length ? accountIds.join(",") : "all"}, concurrency=${CONCURRENCY}`
  );

  const pendingAll = await fetchPending(conn, retryFailed, accountIds);
  const pending = Number.isFinite(limit)
    ? pendingAll.slice(0, limit as number)
    : pendingAll;
  console.log(
    `Found ${pendingAll.length} rows eligible; processing ${pending.length}.`
  );
  if (pending.length === 0) {
    await conn.end();
    return;
  }

  const stats: RunStats = {
    attempted: 0,
    completed: 0,
    noSpeech: 0,
    failed: 0,
    skippedMissingUrl: 0,
  };
  const started = Date.now();

  await runPool(
    pending,
    CONCURRENCY,
    (row) => transcribeOne(conn, row, stats, dryRun),
    (done) => {
      if (done % PROGRESS_EVERY === 0) {
        const elapsedSec = (Date.now() - started) / 1000;
        const rate = done / Math.max(elapsedSec, 1);
        const remaining = pending.length - done;
        const etaSec = remaining / Math.max(rate, 0.0001);
        console.log(
          `… progress ${done}/${pending.length} ` +
            `(completed=${stats.completed} noSpeech=${stats.noSpeech} failed=${stats.failed}) ` +
            `@ ${rate.toFixed(2)}/s, eta ${Math.round(etaSec)}s`
        );
      }
    }
  );

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);
  console.log("\n════ Backfill summary ════");
  console.log(`  attempted:          ${stats.attempted}`);
  console.log(`  completed:          ${stats.completed}`);
  console.log(`  no_speech:          ${stats.noSpeech}`);
  console.log(`  failed:             ${stats.failed}`);
  console.log(`  skippedMissingUrl:  ${stats.skippedMissingUrl}`);
  console.log(`  elapsed:            ${elapsedSec}s`);
  await conn.end();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
