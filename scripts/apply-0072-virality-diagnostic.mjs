/**
 * One-off: apply `drizzle/0072_virality_diagnostic.sql`.
 *
 * Idempotent CREATE TABLE for virality diagnostic jobs (Bug #67 Phase A).
 * Does NOT write to __drizzle_migrations or any Drizzle journal.
 *
 * Run in Render Shell (DATABASE_URL comes from the shell env):
 *
 *   node scripts/apply-0072-virality-diagnostic.mjs
 *
 * Safe to re-run: if the table already exists, exits 0 with "already applied".
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));

const TABLE_JOBS = "virality_diagnostic_jobs";

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

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is required. In Render Shell it is usually already set.\n" +
        "Example:\n" +
        '  DATABASE_URL="mysql://user:pw@host:port/db" node scripts/apply-0072-virality-diagnostic.mjs'
    );
    process.exit(1);
  }

  let host = "(unknown)";
  try {
    host = new URL(url).hostname;
  } catch {
    /* ignore */
  }

  console.log("=== apply-0072-virality-diagnostic ===");
  console.log("Host:", host);
  console.log("Journal: NOT touched (__drizzle_migrations unchanged)\n");

  const sqlPath = join(__dirname, "..", "drizzle", "0072_virality_diagnostic.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const conn = await mysql.createConnection({
    uri: url,
    multipleStatements: true,
  });

  try {
    const jobsExists = await hasTable(conn, TABLE_JOBS);

    if (jobsExists) {
      console.log("PASTE CONFIRMATION: already applied (table exists).");
      console.log(`  - ${TABLE_JOBS}: present`);
      console.log("\nColumn lists (eyeball verify):\n");

      const cols = await listColumns(conn, TABLE_JOBS);
      console.log(`--- ${TABLE_JOBS} (${cols.length} columns) ---`);
      console.log(JSON.stringify(cols, null, 2));
      console.log("");

      console.log("Exit 0 (idempotent skip).");
      return;
    }

    console.log("Applying drizzle/0072_virality_diagnostic.sql ...");
    await conn.query(sql);
    console.log("SQL executed.\n");

    const jobsOk = await hasTable(conn, TABLE_JOBS);

    if (!jobsOk) {
      console.error("VERIFY FAIL: table missing after apply.");
      console.error(`  ${TABLE_JOBS}: MISSING`);
      process.exit(1);
    }

    console.log("PASTE CONFIRMATION: apply succeeded.");
    console.log(`  - ${TABLE_JOBS}: created`);
    console.log("\nColumn lists (eyeball verify):\n");

    const cols = await listColumns(conn, TABLE_JOBS);
    console.log(`--- ${TABLE_JOBS} (${cols.length} columns) ---`);
    console.log(JSON.stringify(cols, null, 2));
    console.log("");

    console.log("Exit 0.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error("apply-0072 failed:", err?.message || err);
  process.exit(1);
});
