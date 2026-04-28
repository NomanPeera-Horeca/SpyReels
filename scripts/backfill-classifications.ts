/**
 * Tier 2 classification backfill: calls `classifyTranscript` for rows that already
 * have transcripts but no `classifiedAt` (Phase 5).
 *
 * Transcripts live on:
 *   - `featured_reels.transcript` (catalog)
 *   - `transcriptions.transcript` joined by `reelId` with latest row by `MAX(id)`
 *
 * Requires `DATABASE_URL` and Anthropic/env expected by `server/_core/llm.ts`.
 *
 * Flags:
 *   --sample               100 reels max: up to 50 random from each eligible table when
 *                          `--table=both`; fewer rows if one side is sparse; fills from
 *                          what's available otherwise.
 *   --full                 all eligible rows (`classifiedAt` IS NULL, completed, nonempty)
 *   --table=reels|featured_reels|both   default `both`
 *   --limit=N              cap workload (after sampling / selection)
 *   --dry-run              log skips only; no LLM calls or DB classification writes
 *   --confirm-large-run    required for `--full` when eligible rows > 5000 (cost guard)
 *
 * Output:
 *   `--sample`: writes review file `tmp/classification-sample.txt`
 *
 * Run:
 *   npx tsx scripts/backfill-classifications.ts --sample
 *   npx tsx scripts/backfill-classifications.ts --full --confirm-large-run
 */

import * as dotenv from "dotenv";
import * as fs from "fs/promises";
import * as path from "path";
import mysql from "mysql2/promise";

import { classifyTranscript } from "../server/_core/classifyTranscript";

dotenv.config();

const CONCURRENCY = 5;
const PROGRESS_EVERY = 50;
const SAMPLE_CAP = 100;
const SAMPLE_PER_TABLE = 50;
const LARGE_THRESHOLD = 5000;
const COST_PER_CALL_USD = 0.005;

type TableName = "reels" | "featured_reels";

type Job = {
  id: number;
  shortcode: string;
  transcript: string;
  table: TableName;
};

interface ParseResult {
  mode: "sample" | "full";
  table: "reels" | "featured_reels" | "both";
  limit: number;
  dryRun: boolean;
  confirmLargeRun: boolean;
}

function parseArgs(argv: string[]): ParseResult | "help" {
  const args = argv.slice(2);
  if (
    args.includes("--help") ||
    args.includes("-h") ||
    args.length === 0
  ) {
    return "help";
  }
  const sample = args.includes("--sample");
  const full = args.includes("--full");
  if (!sample && !full) {
    console.error(
      "Provide --sample or --full (see --help)."
    );
    process.exit(1);
  }
  if (sample && full) {
    console.error(
      "Use only one of --sample or --full."
    );
    process.exit(1);
  }

  let table: ParseResult["table"] = "both";
  let limit = Infinity;
  let confirmLargeRun = false;
  for (const a of args) {
    if (a.startsWith("--table="))
      table = a.slice("--table=".length) as ParseResult["table"];
    else if (a.startsWith("--limit="))
      limit = Math.max(0, Number(a.slice("--limit=".length))) || Infinity;
    else if (a === "--confirm-large-run") confirmLargeRun = true;
  }
  if (
    table !== "reels" &&
    table !== "featured_reels" &&
    table !== "both"
  ) {
    console.error("--table must be reels, featured_reels, or both");
    process.exit(1);
  }
  return {
    mode: sample ? "sample" : "full",
    table,
    limit,
    dryRun: args.includes("--dry-run"),
    confirmLargeRun,
  };
}

function wordCount(transcript: string): number {
  return transcript.trim().split(/\s+/).filter(Boolean).length;
}

function connectPool(): mysql.Pool {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL not set");
  return mysql.createPool({
    uri: raw,
    waitForConnections: true,
    connectionLimit: 12,
    enableKeepAlive: true,
  } as mysql.PoolOptions);
}

const ELIGIBLE_FEATURED_SQL = `
  SELECT id AS id,
         reelShortcode AS shortcode,
         transcript AS transcript,
         'featured_reels' AS tbl
    FROM featured_reels
   WHERE transcriptionStatus = 'completed'
     AND classifiedAt IS NULL
     AND transcript IS NOT NULL
     AND LENGTH(TRIM(transcript)) > 0`;

