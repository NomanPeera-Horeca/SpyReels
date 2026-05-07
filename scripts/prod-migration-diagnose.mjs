/**
 * One off PRODUCTION read only diagnostics (Phase A).
 * Do not commit DATABASE_URL. Run locally:
 *   DATABASE_URL="mysql://..." node scripts/prod-migration-diagnose.mjs
 *
 * Expects production host to be maglev.proxy.rlwy.net (not shinkansen, staging).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const PROD_HOST_HINT = "maglev.proxy.rlwy.net";
const STAGING_HOST_HINT = "shinkansen.proxy.rlwy.net";

/** Column names that should exist if migrations through 0032 are applied (see drizzle/ + schema.ts). */
const EXPECTED = {
  transcriptions: [
    "featuredReelId", // 0028
    "queuedAt", // 0032
    "startedAt", // 0032
  ],
  scrape_jobs: [
    "currentStep", // 0021
    "reelsFound",
    "estimatedTotal",
    "progressPercent",
    "classifiedNicheSlug", // 0023
    "classifiedConfidence",
    "classifiedAt",
    "failureReason", // 0031
  ],
  featured_accounts: [
    "bestPostingHour", // 0030
    "bestPostingDay", // 0030
  ],
  featured_reels: [
    "transcriptionStatus", // 0029
    "transcript",
    "transcriptSegments",
    "transcribedAt",
  ],
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getFields(describeRows) {
  return describeRows.map((row) => row.Field);
}

function missingExpected(actualFields, tableName) {
  const want = EXPECTED[tableName];
  if (!want) return [];
  return want.filter((c) => !actualFields.includes(c));
}

function inferPendingFromGaps() {
  const lines = [];
  lines.push("Heuristic: missing columns suggest these migration files may not be applied yet:");
  lines.push("  0021_scrape_progress.sql     if scrape_jobs missing currentStep, reelsFound, estimatedTotal, progressPercent");
  lines.push("  0023_classify_cache.sql     if scrape_jobs missing classifiedNicheSlug, classifiedConfidence, classifiedAt");
  lines.push("  0028_featured_reel_columns.sql  if transcriptions missing featuredReelId (also recreated_scripts, saved_reels)");
  lines.push("  0029_featured_reel_transcription_cache.sql  if featured_reels missing transcriptionStatus, transcript, transcriptSegments, transcribedAt");
  lines.push("  0030_featured_accounts_posting_time.sql  if featured_accounts missing bestPostingHour, bestPostingDay");
  lines.push("  0031_scrape_jobs_failure_reason.sql  if scrape_jobs missing failureReason");
  lines.push("  0032_transcriptions_queue_timestamps.sql  if transcriptions missing queuedAt, startedAt");
  lines.push("Note: hookAnalysis in schema is on `reels` and `transcriptions`, not on featured_reels.");
  lines.push("Note: postsAtHourCounts is not in current schema.ts; 0030 adds bestPostingHour, bestPostingDay only.");
  return lines.join("\n");
}

function listLocalMigrationSqlFiles() {
  const d = path.join(REPO_ROOT, "drizzle");
  return fs
    .readdirSync(d)
    .filter((f) => f.endsWith(".sql") && /^\d{4}_/.test(f))
    .sort();
}

async function main() {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr || !String(urlStr).trim()) {
    console.error("Set DATABASE_URL to the production MySQL connection string, then re-run.");
    process.exit(1);
  }
  let u;
  try {
    u = new URL(urlStr);
  } catch (e) {
    console.error("Invalid DATABASE_URL:", e?.message || e);
    process.exit(1);
  }
  await run(u, urlStr);
}

async function run(u, urlStr) {
  const host = u.hostname;
  const dbName = u.pathname.replace(/^\//, "").split("?")[0] || "(unknown)";

  console.log("========== connection ==========");
  console.log("Host (from URL):", host);
  console.log("Database name:", dbName);
  if (host.includes(STAGING_HOST_HINT)) {
    console.error(
      "\n*** ABORT: host looks like STAGING (shinkansen). Use production (maglev) only. ***\n"
    );
    process.exit(1);
  }
  if (!host.includes(PROD_HOST_HINT)) {
    console.warn("WARNING: host is not the expected production pattern " + PROD_HOST_HINT);
    console.warn("Double check you are not pointing at staging or a dev DB.\n");
  } else {
    console.log("Host matches expected production pattern (maglev).");
  }

  console.log("\nPausing 3 seconds. Ctrl+C to abort...\n");
  await sleep(3000);

  // mysql2 accepts a mysql:// string (see ConnectionConfig.parseUrl).
  const conn = await mysql.createConnection(urlStr);

  try {
    const localMigrations = listLocalMigrationSqlFiles();
    console.log("========== local repo migration SQL files (drizzle/) ==========");
    console.log("Count:", localMigrations.length);
    console.log(localMigrations.join("\n"));

    console.log("\n========== (a) SHOW TABLES ==========");
    const [tables] = await conn.query("SHOW TABLES");
    const key = Object.keys(tables[0] || {})[0] || "Tables_in_db";
    const tableNames = tables.map((row) => row[key]);
    tableNames.sort();
    console.log("Table count:", tableNames.length);
    console.log(tableNames.join("\n"));

    async function printDescribe(label, table) {
      console.log(`\n========== ${label} ==========`);
      if (!tableNames.includes(table)) {
        console.log("TABLE MISSING:", table);
        return { missingTable: true, fields: [] };
      }
      const [rows] = await conn.query(`DESCRIBE \`${table.replace(/`/g, "``")}\``);
      for (const r of rows) {
        console.log(
          [r.Field, r.Type, r.Null, r.Key, r.Default, r.Extra].filter((x) => x !== "").join(" | ")
        );
      }
      const fields = getFields(rows);
      const miss = missingExpected(fields, table);
      if (miss.length) {
        console.log("\nMISSING expected columns (vs drizzle through 0032):", miss.join(", "));
      } else {
        console.log("\nExpected check: all listed columns present for " + table);
      }
      return { missingTable: false, fields };
    }

    await printDescribe("(b) DESCRIBE transcriptions", "transcriptions");
    await printDescribe("(c) DESCRIBE scrape_jobs", "scrape_jobs");
    await printDescribe("(d) DESCRIBE featured_accounts", "featured_accounts");
    await printDescribe("(e) DESCRIBE featured_reels", "featured_reels");

    console.log("\n========== (f) __drizzle_migrations count ==========");
    if (!tableNames.includes("__drizzle_migrations")) {
      console.log("Table __drizzle_migrations not found. Drizzle migrate may never have run.");
    } else {
      const [crows] = await conn.query(
        "SELECT COUNT(*) as n FROM `__drizzle_migrations`"
      );
      console.log("Row count:", crows[0]?.n);
    }

    console.log("\n========== (g) __drizzle_migrations rows ==========");
    if (tableNames.includes("__drizzle_migrations")) {
      const [drows] = await conn.query(
        "SELECT * FROM `__drizzle_migrations` ORDER BY id"
      );
      if (!drows.length) {
        console.log("(no rows)");
      } else {
        console.log(JSON.stringify(drows, null, 2));
      }
    }

    console.log("\n========== summary: likely pending work ==========");
    console.log(inferPendingFromGaps());
    console.log(
      "\nUse column gaps above plus __drizzle_migrations rows to decide which SQL files to apply on prod."
    );
    console.log("This script did not run any DDL or DML (read only).");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
