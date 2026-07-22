/**
 * One-off: apply `drizzle/0074_youtube_support.sql`.
 *
 * Idempotent YouTube support tables and nullable relation columns.
 * Does NOT write to __drizzle_migrations or any Drizzle journal.
 *
 * Run in Render Shell (DATABASE_URL comes from the shell env):
 *
 *   node scripts/apply-0074-youtube-support.mjs
 *
 * Safe to re-run: existing tables and columns are skipped individually.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TABLE_JOBS = "youtube_scrape_jobs";
const TABLE_VIDEOS = "youtube_videos";
const TABLE_TRANSCRIPTIONS = "transcriptions";
const TABLE_RECREATED_SCRIPTS = "recreated_scripts";
const COLUMN_YOUTUBE_VIDEO_ID = "youtubeVideoId";

async function hasTable(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 AS ok FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ?
     LIMIT 1`,
    [table]
  );
  return rows.length > 0;
}

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

function statementsForTable(statements, table) {
  return statements.filter(
    (statement) =>
      statement.startsWith(`CREATE TABLE ${table} `) ||
      (statement.startsWith("CREATE INDEX ") &&
        statement.includes(` ON ${table} `))
  );
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
        '  DATABASE_URL="mysql://user:pw@host:port/db" node scripts/apply-0074-youtube-support.mjs'
    );
    process.exit(1);
  }

  let host = "(unknown)";
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }

  console.log("=== apply-0074-youtube-support ===");
  console.log("Host:", host);
  console.log("Journal: NOT touched (__drizzle_migrations unchanged)\n");

  const sqlPath = join(__dirname, "..", "drizzle", "0074_youtube_support.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");
  const statements = parseStatements(sql);

  const conn = await mysql.createConnection({
    uri: url,
    multipleStatements: true,
  });

  try {
    const jobsExists = await hasTable(conn, TABLE_JOBS);
    const videosExists = await hasTable(conn, TABLE_VIDEOS);
    const transcriptionColumnExists = await hasColumn(
      conn,
      TABLE_TRANSCRIPTIONS,
      COLUMN_YOUTUBE_VIDEO_ID
    );
    const recreatedScriptColumnExists = await hasColumn(
      conn,
      TABLE_RECREATED_SCRIPTS,
      COLUMN_YOUTUBE_VIDEO_ID
    );

    if (
      jobsExists &&
      videosExists &&
      transcriptionColumnExists &&
      recreatedScriptColumnExists
    ) {
      console.log("PASTE CONFIRMATION: already applied.");
      console.log(`  - ${TABLE_JOBS}: present`);
      console.log(`  - ${TABLE_VIDEOS}: present`);
      console.log(
        `  - ${TABLE_TRANSCRIPTIONS}.${COLUMN_YOUTUBE_VIDEO_ID}: present`
      );
      console.log(
        `  - ${TABLE_RECREATED_SCRIPTS}.${COLUMN_YOUTUBE_VIDEO_ID}: present`
      );
      console.log("\nColumn lists (eyeball verify):\n");

      for (const table of [
        TABLE_JOBS,
        TABLE_VIDEOS,
        TABLE_TRANSCRIPTIONS,
        TABLE_RECREATED_SCRIPTS,
      ]) {
        const cols = await listColumns(conn, table);
        console.log(`--- ${table} (${cols.length} columns) ---`);
        console.log(JSON.stringify(cols, null, 2));
        console.log("");
      }

      console.log("Exit 0 (idempotent skip).");
      return;
    }

    console.log("Applying drizzle/0074_youtube_support.sql operations ...");

    if (jobsExists) {
      console.log(`Skipping ${TABLE_JOBS}: table already exists.`);
    } else {
      await executeStatements(
        conn,
        statementsForTable(statements, TABLE_JOBS)
      );
      console.log(`Created ${TABLE_JOBS}.`);
    }

    if (videosExists) {
      console.log(`Skipping ${TABLE_VIDEOS}: table already exists.`);
    } else {
      await executeStatements(
        conn,
        statementsForTable(statements, TABLE_VIDEOS)
      );
      console.log(`Created ${TABLE_VIDEOS}.`);
    }

    if (transcriptionColumnExists) {
      console.log(
        `Skipping ${TABLE_TRANSCRIPTIONS}.${COLUMN_YOUTUBE_VIDEO_ID}: column already exists.`
      );
    } else {
      const alter = alterStatementForColumn(
        statements,
        TABLE_TRANSCRIPTIONS,
        COLUMN_YOUTUBE_VIDEO_ID
      );
      await executeStatements(conn, alter ? [alter] : []);
      console.log(
        `Added ${TABLE_TRANSCRIPTIONS}.${COLUMN_YOUTUBE_VIDEO_ID}.`
      );
    }

    if (recreatedScriptColumnExists) {
      console.log(
        `Skipping ${TABLE_RECREATED_SCRIPTS}.${COLUMN_YOUTUBE_VIDEO_ID}: column already exists.`
      );
    } else {
      const alter = alterStatementForColumn(
        statements,
        TABLE_RECREATED_SCRIPTS,
        COLUMN_YOUTUBE_VIDEO_ID
      );
      await executeStatements(conn, alter ? [alter] : []);
      console.log(
        `Added ${TABLE_RECREATED_SCRIPTS}.${COLUMN_YOUTUBE_VIDEO_ID}.`
      );
    }

    console.log("SQL operations executed.\n");

    const jobsOk = await hasTable(conn, TABLE_JOBS);
    const videosOk = await hasTable(conn, TABLE_VIDEOS);
    const transcriptionColumnOk = await hasColumn(
      conn,
      TABLE_TRANSCRIPTIONS,
      COLUMN_YOUTUBE_VIDEO_ID
    );
    const recreatedScriptColumnOk = await hasColumn(
      conn,
      TABLE_RECREATED_SCRIPTS,
      COLUMN_YOUTUBE_VIDEO_ID
    );

    if (
      !jobsOk ||
      !videosOk ||
      !transcriptionColumnOk ||
      !recreatedScriptColumnOk
    ) {
      console.error("VERIFY FAIL: migration objects missing after apply.");
      console.error(`  ${TABLE_JOBS}: ${jobsOk ? "present" : "MISSING"}`);
      console.error(`  ${TABLE_VIDEOS}: ${videosOk ? "present" : "MISSING"}`);
      console.error(
        `  ${TABLE_TRANSCRIPTIONS}.${COLUMN_YOUTUBE_VIDEO_ID}: ${
          transcriptionColumnOk ? "present" : "MISSING"
        }`
      );
      console.error(
        `  ${TABLE_RECREATED_SCRIPTS}.${COLUMN_YOUTUBE_VIDEO_ID}: ${
          recreatedScriptColumnOk ? "present" : "MISSING"
        }`
      );
      process.exit(1);
    }

    console.log("PASTE CONFIRMATION: apply succeeded.");
    console.log(`  - ${TABLE_JOBS}: present`);
    console.log(`  - ${TABLE_VIDEOS}: present`);
    console.log(
      `  - ${TABLE_TRANSCRIPTIONS}.${COLUMN_YOUTUBE_VIDEO_ID}: present`
    );
    console.log(
      `  - ${TABLE_RECREATED_SCRIPTS}.${COLUMN_YOUTUBE_VIDEO_ID}: present`
    );
    console.log("\nColumn lists (eyeball verify):\n");

    for (const table of [
      TABLE_JOBS,
      TABLE_VIDEOS,
      TABLE_TRANSCRIPTIONS,
      TABLE_RECREATED_SCRIPTS,
    ]) {
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
  console.error("apply-0074 failed:", err?.message || err);
  process.exit(1);
});
