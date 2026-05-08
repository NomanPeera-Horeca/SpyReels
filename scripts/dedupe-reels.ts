/**
 * SpyReels V1.3 one-shot: dedupe `reels` by `shortcode`, remap dependents, delete losers,
 * add UNIQUE index on `shortcode`.
 *
 * Locked rules:
 *   Canonical row per shortcode = MIN(id).
 *   Remap: transcriptions.reelId, recreated_scripts.reelId, saved_reels.reelId only.
 *   Multi-transcription reels after remap:
 *   If any row is completed: keep the most recent completed row (ORDER BY updatedAt DESC, id DESC),
 *   delete all other transcription rows for that reelId.
 *   If no row is completed: delete ALL transcription rows for that reelId (failed/pending only).
 *
 * MySQL quirk: DDL such as ALTER TABLE performs an implicit commit and cannot live inside the same
 * transaction as DML. Steps A through D run inside BEGIN/COMMIT. Step E runs after that transaction
 * commits successfully and after verifying there are no duplicate shortcodes left.
 *
 * Requires DATABASE_URL.
 *
 * Flags:
 *   --dry-run   print counts and planned actions only (no writes, no temp tables)
 *   --verbose   extra detail where applicable
 *
 * Run:
 *   npx tsx scripts/dedupe-reels.ts --dry-run
 *   npx tsx scripts/dedupe-reels.ts
 */

import * as dotenv from "dotenv";
import type { ResultSetHeader, RowDataPacket } from "mysql2";
import mysql from "mysql2/promise";

dotenv.config();

const UNIQ_INDEX_NAME = "uniq_shortcode";