const ELIGIBLE_USER_SQL = `
  SELECT r.id AS id,
         r.shortcode AS shortcode,
         t.transcript AS transcript,
         'reels' AS tbl
    FROM reels r
    INNER JOIN (
      SELECT t1.reelId AS reelId,
             MAX(t1.id) AS maxId
        FROM transcriptions t1
       WHERE t1.reelId IS NOT NULL
       GROUP BY t1.reelId
    ) latest ON latest.reelId = r.id
    INNER JOIN transcriptions t ON t.id = latest.maxId
   WHERE t.status = 'completed'
     AND r.classifiedAt IS NULL
     AND t.transcript IS NOT NULL
     AND LENGTH(TRIM(t.transcript)) > 0`;

async function countEligibleFeatured(conn: mysql.Pool): Promise<number> {
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS c
       FROM featured_reels
      WHERE transcriptionStatus = 'completed'
        AND classifiedAt IS NULL
        AND transcript IS NOT NULL
        AND LENGTH(TRIM(transcript)) > 0`
  );
  return Number(rows?.[0]?.c ?? 0);
}

async function countEligibleUser(conn: mysql.Pool): Promise<number> {
  const inner = `
    SELECT r.id
      FROM reels r
      INNER JOIN (
        SELECT t1.reelId AS reelId, MAX(t1.id) AS maxId FROM transcriptions t1 WHERE t1.reelId IS NOT NULL GROUP BY t1.reelId
      ) latest ON latest.reelId = r.id
      INNER JOIN transcriptions t ON t.id = latest.maxId
     WHERE t.status = 'completed'
       AND r.classifiedAt IS NULL
       AND t.transcript IS NOT NULL
       AND LENGTH(TRIM(t.transcript)) > 0`;
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT COUNT(*) AS c FROM (${inner}) y`
  );
  return Number(rows?.[0]?.c ?? 0);
}

async function countEligibleAll(
  conn: mysql.Pool,
  tbl: ParseResult["table"]
): Promise<number> {
  let n = 0;
  if (tbl === "both" || tbl === "featured_reels") n += await countEligibleFeatured(conn);
  if (tbl === "both" || tbl === "reels") n += await countEligibleUser(conn);
  return n;
}

async function fetchFeaturedJobs(
  conn: mysql.Pool,
  rand: boolean,
  lim?: number
): Promise<Job[]> {
  let q = `${ELIGIBLE_FEATURED_SQL} `;
  if (rand) q += ` ORDER BY RAND() `;
  else q += ` ORDER BY id ASC `;
  if (typeof lim === "number" && Number.isFinite(lim))
    q += ` LIMIT ${Math.floor(Math.max(0, lim))} `;
  const [rows] = await conn.query<mysql.RowDataPacket[]>(q);
  return rows.map((r: any) => ({
    id: r.id,
    shortcode: r.shortcode,
    transcript: r.transcript as string,
    table: "featured_reels",
  }));
}

async function fetchUserJobs(
  conn: mysql.Pool,
  rand: boolean,
  lim?: number
): Promise<Job[]> {
  let q = `${ELIGIBLE_USER_SQL} `;
  if (rand) q += ` ORDER BY RAND() `;
  else q += ` ORDER BY r.id ASC `;
  if (typeof lim === "number" && Number.isFinite(lim))
    q += ` LIMIT ${Math.floor(Math.max(0, lim))} `;
  const [rows] = await conn.query<mysql.RowDataPacket[]>(q);
  return rows.map((r: any) => ({
    id: r.id,
    shortcode: r.shortcode,
    transcript: r.transcript as string,
    table: "reels",
  }));
}

async function fetchSampleJobs(
  conn: mysql.Pool,
  tbl: ParseResult["table"]
): Promise<Job[]> {
  const out: Job[] = [];
  const wantFeatured = tbl === "both" || tbl === "featured_reels";
  const wantUser = tbl === "both" || tbl === "reels";
  if (wantFeatured) {
    out.push(...(await fetchFeaturedJobs(conn, true, SAMPLE_PER_TABLE)));
  }
  if (wantUser) {
    out.push(...(await fetchUserJobs(conn, true, SAMPLE_PER_TABLE)));
  }
  return out.slice(0, SAMPLE_CAP);
}

async function fetchFullJobs(
  conn: mysql.Pool,
  tbl: ParseResult["table"]
): Promise<Job[]> {
  const out: Job[] = [];
  if (tbl === "both" || tbl === "featured_reels") {
    out.push(...(await fetchFeaturedJobs(conn, false)));
  }
  if (tbl === "both" || tbl === "reels") {
    out.push(...(await fetchUserJobs(conn, false)));
  }
  return out;
}

type ActionKey = "make_version" | "save_inspiration" | "view_only";

type RunningTotals = {
  make_version: number;
  save_inspiration: number;
  view_only: number;
};

