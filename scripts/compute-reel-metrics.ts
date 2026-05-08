/**
 * One-shot backfill: fills `reels.engagementRate` and `reels.viralFlag` using SQL-derived
 * math only (no LLMs, no external HTTP).
 *
 * Formulas (fixed):
 *   engagementRate = ROUND((likeCount + commentCount) / viewCount, 4) as decimal(5,4),
 *                    or NULL when viewCount is 0 or NULL.
 *   Values above decimal(5,4) max: log warning, write NULL (see ENGAGEMENT_DECIMAL_MAX).
 *   viralFlag      = (viewCount > 5 * creator_median_views) AND (viewCount > 10000).
 *
 * Creator grouping: COALESCE(NULLIF(TRIM(ownerUsername), ''), scrape_jobs.handle) via jobId.
 *
 * Median per creator uses ROW_NUMBER() over viewCount ASC, id ASC (ties get distinct ordinals).
 * Even-sized cohorts: median is the average of the Nth and (N+1)th ordered view counts.
 *
 * IMPORTANT: `--limit=N` applies AFTER median computation. Medians always use the full `reels`
 * library joined to `scrape_jobs`. Only the number of UPDATE statements is capped.
 *
 * Requires `DATABASE_URL`.
 *
 * Flags:
 *   --dry-run        compute and log; no UPDATEs
 *   --limit=N        update at most N reels (ordered by id ASC), after full-library medians
 *   --verbose        log per-creator median map entries
 *
 * Run:
 *   npx tsx scripts/compute-reel-metrics.ts
 *   npx tsx scripts/compute-reel-metrics.ts --dry-run --verbose
 *   npx tsx scripts/compute-reel-metrics.ts --limit=500
 */

import * as dotenv from "dotenv";
import type { RowDataPacket } from "mysql2";
import mysql from "mysql2/promise";

dotenv.config();

const BATCH_SIZE = 500;
/** Maximum storable value for `reels.engagementRate` (decimal(5,4)). */
const ENGAGEMENT_DECIMAL_MAX = 9.9999;

interface CliOptions {
  dryRun: boolean;
  verbose: boolean;
  limit: number;
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
  npx tsx scripts/compute-reel-metrics.ts [--dry-run] [--verbose] [--limit=N]