function parseArgs(argv: string[]): { dryRun: boolean; verbose: boolean } {
  const args = argv.slice(2);
  let dryRun = false;
  let verbose = false;
  for (const a of args) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--verbose") verbose = true;
    else if (a === "--help" || a === "-h") {
      console.log(`Usage:
  npx tsx scripts/dedupe-reels.ts [--dry-run] [--verbose]`);
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return { dryRun, verbose };
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

function databaseUrlHostMasked(raw: string): { host: string; masked: string } {
  try {
    const u = new URL(raw);
    const host = u.hostname || "(unknown)";
    if (u.password) u.password = "***";
    return { host, masked: u.toString() };
  } catch {
    const masked = raw.replace(/(:)([^:@/]*)(@)/, "$1***$3");
    const hostMatch = raw.match(/@([^/:?]+)/);
    const host = hostMatch?.[1] ?? "(unparsed)";
    return { host, masked };
  }
}

async function scalarCount(
  pool: mysql.Pool,
  sql: string,
  params?: unknown[]
): Promise<number> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  const row = rows[0] as Record<string, unknown> | undefined;
  const v = row ? Object.values(row)[0] : 0;
  return Number(v ?? 0);
}

/** Duplicate reel rows (non-canonical ids). */
const SQL_DUPLICATE_REEL_COUNT = `
SELECT COUNT(*) AS c
  FROM reels r
 INNER JOIN (
       SELECT shortcode, MIN(id) AS canonical_id
         FROM reels
     GROUP BY shortcode
       ) m ON r.shortcode = m.shortcode
 WHERE r.id <> m.canonical_id
`;

const SQL_REMAP_TRANSCRIPTIONS_COUNT = `
SELECT COUNT(*) AS c
  FROM transcriptions t
 INNER JOIN reels r ON r.id = t.reelId
 INNER JOIN (
       SELECT shortcode, MIN(id) AS canonical_id
         FROM reels
     GROUP BY shortcode
       ) m ON r.shortcode = m.shortcode
 WHERE t.reelId IS NOT NULL
   AND t.reelId <> m.canonical_id
`;

const SQL_REMAP_RECREATED_COUNT = `
SELECT COUNT(*) AS c
  FROM recreated_scripts x
 INNER JOIN reels r ON r.id = x.reelId
 INNER JOIN (
       SELECT shortcode, MIN(id) AS canonical_id
         FROM reels
     GROUP BY shortcode
       ) m ON r.shortcode = m.shortcode
 WHERE x.reelId IS NOT NULL
   AND x.reelId <> m.canonical_id
`;

const SQL_REMAP_SAVED_REELS_COUNT = `
SELECT COUNT(*) AS c
  FROM saved_reels s
 INNER JOIN reels r ON r.id = s.reelId
 INNER JOIN (
       SELECT shortcode, MIN(id) AS canonical_id
         FROM reels
     GROUP BY shortcode
       ) m ON r.shortcode = m.shortcode
 WHERE s.reelId IS NOT NULL
   AND s.reelId <> m.canonical_id
`;

/** Canonical reel ids that would have multiple transcriptions after remap (dry-run grouping). */
const SQL_MULTI_TRANSCRIPTION_CANON_COUNT = `
SELECT COUNT(*) AS c
  FROM (
SELECT m.canonical_id
  FROM transcriptions t
 INNER JOIN reels r ON r.id = t.reelId
 INNER JOIN (
       SELECT shortcode, MIN(id) AS canonical_id
         FROM reels
     GROUP BY shortcode
       ) m ON r.shortcode = m.shortcode
 WHERE t.reelId IS NOT NULL
GROUP BY m.canonical_id
  HAVING COUNT(*) > 1
       ) q
`;

/** Canonical reel ids: multiple transcriptions after remap simulation, zero completed (delete all). */
const SQL_LIST_MULTI_ZERO_COMPLETED_CANON_PREMAP = `
SELECT m.canonical_id AS reelId
  FROM transcriptions t
 INNER JOIN reels r ON r.id = t.reelId
 INNER JOIN (
       SELECT shortcode, MIN(id) AS canonical_id
         FROM reels
     GROUP BY shortcode
       ) m ON r.shortcode = m.shortcode
 WHERE t.reelId IS NOT NULL
GROUP BY m.canonical_id
  HAVING COUNT(*) > 1
     AND SUM(IF(t.status = 'completed', 1, 0)) = 0
`;

/** After remap live path: reelId is canonical; multi-row reels with zero completed (delete all in Step C). */
const SQL_LIST_MULTI_ZERO_COMPLETED_AFTER_REMAP = `
SELECT reelId
  FROM transcriptions
 WHERE reelId IS NOT NULL
GROUP BY reelId
  HAVING COUNT(*) > 1
     AND SUM(IF(status = 'completed', 1, 0)) = 0
`;

/** Dry-run: transcription rows Step C would delete for zero-completed multi canon groups (delete all rows). */
const SQL_TRANSCRIPTION_DELETE_NO_COMPLETED_COUNT_PREMAP = `
WITH mapped AS (
  SELECT t.id AS tid,
         m.canonical_id AS cid,
         t.status
    FROM transcriptions t
   INNER JOIN reels r ON r.id = t.reelId
   INNER JOIN (
         SELECT shortcode, MIN(id) AS canonical_id
           FROM reels
       GROUP BY shortcode
         ) m ON r.shortcode = m.shortcode
   WHERE t.reelId IS NOT NULL
),
agg AS (
  SELECT cid AS canon_id,
         COUNT(*) AS cnt,
         SUM(IF(status = 'completed', 1, 0)) AS compl
    FROM mapped
GROUP BY cid
  HAVING COUNT(*) > 1
)
SELECT COALESCE(SUM(IF(compl = 0, cnt, 0)), 0) AS c
  FROM agg
`;

/** Dry-run: transcription rows Step C would delete when keeper applies (at least one completed per canon group). */
const SQL_TRANSCRIPTION_DELETE_KEEPER_LOSERS_COUNT_PREMAP = `
WITH mapped AS (
  SELECT t.id AS tid,
         m.canonical_id AS cid,
         t.status
    FROM transcriptions t
   INNER JOIN reels r ON r.id = t.reelId
   INNER JOIN (
         SELECT shortcode, MIN(id) AS canonical_id
           FROM reels
       GROUP BY shortcode
         ) m ON r.shortcode = m.shortcode
   WHERE t.reelId IS NOT NULL
),
agg AS (
  SELECT cid AS canon_id,
         COUNT(*) AS cnt,
         SUM(IF(status = 'completed', 1, 0)) AS compl
    FROM mapped
GROUP BY cid
  HAVING COUNT(*) > 1
)
SELECT COALESCE(SUM(IF(compl > 0, cnt - 1, 0)), 0) AS c
  FROM agg
`;

const SQL_REMAINING_DUP_SHORTCODES = `
SELECT COUNT(*) AS c
  FROM (
SELECT shortcode
  FROM reels
GROUP BY shortcode
  HAVING COUNT(*) > 1
       ) x
`;

async function uniqShortcodeIndexExists(
  pool: mysql.Pool
): Promise<boolean> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `SHOW INDEX FROM reels WHERE Key_name = ?`,
    [UNIQ_INDEX_NAME]
  );
  return rows.length > 0;
}

