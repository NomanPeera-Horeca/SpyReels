/**
 * One-off: apply `drizzle/0075_scrape_timeframe.sql`.
 *
 * Idempotent nullable timeframeDays columns on TikTok and YouTube scrape jobs.
 * Does NOT write to __drizzle_migrations or any Drizzle journal.
 *
 * Run in Render Shell (DATABASE_URL comes from the shell env):
 *
 *   node scripts/apply-0075-scrape-timeframe.mjs
 *
 * Safe to re-run: existing columns are skipped individually.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TABLE_TIKTOK_JOBS = "tiktok_scrape_jobs";
const TABLE_YOUTUBE_JOBS = "youtube_scrape_jobs";
const COLUMN_TIMEFRAME_DAYS = "timeframeDays";

async function listColumns(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_TYPE, COLUMN_DEFAULT
     FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ?
     ORDER BY ORDINAL_POSITION`,
    [table]
  );
  return Array.isArray(rows) ? rows : [];
}

async function hasColumn(conn, table, column) {
  const columns = await listColumns(conn, table);
  return columns.some((entry) => entry.COLUMN_NAME === column);
}

function parseStatements(sql) {
  return sql
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function alterStatementForColumn(statements, table, column) {
  return statements.find((statement) =>
    statement.startsWith(`ALTER TABLE ${table} ADD COLUMN ${column} `)
  );
}

async function executeStatements(conn, statements) {
  if (statements.length === 0) {
    throw new Error("Expected SQL statements were not found in migration file");
  }
  await conn.query(`${statements.join(";\n")};`);
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is required. In Render Shell it is usually already set.\n" +
        "Example:\n" +
        '  DATABASE_URL="mysql://user:pw@host:port/db" node scripts/apply-0075-scrape-timeframe.mjs'
    );
    process.exit(1);
  }

  let host = "(unknown)";
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }

  console.log("=== apply-0075-scrape-timeframe ===");
  console.log("Host:", host);
  console.log("Journal: NOT touched (__drizzle_migrations unchanged)\n");

  const sqlPath = join(__dirname, "..", "drizzle", "0075_scrape_timeframe.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = parseStatements(sql);

  const conn = await mysql.createConnection({
    uri: url,
    multipleStatements: true,
  });

  try {
    const tiktokColumnExists = await hasColumn(
      conn,
      TABLE_TIKTOK_JOBS,
      COLUMN_TIMEFRAME_DAYS
    );
    const youtubeColumnExists = await hasColumn(
      conn,
      TABLE_YOUTUBE_JOBS,
      COLUMN_TIMEFRAME_DAYS
    );

    if (tiktokColumnExists && youtubeColumnExists) {
      console.log("PASTE CONFIRMATION: already applied.");
      console.log(
        `  - ${TABLE_TIKTOK_JOBS}.${COLUMN_TIMEFRAME_DAYS}: present`
      );
      console.log(
        `  - ${TABLE_YOUTUBE_JOBS}.${COLUMN_TIMEFRAME_DAYS}: present`
      );
      console.log("\nColumn lists (eyeball verify):\n");

      for (const table of [TABLE_TIKTOK_JOBS, TABLE_YOUTUBE_JOBS]) {
        const cols = await listColumns(conn, table);
        console.log(`--- ${table} (${cols.length} columns) ---`);
        console.log(JSON.stringify(cols, null, 2));
        console.log("");
      }

      console.log("Exit 0 (idempotent skip).");
      return;
    }

    console.log("Applying drizzle/0075_scrape_timeframe.sql operations ...");

    if (tiktokColumnExists) {
      console.log(
        `Skipping ${TABLE_TIKTOK_JOBS}.${COLUMN_TIMEFRAME_DAYS}: column already exists.`
      );
    } else {
      const alter = alterStatementForColumn(
        statements,
        TABLE_TIKTOK_JOBS,
        COLUMN_TIMEFRAME_DAYS
      );
      await executeStatements(conn, alter ? [alter] : []);
      console.log(`Added ${TABLE_TIKTOK_JOBS}.${COLUMN_TIMEFRAME_DAYS}.`);
    }

    if (youtubeColumnExists) {
      console.log(
        `Skipping ${TABLE_YOUTUBE_JOBS}.${COLUMN_TIMEFRAME_DAYS}: column already exists.`
      );
    } else {
      const alter = alterStatementForColumn(
        statements,
        TABLE_YOUTUBE_JOBS,
        COLUMN_TIMEFRAME_DAYS
      );
      await executeStatements(conn, alter ? [alter] : []);
      console.log(`Added ${TABLE_YOUTUBE_JOBS}.${COLUMN_TIMEFRAME_DAYS}.`);
    }

    console.log("SQL operations executed.\n");

    const tiktokColumnOk = await hasColumn(
      conn,
      TABLE_TIKTOK_JOBS,
      COLUMN_TIMEFRAME_DAYS
    );
    const youtubeColumnOk = await hasColumn(
      conn,
      TABLE_YOUTUBE_JOBS,
      COLUMN_TIMEFRAME_DAYS
    );

    if (!tiktokColumnOk || !youtubeColumnOk) {
      console.error("VERIFY FAIL: migration objects missing after apply.");
      console.error(
        `  ${TABLE_TIKTOK_JOBS}.${COLUMN_TIMEFRAME_DAYS}: ${
          tiktokColumnOk ? "present" : "MISSING"
        }`
      );
      console.error(
        `  ${TABLE_YOUTUBE_JOBS}.${COLUMN_TIMEFRAME_DAYS}: ${
          youtubeColumnOk ? "present" : "MISSING"
        }`
      );
      process.exit(1);
    }

    console.log("PASTE CONFIRMATION: apply succeeded.");
    console.log(`  - ${TABLE_TIKTOK_JOBS}.${COLUMN_TIMEFRAME_DAYS}: present`);
    console.log(`  - ${TABLE_YOUTUBE_JOBS}.${COLUMN_TIMEFRAME_DAYS}: present`);
    console.log("\nColumn lists (eyeball verify):\n");

    for (const table of [TABLE_TIKTOK_JOBS, TABLE_YOUTUBE_JOBS]) {
      const cols = await listColumns(conn, table);
      console.log(`--- ${table} (${cols.length} columns) ---`);
      console.log(JSON.stringify(cols, null, 2));
      console.log("");
    }

    console.log("Exit 0.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("apply-0075 failed:", err?.message || err);
  process.exit(1);
});
