/**
 * One-off production migration runner for the SpyReels Content Agent tables.
 *
 * Applies:
 *   drizzle/0096_filming_reminders.sql
 *   drizzle/0097_content_agent_runs.sql
 *
 * This repository intentionally keeps later one-off migrations outside the
 * Drizzle journal. This script follows the established Render Shell pattern and
 * does NOT write to __drizzle_migrations.
 *
 * Run in Render Shell after deploying code that contains these files:
 *
 *   node scripts/apply-0096-0097-content-agent.mjs
 *
 * Safe to re-run. Existing tables and indexes are verified and skipped. A
 * partially shaped existing table fails closed instead of guessing a repair.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));

const EXPECTED = {
  filming_reminders: {
    columns: [
      "id",
      "userId",
      "workspaceId",
      "coachScriptId",
      "savedScriptId",
      "title",
      "filmingDate",
      "filmingTime",
      "timezone",
      "setup",
      "setupLabel",
      "openingVisual",
      "onScreenText",
      "notes",
      "status",
      "reminderSentAt",
      "createdAt",
      "updatedAt",
    ],
    indexes: [
      "PRIMARY",
      "uniq_filming_reminders_workspace_script",
      "idx_filming_reminders_due",
    ],
  },
  content_agent_runs: {
    columns: [
      "id",
      "userId",
      "workspaceId",
      "request",
      "status",
      "currentArtifactKind",
      "currentArtifactId",
      "currentArtifactTitle",
      "pendingTool",
      "startedAt",
      "completedAt",
      "createdAt",
      "updatedAt",
    ],
    indexes: [
      "PRIMARY",
      "idx_content_agent_runs_workspace_updated",
      "idx_content_agent_runs_workspace_status",
    ],
  },
  content_agent_tool_runs: {
    columns: [
      "id",
      "runId",
      "workspaceId",
      "stepIndex",
      "tool",
      "status",
      "argsJson",
      "resultJson",
      "errorMessage",
      "startedAt",
      "completedAt",
      "createdAt",
      "updatedAt",
    ],
    indexes: [
      "PRIMARY",
      "uniq_content_agent_tool_run_step",
      "idx_content_agent_tool_runs_workspace",
    ],
  },
};

async function tableExists(conn, table) {
  const [rows] = await conn.query(
    `SELECT 1 AS present
       FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?
      LIMIT 1`,
    [table]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function listColumns(conn, table) {
  const [rows] = await conn.query(
    `SELECT COLUMN_NAME
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ?
      ORDER BY ORDINAL_POSITION`,
    [table]
  );
  return Array.isArray(rows) ? rows.map((row) => row.COLUMN_NAME) : [];
}

async function listIndexes(conn, table) {
  const [rows] = await conn.query(
    `SELECT DISTINCT INDEX_NAME
       FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [table]
  );
  return Array.isArray(rows) ? rows.map((row) => row.INDEX_NAME) : [];
}

async function verifyTable(conn, table) {
  const expected = EXPECTED[table];
  if (!expected) throw new Error(`No verification contract for ${table}`);

  if (!(await tableExists(conn, table))) {
    throw new Error(`${table} is missing after migration`);
  }

  const columns = await listColumns(conn, table);
  const indexes = await listIndexes(conn, table);
  const missingColumns = expected.columns.filter((column) => !columns.includes(column));
  const missingIndexes = expected.indexes.filter((index) => !indexes.includes(index));

  if (missingColumns.length || missingIndexes.length) {
    throw new Error(
      `${table} does not match the expected Content Agent schema. ` +
        `Missing columns: ${missingColumns.join(", ") || "none"}. ` +
        `Missing indexes: ${missingIndexes.join(", ") || "none"}.`
    );
  }

  console.log(`Verified ${table}: ${columns.length} columns, required indexes present.`);
}

function readSql(name) {
  return fs.readFileSync(join(__dirname, "..", "drizzle", name), "utf8");
}

function firstCreateTableStatement(sql, table) {
  const marker = `CREATE TABLE IF NOT EXISTS \`${table}\``;
  const start = sql.indexOf(marker);
  if (start < 0) throw new Error(`CREATE TABLE statement for ${table} not found`);
  const end = sql.indexOf(";", start);
  if (end < 0) throw new Error(`CREATE TABLE statement for ${table} is incomplete`);
  return sql.slice(start, end + 1);
}

async function ensureFilmingReminders(conn) {
  const table = "filming_reminders";
  const sql = readSql("0096_filming_reminders.sql");

  if (!(await tableExists(conn, table))) {
    await conn.query(firstCreateTableStatement(sql, table));
    console.log(`Created ${table}.`);
  } else {
    console.log(`Skipping ${table} create: table already exists.`);
  }

  const indexes = await listIndexes(conn, table);
  if (!indexes.includes("idx_filming_reminders_due")) {
    await conn.query(
      "CREATE INDEX `idx_filming_reminders_due` ON `filming_reminders` (`workspaceId`,`filmingDate`,`filmingTime`,`status`)"
    );
    console.log("Created idx_filming_reminders_due.");
  }

  await verifyTable(conn, table);
}

async function ensureAgentRuns(conn) {
  const sql = readSql("0097_content_agent_runs.sql");
  for (const table of ["content_agent_runs", "content_agent_tool_runs"]) {
    if (!(await tableExists(conn, table))) {
      await conn.query(firstCreateTableStatement(sql, table));
      console.log(`Created ${table}.`);
    } else {
      console.log(`Skipping ${table} create: table already exists.`);
    }
    await verifyTable(conn, table);
  }
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is required. Run this from the Render Shell for the target service.");
    process.exit(1);
  }

  let host = "(unknown)";
  try {
    host = new URL(url).hostname;
  } catch {
    // Keep the connection error as the authoritative failure below.
  }

  console.log("=== apply-0096-0097-content-agent ===");
  console.log("Host:", host);
  console.log("Journal: NOT touched (__drizzle_migrations unchanged)");

  const conn = await mysql.createConnection({ uri: url });
  try {
    await ensureFilmingReminders(conn);
    await ensureAgentRuns(conn);
    console.log("PASTE CONFIRMATION: Content Agent migrations are ready.");
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error("apply-0096-0097 failed:", error?.message || error);
  process.exit(1);
});