async function runDryRun(
  pool: mysql.Pool,
  verbose: boolean
): Promise<void> {
  const totalRows = await scalarCount(pool, "SELECT COUNT(*) AS c FROM reels");
  const uniqueShortcodes = await scalarCount(
    pool,
    "SELECT COUNT(DISTINCT shortcode) AS c FROM reels"
  );

  const dupReels = await scalarCount(pool, SQL_DUPLICATE_REEL_COUNT);
  const remapT = await scalarCount(pool, SQL_REMAP_TRANSCRIPTIONS_COUNT);
  const remapR = await scalarCount(pool, SQL_REMAP_RECREATED_COUNT);
  const remapS = await scalarCount(pool, SQL_REMAP_SAVED_REELS_COUNT);
  const multiCanon = await scalarCount(pool, SQL_MULTI_TRANSCRIPTION_CANON_COUNT);

  const delNoCompleted = await scalarCount(
    pool,
    SQL_TRANSCRIPTION_DELETE_NO_COMPLETED_COUNT_PREMAP
  );
  const delKeeperLosers = await scalarCount(
    pool,
    SQL_TRANSCRIPTION_DELETE_KEEPER_LOSERS_COUNT_PREMAP
  );
  const stepCTotalDeletes = delNoCompleted + delKeeperLosers;

  const [zeroCompletedCanonRows] = await pool.query<RowDataPacket[]>(
    SQL_LIST_MULTI_ZERO_COMPLETED_CANON_PREMAP
  );

  const idx = await uniqShortcodeIndexExists(pool);

  console.log("");
  console.log("===== dedupe-reels dry-run =====");
  console.log(`  total reels rows:              ${totalRows}`);
  console.log(`  distinct shortcodes:           ${uniqueShortcodes}`);
  console.log(`  duplicate reel rows to delete:   ${dupReels}`);
  console.log(`  transcriptions to remap:       ${remapT}`);
  console.log(`  recreated_scripts to remap:    ${remapR}`);
  console.log(`  saved_reels to remap:            ${remapS}`);
  console.log(`  multi-transcription canon reels: ${multiCanon}`);
  console.log(`  transcriptions_deleted_no_completed: ${delNoCompleted}`);
  console.log(`  transcriptions_deleted (keeper path): ${delKeeperLosers}`);
  console.log(`  transcriptions_deleted (Step C total): ${stepCTotalDeletes}`);
  console.log(`  uniq_shortcode index exists:    ${idx}`);
  console.log(
    `  Step E (ALTER): would ${idx ? "skip (already present)" : "ADD UNIQUE INDEX uniq_shortcode (shortcode)"}`
  );
  if (verbose && zeroCompletedCanonRows.length > 0) {
    console.log("");
    console.log(
      `(verbose) Canonical reelIds with multi transcription and zero completed (would delete all rows):`
    );
    console.log(
      `  ${zeroCompletedCanonRows.map((r) => String(r.reelId)).join(", ")}`
    );
  }
  if (verbose) {
    console.log("");
    console.log("(verbose) No INSERT, UPDATE, DELETE, ALTER, or temp tables executed.");
  }
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
  const { host, masked } = databaseUrlHostMasked(rawUrl);

  const totalRows = await scalarCount(pool, "SELECT COUNT(*) AS c FROM reels");
  const uniqueShortcodes = await scalarCount(
    pool,
    "SELECT COUNT(DISTINCT shortcode) AS c FROM reels"
  );

  console.log(`Total reels rows:       ${totalRows}`);
  console.log(`Distinct shortcodes:    ${uniqueShortcodes}`);
  console.log(`Database host:          ${host}`);
  console.log(`Database URL (masked): ${masked}`);

  const dupReels = await scalarCount(pool, SQL_DUPLICATE_REEL_COUNT);

  if (opts.dryRun) {
    if (dupReels === 0) {
      const idx = await uniqShortcodeIndexExists(pool);
      console.log("");
      console.log(
        "library already deduped at row level (no non-canonical duplicates)."
      );
      console.log("");
      console.log("===== dedupe-reels dry-run =====");
      console.log(`  duplicate reel rows to delete:   0`);
      console.log(`  transcriptions to remap:       0`);
      console.log(`  recreated_scripts to remap:    0`);
      console.log(`  saved_reels to remap:          0`);
      console.log(`  multi-transcription canon reels: (n/a)`);
      console.log(`  transcriptions_deleted_no_completed: 0`);
      console.log(`  transcriptions_deleted (keeper path): 0`);
      console.log(`  transcriptions_deleted (Step C total): 0`);
      console.log(`  uniq_shortcode index exists:    ${idx}`);
      console.log(
        `  Step E (ALTER): would ${idx ? "skip (already present)" : "ADD UNIQUE INDEX uniq_shortcode (shortcode)"}`
      );
      await pool.end();
      return;
    }
    await runDryRun(pool, opts.verbose);
    await pool.end();
    return;
  }

  let summary = {
    remapTranscriptions: 0,
    remapRecreated: 0,
    remapSavedReels: 0,
    transcriptionsDeletedNoCompleted: 0,
    transcriptionsDeletedKeeperLosers: 0,
    transcriptionsDeleted: 0,
    reelsDeleted: 0,
    uniqueConstraint: "no" as "yes" | "no" | "already_present",
  };

  const indexAlready = await uniqShortcodeIndexExists(pool);

  if (dupReels === 0) {
    console.log("");
    console.log(
      "library already deduped at row level (no non-canonical duplicates). Nothing to do for Steps A through D."
    );
    if (indexAlready) {
      console.log("unique constraint already present.");
      summary.uniqueConstraint = "already_present";
    } else {
      const remaining = await scalarCount(pool, SQL_REMAINING_DUP_SHORTCODES);
      if (remaining > 0) {
        console.error(
          `[error] Expected zero duplicate shortcodes before ALTER; found ${remaining}`
        );
        await pool.end();
        process.exit(1);
      }
      console.log("Adding missing uniq_shortcode index (Step E only).");
      await pool.query(
        `ALTER TABLE reels ADD UNIQUE INDEX ${UNIQ_INDEX_NAME} (shortcode)`
      );
      summary.uniqueConstraint = "yes";
    }
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log("");
    console.log("===== dedupe-reels summary =====");
    console.log(`  rows_remapped transcriptions:    0`);
    console.log(`  rows_remapped recreated_scripts: 0`);
    console.log(`  rows_remapped saved_reels:       0`);
    console.log(`  transcriptions_deleted_no_completed: 0`);
    console.log(`  transcriptions_deleted (keeper path): 0`);
    console.log(`  transcriptions_deleted (total Step C): 0`);
    console.log(`  reels_deleted:                   0`);
    console.log(`  unique_constraint_added:        ${summary.uniqueConstraint}`);
    console.log(`  elapsed seconds:                 ${elapsed}`);
    await pool.end();
    return;
  }

  const [preMultiZeroCompleted] = await pool.query<RowDataPacket[]>(
    SQL_LIST_MULTI_ZERO_COMPLETED_CANON_PREMAP
  );
  if (preMultiZeroCompleted.length > 0) {
    console.log("");
    console.log(
      `[pre-remap] Multi-transcription canonical reels with zero completed (will delete all transcription rows in Step C): ${preMultiZeroCompleted.length}`
    );
    if (opts.verbose) {
      console.log(
        `(verbose) reelIds: ${preMultiZeroCompleted.map((r) => String(r.reelId)).join(", ")}`
      );
    }
  }

  const conn = await pool.getConnection();
  let bailAfterRollbackOnly = false;
  let connReleased = false;
  const safeRelease = (): void => {
    if (!connReleased) {
      conn.release();
      connReleased = true;
    }
  };
  try {
    await conn.beginTransaction();

    console.log("");
    console.log("[Step A] Build reel_dedupe_map temporary table");
    await conn.query(`DROP TEMPORARY TABLE IF EXISTS reel_dedupe_map`);
    await conn.query(`
CREATE TEMPORARY TABLE reel_dedupe_map (
  reel_id INT NOT NULL PRIMARY KEY,
  canonical_id INT NOT NULL,
  KEY idx_canonical_id (canonical_id)
)`);
    const [insResult] = await conn.query<ResultSetHeader>(`
INSERT INTO reel_dedupe_map (reel_id, canonical_id)
SELECT r.id,
       m.canonical_id
  FROM reels r
 INNER JOIN (
       SELECT shortcode, MIN(id) AS canonical_id
         FROM reels
     GROUP BY shortcode
       ) m ON r.shortcode = m.shortcode
`);
    console.log(`  rows inserted into map: ${insResult.affectedRows}`);

    const [dupMapRows] = await conn.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS c FROM reel_dedupe_map WHERE reel_id <> canonical_id`
    );
    const dupInMap = Number(dupMapRows[0]?.c ?? 0);
    if (dupInMap === 0) {
      await conn.rollback();
      console.log(
        "library already deduped (map has no losers). Rolled back Step A temp table only."
      );
      bailAfterRollbackOnly = true;
    } else {
      console.log("");
      console.log("[Step B] Remap dependent FKs");
      const [uT] = await conn.query<ResultSetHeader>(`
UPDATE transcriptions t
 INNER JOIN reel_dedupe_map map ON t.reelId = map.reel_id
   SET t.reelId = map.canonical_id
 WHERE map.reel_id <> map.canonical_id
`);
      summary.remapTranscriptions = uT.affectedRows ?? 0;
      console.log(`  transcriptions updated: ${summary.remapTranscriptions}`);

      const [uR] = await conn.query<ResultSetHeader>(`
UPDATE recreated_scripts r
 INNER JOIN reel_dedupe_map map ON r.reelId = map.reel_id
   SET r.reelId = map.canonical_id
 WHERE map.reel_id <> map.canonical_id
`);
      summary.remapRecreated = uR.affectedRows ?? 0;
      console.log(`  recreated_scripts updated: ${summary.remapRecreated}`);

      const [uS] = await conn.query<ResultSetHeader>(`
UPDATE saved_reels s
 INNER JOIN reel_dedupe_map map ON s.reelId = map.reel_id
   SET s.reelId = map.canonical_id
 WHERE map.reel_id <> map.canonical_id
`);
      summary.remapSavedReels = uS.affectedRows ?? 0;
      console.log(`  saved_reels updated: ${summary.remapSavedReels}`);

      console.log("");
      console.log("[validate] Multi-transcription reels with zero completed after remap");
      const [afterMultiZeroCompleted] = await conn.query<RowDataPacket[]>(
        SQL_LIST_MULTI_ZERO_COMPLETED_AFTER_REMAP
      );
      console.log(`  count: ${afterMultiZeroCompleted.length}`);
      if (opts.verbose && afterMultiZeroCompleted.length > 0) {
        console.log(
          `(verbose) reelIds: ${afterMultiZeroCompleted.map((r) => String(r.reelId)).join(", ")}`
        );
      }

      console.log("");
      console.log("[Step C] Collapse duplicate transcriptions per reelId");

      console.log("  [Step C1] Delete all transcription rows for multi-row reels with zero completed");
      const [delNoComp] = await conn.query<ResultSetHeader>(`
DELETE t
  FROM transcriptions t
 INNER JOIN (
SELECT reelId
  FROM transcriptions
 WHERE reelId IS NOT NULL
GROUP BY reelId
  HAVING COUNT(*) > 1
     AND SUM(IF(status = 'completed', 1, 0)) = 0
       ) z ON z.reelId = t.reelId
`);
      summary.transcriptionsDeletedNoCompleted = delNoComp.affectedRows ?? 0;
      console.log(`  rows deleted (no completed): ${summary.transcriptionsDeletedNoCompleted}`);

      console.log("  [Step C2] Keep most recent completed per remaining multi-row reel");
      await conn.query(`DROP TEMPORARY TABLE IF EXISTS transcription_keepers`);
      await conn.query(`
CREATE TEMPORARY TABLE transcription_keepers (
  reel_id INT NOT NULL PRIMARY KEY,
  keeper_transcription_id INT NOT NULL
)`);
      const [insK] = await conn.query<ResultSetHeader>(`
INSERT INTO transcription_keepers (reel_id, keeper_transcription_id)
SELECT reelId,
       id
  FROM (
SELECT reelId,
       id,
       ROW_NUMBER() OVER (
         PARTITION BY reelId
             ORDER BY updatedAt DESC, id DESC
       ) AS rn
  FROM transcriptions
 WHERE reelId IS NOT NULL
   AND status = 'completed'
       ) x
 WHERE rn = 1
   AND reelId IN (
SELECT reelId
  FROM transcriptions
 WHERE reelId IS NOT NULL
GROUP BY reelId
  HAVING COUNT(*) > 1
       )
`);
      console.log(`  keeper rows inserted: ${insK.affectedRows}`);

      const [delT] = await conn.query<ResultSetHeader>(`
DELETE t
  FROM transcriptions t
 INNER JOIN (
SELECT reelId
  FROM transcriptions
 WHERE reelId IS NOT NULL
GROUP BY reelId
  HAVING COUNT(*) > 1
       ) multi ON multi.reelId = t.reelId
  LEFT JOIN transcription_keepers k
    ON k.reel_id = t.reelId
   AND k.keeper_transcription_id = t.id
 WHERE k.keeper_transcription_id IS NULL
`);
      summary.transcriptionsDeletedKeeperLosers = delT.affectedRows ?? 0;
      summary.transcriptionsDeleted =
        summary.transcriptionsDeletedNoCompleted +
        summary.transcriptionsDeletedKeeperLosers;
      console.log(`  rows deleted (keeper path): ${summary.transcriptionsDeletedKeeperLosers}`);
      console.log(`  transcriptions deleted (Step C total): ${summary.transcriptionsDeleted}`);

      console.log("");
      console.log("[Step D] Delete duplicate reels rows");
      const [delR] = await conn.query<ResultSetHeader>(`
DELETE r
  FROM reels r
 INNER JOIN reel_dedupe_map map ON r.id = map.reel_id
 WHERE map.reel_id <> map.canonical_id
`);
      summary.reelsDeleted = delR.affectedRows ?? 0;
      console.log(`  reels deleted: ${summary.reelsDeleted}`);

      await conn.commit();
      console.log("");
      console.log("Transaction committed (Steps A through D).");
    }
  } catch (err) {
    await conn.rollback();
    console.error("Transaction rolled back due to error.");
    throw err;
  } finally {
    safeRelease();
  }

  if (bailAfterRollbackOnly) {
    await pool.end();
    return;
  }

  const remainingDup = await scalarCount(pool, SQL_REMAINING_DUP_SHORTCODES);
  if (remainingDup > 0) {
    console.error(
      `[error] Duplicate shortcodes remain (${remainingDup}); refusing ALTER TABLE`
    );
    await pool.end();
    process.exit(1);
  }

  console.log("");
  console.log("[Step E] UNIQUE index on shortcode (outside transaction)");
  if (await uniqShortcodeIndexExists(pool)) {
    console.log("unique constraint already present. Skipping ALTER TABLE.");
    summary.uniqueConstraint = "already_present";
  } else {
    await pool.query(
      `ALTER TABLE reels ADD UNIQUE INDEX ${UNIQ_INDEX_NAME} (shortcode)`
    );
    summary.uniqueConstraint = "yes";
    console.log(`ALTER TABLE added index ${UNIQ_INDEX_NAME}.`);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log("");
  console.log("===== dedupe-reels summary =====");
  console.log(`  rows_remapped transcriptions:    ${summary.remapTranscriptions}`);
  console.log(`  rows_remapped recreated_scripts: ${summary.remapRecreated}`);
  console.log(`  rows_remapped saved_reels:       ${summary.remapSavedReels}`);
  console.log(`  transcriptions_deleted_no_completed: ${summary.transcriptionsDeletedNoCompleted}`);
  console.log(`  transcriptions_deleted (keeper path): ${summary.transcriptionsDeletedKeeperLosers}`);
  console.log(`  transcriptions_deleted (total Step C): ${summary.transcriptionsDeleted}`);
  console.log(`  reels_deleted:                   ${summary.reelsDeleted}`);
  console.log(`  unique_constraint_added:        ${summary.uniqueConstraint}`);
  console.log(`  elapsed seconds:                 ${elapsed}`);

  if (opts.verbose) {
    console.log("");
    console.log("(verbose) Step E ran after commit due to MySQL DDL implicit commit behavior.");
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