function bumpAction(acc: RunningTotals, a: ActionKey): void {
  acc[a]++;
}

async function selectClassification(conn: mysql.Pool, job: Job) {
  if (job.table === "featured_reels") {
    const [rows] = await conn.query<mysql.RowDataPacket[]>(
      `SELECT contentType,
              remakeabilityScore,
              suggestedAction,
              classificationReason,
              classifiedAt
         FROM featured_reels WHERE id = ? LIMIT 1`,
      [job.id]
    );
    return rows?.[0] ?? null;
  }
  const [rows] = await conn.query<mysql.RowDataPacket[]>(
    `SELECT contentType,
            remakeabilityScore,
            suggestedAction,
            classificationReason,
            classifiedAt
       FROM reels WHERE id = ? LIMIT 1`,
    [job.id]
  );
  return rows?.[0] ?? null;
}

async function selectClassifiedAt(
  conn: mysql.Pool,
  job: Job
): Promise<Date | null> {
  const row = await selectClassification(conn, job);
  const raw = row?.classifiedAt;
  return raw instanceof Date ? raw : raw ? new Date(String(raw)) : null;
}

function actionKey(s: string | null): ActionKey | null {
  if (
    s === "make_version" ||
    s === "save_inspiration" ||
    s === "view_only"
  ) {
    return s;
  }
  return null;
}