  Medians always use all reels; --limit only caps how many rows receive UPDATEs.`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }

  return { dryRun, verbose, limit };
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

/** Host for logs; masks password as user:***@host */
function databaseUrlHostAndMasked(raw: string): { host: string; masked: string } {
  try {
    const u = new URL(raw);
    const host = u.hostname || "(unknown)";
    if (u.password) u.password = "***";
    const masked = u.toString();
    return { host, masked };
  } catch {
    const masked = raw.replace(/(:)([^:@/]*)(@)/, "$1***$3");
    const hostMatch = raw.match(/@([^/:?]+)/);
    const host = hostMatch?.[1] ?? "(unparsed)";
    return { host, masked };
  }
}

const MEDIAN_SQL = `
WITH keyed AS (
  SELECT
    r.id AS id,
    r.viewCount AS viewCount,
    COALESCE(NULLIF(TRIM(r.ownerUsername), ''), j.handle) AS creator_key
  FROM reels r
  INNER JOIN scrape_jobs j ON j.id = r.jobId
),
numbered AS (
  SELECT
    id,
    viewCount,
    creator_key,
    ROW_NUMBER() OVER (
      PARTITION BY creator_key
      ORDER BY viewCount ASC, id ASC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY creator_key) AS cnt
  FROM keyed
),
middles AS (
  SELECT creator_key, viewCount
  FROM numbered
  WHERE (cnt % 2 = 1 AND rn = (cnt + 1) DIV 2)
     OR (cnt % 2 = 0 AND rn IN (cnt DIV 2, cnt DIV 2 + 1))
)
SELECT creator_key, AVG(viewCount) AS median_views
FROM middles
GROUP BY creator_key
`;

type ReelRow = {
  id: number;
  viewCount: unknown;
  likeCount: number;
  commentCount: number;
  creator_key: string;
};

function computeEngagementRateDecimal(
  viewCount: unknown,
  likeCount: number,
  commentCount: number
):
  | {
      decimalString: string | null;
      nullDueToZeroViews: true;
      outOfRange: false;
    }
  | {
      decimalString: null;
      nullDueToZeroViews: false;
      outOfRange: true;
      rawRate: number;
    }
  | {
      decimalString: string;
      nullDueToZeroViews: false;
      outOfRange: false;
    } {
  if (viewCount == null) {
    return { decimalString: null, nullDueToZeroViews: true, outOfRange: false };
  }
  const vc =
    typeof viewCount === "bigint"
      ? Number(viewCount)
      : typeof viewCount === "string"
        ? Number(viewCount)
        : Number(viewCount);
  if (!Number.isFinite(vc) || vc === 0) {
    return { decimalString: null, nullDueToZeroViews: true, outOfRange: false };
  }
  const rawRate = (likeCount + commentCount) / vc;
  let normalized = rawRate;
  if (normalized < 0) normalized = 0;
  const rounded = Math.round(normalized * 10000) / 10000;
  if (rounded > ENGAGEMENT_DECIMAL_MAX) {
    return {
      decimalString: null,
      nullDueToZeroViews: false,
      outOfRange: true,
      rawRate,
    };
  }
  return {
    decimalString: rounded.toFixed(4),
    nullDueToZeroViews: false,
    outOfRange: false,
  };
}

function computeViralFlag(
  viewCount: unknown,
  medianViews: number
): boolean {
  const vc =
    viewCount == null
      ? NaN
      : typeof viewCount === "bigint"
        ? Number(viewCount)
        : typeof viewCount === "string"
          ? Number(viewCount)
          : Number(viewCount);
  if (!Number.isFinite(vc)) return false;
  return vc > 5 * medianViews && vc > 10_000;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    console.error("DATABASE_URL is not set in environment (.env).");
    process.exit(1);
  }

  const pool = connectPool();
  const started = Date.now();

  const { host, masked } = databaseUrlHostAndMasked(rawUrl);

  const [countRows] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(*) AS c FROM reels"
  );
  const totalReelsInDb = Number(countRows[0]?.c ?? 0);
  console.log(`Total reels in database: ${totalReelsInDb}`);
  console.log(`Database host: ${host}`);
  console.log(`Database URL (masked): ${masked}`);

  const [medianPackets] = await pool.query<RowDataPacket[]>(MEDIAN_SQL);
  const medianByCreator = new Map<string, number>();
  for (const row of medianPackets) {
    const key = String(row.creator_key ?? "");
    const mv = Number(row.median_views);
    if (!key || !Number.isFinite(mv)) continue;
    medianByCreator.set(key, mv);
  }

  if (opts.verbose) {
    const keys = [...medianByCreator.keys()].sort();
    console.log(`Per-creator median viewCount (${keys.length} creators):`);
    for (const k of keys) {
      console.log(`  ${k}: ${medianByCreator.get(k)}`);
    }
  }

  let fetchSql = `
SELECT r.id AS id,
       r.viewCount AS viewCount,
       r.likeCount AS likeCount,
       r.commentCount AS commentCount,
       COALESCE(NULLIF(TRIM(r.ownerUsername), ''), j.handle) AS creator_key
  FROM reels r
 INNER JOIN scrape_jobs j ON j.id = r.jobId
 ORDER BY r.id ASC`;

  const fetchParams: unknown[] = [];
  if (Number.isFinite(opts.limit)) {
    fetchSql += ` LIMIT ?`;
    fetchParams.push(opts.limit);
  }

  const [reelPackets] = await pool.query<RowDataPacket[]>(
    fetchSql,
    fetchParams
  );
  const reels = reelPackets as ReelRow[];
  const totalToProcess = reels.length;

  let engagementSet = 0;
  let engagementNullZeroViews = 0;
  let engagementOutOfRange = 0;
  let viralTrue = 0;
  let viralFalse = 0;

  type UpdatePayload = {
    id: number;
    engagementRate: string | null;
    viralFlag: boolean;
  };

  const payloads: UpdatePayload[] = [];

  for (const row of reels) {
    const ck = String(row.creator_key ?? "");
    const median = medianByCreator.get(ck);
    if (median === undefined) {
      console.warn(
        `[warn] reel id=${row.id} creator_key=${ck} missing median; skipping`
      );
      continue;
    }

    const engagement = computeEngagementRateDecimal(
      row.viewCount,
      row.likeCount,
      row.commentCount
    );
    if (engagement.outOfRange) {
      engagementOutOfRange++;
      console.warn(
        `[warn] engagementRate exceeds decimal(5,4); writing NULL | reel id=${row.id} viewCount=${String(row.viewCount)} likeCount=${row.likeCount} commentCount=${row.commentCount} rawRate=${engagement.rawRate}`
      );
    } else if (engagement.nullDueToZeroViews) engagementNullZeroViews++;
    else engagementSet++;

    const viral = computeViralFlag(row.viewCount, median);
    if (viral) viralTrue++;
    else viralFalse++;

    payloads.push({
      id: row.id,
      engagementRate: engagement.decimalString,
      viralFlag: viral,
    });
  }

  let processedInUpdates = 0;
  for (let i = 0; i < payloads.length; i += BATCH_SIZE) {
    const batch = payloads.slice(i, i + BATCH_SIZE);
    if (!opts.dryRun && batch.length > 0) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const p of batch) {
          await conn.execute(
            `UPDATE reels SET engagementRate = ?, viralFlag = ? WHERE id = ?`,
            [p.engagementRate, p.viralFlag ? 1 : 0, p.id]
          );
        }
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
    }
    processedInUpdates += batch.length;
    if (
      processedInUpdates > 0 &&
      (processedInUpdates % BATCH_SIZE === 0 ||
        processedInUpdates === payloads.length)
    ) {
      console.log(`Processed ${processedInUpdates} of ${payloads.length} reels`);
    }
  }

  const elapsedSec = ((Date.now() - started) / 1000).toFixed(1);

  console.log("");
  console.log("===== compute-reel-metrics summary =====");
  console.log(`  dryRun:                              ${opts.dryRun}`);
  console.log(`  total processed (update candidates): ${payloads.length}`);
  console.log(`  total scheduled read (limit slice):    ${totalToProcess}`);
  console.log(`  engagementRate set (non-NULL):       ${engagementSet}`);
  console.log(
    `  engagementRate NULL (zero/null views): ${engagementNullZeroViews}`
  );
  console.log(
    `  engagementRate NULL (out of range):    ${engagementOutOfRange}`
  );
  console.log(`  viralFlag true:                       ${viralTrue}`);
  console.log(`  viralFlag false:                      ${viralFalse}`);
  console.log(`  elapsed seconds:                      ${elapsedSec}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
