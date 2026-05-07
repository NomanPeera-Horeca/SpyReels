/**
 * Phase A: apply drizzle migrations 0020 through 0032 to PRODUCTION in order.
 * Idempotent: skips a file if its schema effects are already present.
 * Does NOT write to __drizzle_migrations (per operator request).
 *
 * Run:
 *   export DATABASE_URL='mysql://...'   # maglev production only
 *   node scripts/prod-apply-migrations-0020-0032.mjs
 *
 * 0020 in this repo adds collected_reels.transcriptionReelId (not transcriptions.reelId).
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mysql from "mysql2/promise";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRIZZLE = path.join(__dirname, "..", "drizzle");

const PROD_HOST = "maglev.proxy.rlwy.net";
const STAGING_HOST = "shinkansen.proxy.rlwy.net";

const MIGRATION_FILES = [
  "0020_add_transcription_reel_id.sql",
  "0021_scrape_progress.sql",
  "0022_featured_accounts.sql",
  "0023_classify_cache.sql",
  "0024_onboarding_state.sql",
  "0025_scrape_jobs_is_demo.sql",
  "0026_onboarding_niches_and_completion.sql",
  "0027_user_selected_creators.sql",
  "0028_featured_reel_columns.sql",
  "0029_featured_reel_transcription_cache.sql",
  "0030_featured_accounts_posting_time.sql",
  "0031_scrape_jobs_failure_reason.sql",
  "0032_transcriptions_queue_timestamps.sql",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function hasTable(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?
     LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

async function hasColumn(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT 1 AS ok FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?
     LIMIT 1`,
    [table, column]
  );
  return rows.length > 0;
}

async function columnCount(conn, table) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) AS n FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Returns { applied: boolean, error?: string, partial?: boolean }
 */
async function migrationAlreadySatisfied(conn, filename) {
  switch (filename) {
    case "0020_add_transcription_reel_id.sql": {
      const ok = await hasColumn(conn, "collected_reels", "transcriptionReelId");
      return { applied: ok };
    }
    case "0021_scrape_progress.sql": {
      const ok = await hasColumn(conn, "scrape_jobs", "currentStep");
      return { applied: ok };
    }
    case "0022_featured_accounts.sql": {
      const t1 = await hasTable(conn, "niches");
      const t2 = await hasTable(conn, "featured_accounts");
      const t3 = await hasTable(conn, "featured_account_niches");
      const t4 = await hasTable(conn, "featured_reels");
      const any = t1 || t2 || t3 || t4;
      const all = t1 && t2 && t3 && t4;
      if (any && !all) {
        return {
          applied: false,
          partial: true,
          error:
            "0022 is only partially applied (some of niches, featured_accounts, featured_account_niches, featured_reels exist). Fix manually before re-running.",
        };
      }
      return { applied: all };
    }
    case "0023_classify_cache.sql": {
      const ok = await hasColumn(conn, "scrape_jobs", "classifiedNicheSlug");
      return { applied: ok };
    }
    case "0024_onboarding_state.sql": {
      const ok = await hasColumn(conn, "users", "hasSeenWelcome");
      return { applied: ok };
    }
    case "0025_scrape_jobs_is_demo.sql": {
      const ok = await hasColumn(conn, "scrape_jobs", "isDemo");
      return { applied: ok };
    }
    case "0026_onboarding_niches_and_completion.sql": {
      const ok = await hasColumn(conn, "users", "selectedNicheSlugs");
      return { applied: ok };
    }
    case "0027_user_selected_creators.sql": {
      const ok = await hasColumn(conn, "users", "selectedCreatorHandles");
      return { applied: ok };
    }
    case "0028_featured_reel_columns.sql": {
      const a = await hasColumn(conn, "transcriptions", "featuredReelId");
      const b = await hasColumn(conn, "recreated_scripts", "featuredReelId");
      const c = await hasColumn(conn, "saved_reels", "featuredReelId");
      const any = a || b || c;
      const all = a && b && c;
      if (any && !all) {
        return {
          applied: false,
          partial: true,
          error:
            "0028 is only partially applied (featuredReelId missing on one of transcriptions, recreated_scripts, saved_reels). Fix manually before re-running.",
        };
      }
      return { applied: all };
    }
    case "0029_featured_reel_transcription_cache.sql": {
      const ok = await hasColumn(conn, "featured_reels", "transcriptionStatus");
      return { applied: ok };
    }
    case "0030_featured_accounts_posting_time.sql": {
      const ok = await hasColumn(conn, "featured_accounts", "bestPostingHour");
      return { applied: ok };
    }
    case "0031_scrape_jobs_failure_reason.sql": {
      const ok = await hasColumn(conn, "scrape_jobs", "failureReason");
      return { applied: ok };
    }
    case "0032_transcriptions_queue_timestamps.sql": {
      const q = await hasColumn(conn, "transcriptions", "queuedAt");
      const s = await hasColumn(conn, "transcriptions", "startedAt");
      return { applied: q && s };
    }
    default:
      return { applied: false, error: "Unknown migration file: " + filename };
  }
}