async function appendSampleEntry(
  filePath: string,
  job: Job,
  ct: unknown,
  score: unknown,
  act: unknown,
  reason: unknown,
  transcript: string
) {
  const t200 = transcript.length > 200 ? transcript.slice(0, 200) + "…" : transcript;
  await fs.appendFile(
    filePath,
    `[${job.id}] ${job.shortcode} ${String(ct ?? "")} ${String(score ?? "")} -> ${String(act ?? "")}\n` +
      `Transcript: ${t200.replace(/\s+/g, " ").trim()}\n` +
      `Reason: ${String(reason ?? "").replace(/\n/g, " ")}\n` +
      `---\n`
  );
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
  const parsed = parseArgs(process.argv);
  if (parsed === "help") {
    console.log(`Usage:
  npx tsx scripts/backfill-classifications.ts --sample [--table=both] [--limit=N] [--dry-run]
  npx tsx scripts/backfill-classifications.ts --full [--table=both] [--limit=N] [--dry-run] [--confirm-large-run]`);
    return;
  }

  const pool = connectPool();
  const eligibleCount = await countEligibleAll(pool, parsed.table);

  console.log(`Eligible rows (pre-limit): ${eligibleCount}`);

  if (parsed.mode === "full") {
    if (eligibleCount > LARGE_THRESHOLD && !parsed.confirmLargeRun) {
      console.error(
        `Eligible rows (${eligibleCount}) exceed ${LARGE_THRESHOLD}. Pass --confirm-large-run to proceed (est. $${(eligibleCount * COST_PER_CALL_USD).toFixed(2)} at $${COST_PER_CALL_USD}/call).`
      );
      await pool.end();
      process.exit(1);
    }
  }

  let jobs: Job[];
  if (parsed.mode === "sample") {
    jobs = await fetchSampleJobs(pool, parsed.table);
  } else {
    jobs = await fetchFullJobs(pool, parsed.table);
  }

  jobs = Number.isFinite(parsed.limit) ? jobs.slice(0, parsed.limit as number) : jobs;

  if (jobs.length === 0) {
    console.log("Nothing to classify. Exiting.");
    await pool.end();
    return;
  }

  const samplePath =
    parsed.mode === "sample"
      ? path.join(process.cwd(), "tmp", "classification-sample.txt")
      : null;
  if (samplePath) {
    await fs.mkdir(path.dirname(samplePath), { recursive: true });
    await fs.writeFile(
      samplePath,
      `# sample ${new Date().toISOString()}\n\n`
    );
  }

  let scanned = 0;
  let classifiedOk = 0;
  let dryRunWould = 0;
  let skippedAlready = 0;
  let skippedShort = 0;
  let errors = 0;
  let noWrite = 0;

  const contentTypeBuckets: Record<string, number> = {};
  const totals: RunningTotals = {
    make_version: 0,
    save_inspiration: 0,
    view_only: 0,
  };
  let scoreSum = 0;
  let scoreN = 0;

  let lastLogLine = "";

  const started = Date.now();

  await runPool(
    jobs,
    CONCURRENCY,
    async (job) => {
      scanned++;
      const beforeAt = await selectClassifiedAt(pool, job);
      if (beforeAt != null) {
        skippedAlready++;
        return;
      }
      const wc = wordCount(job.transcript);
      if (wc < 5) {
        skippedShort++;
        return;
      }
      try {
        if (parsed.dryRun) {
          console.log(`[dry-run] would classify ${job.table}:${job.id}`);
          dryRunWould++;
          return;
        }
        await classifyTranscript({
          transcript: job.transcript,
          reelId: job.id,
          table: job.table,
        });
        const row = await selectClassification(pool, job);
        const ca =
          row?.classifiedAt instanceof Date
            ? row.classifiedAt
            : row?.classifiedAt
              ? new Date(String(row.classifiedAt))
              : null;
        if (!ca || !row?.suggestedAction) {
          noWrite++;
          return;
        }
        classifiedOk++;
        const ct = String(row.contentType ?? "");
        contentTypeBuckets[ct] = (contentTypeBuckets[ct] ?? 0) + 1;
        if (typeof row.remakeabilityScore === "number") {
          scoreSum += row.remakeabilityScore;
          scoreN++;
        }
        const ak = actionKey(String(row.suggestedAction));
        if (ak) bumpAction(totals, ak);

        const line = `Classified ${job.table}:${job.id} -> ${ct} (score ${row.remakeabilityScore}) -> ${String(row.suggestedAction)}`;
        lastLogLine = line;

        if (samplePath) {
          await appendSampleEntry(
            samplePath,
            job,
            row.contentType,
            row.remakeabilityScore,
            row.suggestedAction,
            row.classificationReason,
            job.transcript
          );
        }
      } catch (err) {
        errors++;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[error] ${job.table}:${job.id} ${msg}`);
      }
    },
    (doneSoFar) => {
      if (doneSoFar % PROGRESS_EVERY !== 0) return;
      if (lastLogLine)
        console.log(`[${doneSoFar}/${jobs.length}] ${lastLogLine}`);
      console.log(
        `[${doneSoFar}/${jobs.length}] Running totals: make_version=${totals.make_version}, save_inspiration=${totals.save_inspiration}, view_only=${totals.view_only}`
      );
    }
  );

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

  const ctEntries = Object.entries(contentTypeBuckets).sort(
    (a, b) => b[1] - a[1]
  );
  const ctTotal = Object.values(contentTypeBuckets).reduce((a, b) => a + b, 0);
  const ctSummary =
    ctEntries
      .map(([k, v]) => {
        const pct =
          ctTotal > 0 ? `${((v / ctTotal) * 100).toFixed(1)}%` : "0%";
        return `${k}=${v} (${pct})`;
      })
      .join(", ") ||
    "(none)";
  const actionSum =
    totals.make_version + totals.save_inspiration + totals.view_only;
  const actPct = (n: number) =>
    actionSum > 0 ? `${((n / actionSum) * 100).toFixed(1)}%` : "0%";
  const avgScore =
    scoreN > 0 ? (scoreSum / scoreN).toFixed(2) : "n/a";

  console.log("\n════ Classification backfill summary ════");
  console.log(`  mode:              ${parsed.mode}`);
  console.log(`  dryRun:             ${parsed.dryRun}`);
  console.log(`  jobs scheduled:      ${jobs.length}`);
  console.log(`  scanned (workers):  ${scanned}`);
  console.log(`  classified (ok DB): ${classifiedOk}`);
  if (parsed.dryRun)
    console.log(`  dry-run would run:   ${dryRunWould}`);
  console.log(`  skipped classified: ${skippedAlready}`);
  console.log(`  skipped wc<5:      ${skippedShort}`);
  console.log(`  no classify write:  ${noWrite}`);
  console.log(`  errors:             ${errors}`);
  console.log(`  contentTypes:       ${ctSummary}`);
  console.log(`  avg score:          ${avgScore} (${scoreN} rows)`);
  console.log(
    `  actions:            make_version=${totals.make_version} (${actPct(totals.make_version)}), save_inspiration=${totals.save_inspiration} (${actPct(totals.save_inspiration)}), view_only=${totals.view_only} (${actPct(totals.view_only)})`
  );
  console.log(`  elapsed:            ${elapsedSec}s`);

  const costCalls = parsed.dryRun ? 0 : classifiedOk;
  console.log(`  ~cost (usd):       $${(costCalls * COST_PER_CALL_USD).toFixed(2)} (${parsed.dryRun ? 0 : costCalls} LLM calls @ $${COST_PER_CALL_USD})`);

  if (samplePath) {
    console.log("");
    console.log("Sample complete. Review tmp/classification-sample.txt before running --full");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