function readSqlFile(filename) {
  const p = path.join(DRIZZLE, filename);
  if (!fs.existsSync(p)) {
    throw new Error("Missing file: " + p);
  }
  return fs.readFileSync(p, "utf8");
}

async function runFinalDiagnostic(conn) {
  console.log("\n========== FINAL DIAGNOSTIC ==========\n");

  const checks = [
    ["transcriptions", "featuredReelId"],
    ["transcriptions", "queuedAt"],
    ["transcriptions", "startedAt"],
    ["scrape_jobs", "failureReason"],
    ["featured_accounts", "bestPostingHour"],
    ["featured_reels", "transcriptionStatus"],
    ["featured_reels", "transcript"],
    ["featured_reels", "transcriptSegments"],
    ["featured_reels", "transcribedAt"],
  ];

  for (const [tbl, col] of checks) {
    const ok = await hasColumn(conn, tbl, col);
    console.log(`${tbl}.${col}: ${ok ? "OK" : "MISSING"}`);
  }

  for (const t of ["niches", "featured_accounts", "featured_reels"]) {
    const ok = await hasTable(conn, t);
    console.log(`table ${t}: ${ok ? "exists" : "MISSING"}`);
  }

  const ob = await hasTable(conn, "onboarding_state");
  console.log(`table onboarding_state: ${ob ? "exists" : "MISSING (not created by migrations 0020 to 0032 in this repo; state lives on users.* in 0024 to 0027)"}`);

  console.log("\nColumn counts (selected):");
  for (const t of ["transcriptions", "scrape_jobs", "featured_accounts", "featured_reels", "users"]) {
    if (await hasTable(conn, t)) {
      const n = await columnCount(conn, t);
      console.log(`  ${t}: ${n} columns`);
    } else {
      console.log(`  ${t}: table missing`);
    }
  }

  const [tables] = await conn.query("SHOW TABLES");
  const k = Object.keys(tables[0] || {})[0] || "Tables_in_db";
  console.log("\nTotal tables in database:", tables.length);
}

async function main() {
  const urlStr = process.env.DATABASE_URL;
  if (!urlStr?.trim()) {
    console.error("Set DATABASE_URL to production MySQL, then re-run.");
    process.exit(1);
  }

  let host;
  try {
    host = new URL(urlStr).hostname;
  } catch (e) {
    console.error("Invalid DATABASE_URL:", e?.message || e);
    process.exit(1);
  }

  console.log("Host:", host);
  if (host.includes(STAGING_HOST)) {
    console.error("Refusing to run: host looks like STAGING (shinkansen).");
    process.exit(1);
  }
  if (!host.includes(PROD_HOST)) {
    console.warn("WARNING: host is not the expected production pattern " + PROD_HOST);
  }

  console.log("\nPausing 3 seconds. Ctrl+C to abort...\n");
  await sleep(3000);

  const conn = await mysql.createConnection({
    uri: urlStr,
    multipleStatements: true,
  });

  const applied = [];
  const skipped = [];

  try {
    console.log("Note: 0020 adds collected_reels.transcriptionReelId (not transcriptions.reelId).\n");

    for (const file of MIGRATION_FILES) {
      const status = await migrationAlreadySatisfied(conn, file);
      if (status.error && !status.partial) {
        console.error("Check failed:", status.error);
        process.exit(1);
      }
      if (status.partial) {
        console.error("\nSTOP: " + status.error + "\n");
        process.exit(1);
      }
      if (status.applied) {
        console.log(file + " already applied, skipping");
        skipped.push(file);
        continue;
      }

      const sql = readSqlFile(file);
      console.log("\nApplying " + file + " ...");
      try {
        await conn.query(sql);
        console.log("OK: " + file);
        applied.push(file);
      } catch (err) {
        console.error("\nSTOP: migration failed:", file);
        console.error(err?.message || err);
        process.exit(1);
      }
    }

    console.log("\n========== SUMMARY ==========");
    console.log("Applied (" + applied.length + "):", applied.length ? applied.join(", ") : "(none)");
    console.log("Skipped (" + skipped.length + "):", skipped.length ? skipped.join(", ") : "(none)");
    console.log("__drizzle_migrations was not modified (per request).");

    await runFinalDiagnostic(conn);
    console.log("\nDone.");
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
