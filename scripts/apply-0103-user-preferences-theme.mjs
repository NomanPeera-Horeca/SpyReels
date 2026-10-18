/**
 * One-off: apply `drizzle/0103_user_preferences_theme.sql` to production.
 *
 * Adds nullable `user_preferences.theme varchar(16)`. Existing rows stay NULL
 * (legacy behavior). Does NOT write to __drizzle_migrations or any Drizzle
 * journal, matching the other one-off scripts in this folder.
 *
 * DO NOT RUN until all of these are confirmed by the CEO / on-call:
 *   1. Production ledger and schema checked (run with --check first).
 *   2. A recoverable backup exists (the pre-0103 snapshot).
 *   3. Rollback plan reviewed (see the header of this file's runbook section).
 *
 * Usage (Render Shell, DATABASE_URL from the shell env):
 *   node scripts/apply-0103-user-preferences-theme.mjs --check   # read only
 *   node scripts/apply-0103-user-preferences-theme.mjs --apply   # writes
 *
 * Safe to re-run: skips when the column already exists.
 *
 * Rollback (only if the release must be reverted and the column is unused):
 *   ALTER TABLE user_preferences DROP COLUMN theme;
 * Preferred rollback: keep the column (nullable, ignored by the old code)
 * and set both v2 flags off. Dropping it loses saved theme choices.
 */
import mysql from "mysql2/promise";

const TABLE = "user_preferences";
const COLUMN = "theme";
const MODE = process.argv.includes("--apply") ? "apply" : "check";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Run this from the Render Shell.");
  process.exit(2);
}

async function columnInfo(conn) {
  const [rows] = await conn.query(
    `SELECT COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
    [TABLE, COLUMN]
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

async function tableExists(conn) {
  const [rows] = await conn.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = ?`,
    [TABLE]
  );
  return Array.isArray(rows) && rows.length > 0;
}

async function main() {
  const conn = await mysql.createConnection(process.env.DATABASE_URL);
  try {
    const [[{ db }]] = await conn.query("SELECT DATABASE() AS db");
    const [[{ version }]] = await conn.query("SELECT VERSION() AS version");
    console.log(JSON.stringify({ mode: MODE, database: db, mysql: version }));

    if (!(await tableExists(conn))) {
      throw new Error(`Table ${TABLE} is missing. Stop: schema is not as expected.`);
    }

    const before = await columnInfo(conn);
    if (before) {
      console.log(
        JSON.stringify({ result: "already-present", column: before })
      );
      return;
    }

    if (MODE === "check") {
      console.log(JSON.stringify({ result: "would-add", column: `${COLUMN} varchar(16) NULL AFTER timezone` }));
      return;
    }

    await conn.query(
      "ALTER TABLE `user_preferences` ADD COLUMN `theme` varchar(16) NULL AFTER `timezone`"
    );
    const after = await columnInfo(conn);
    if (!after || !/varchar\(16\)/.test(after.COLUMN_TYPE) || after.IS_NULLABLE !== "YES") {
      throw new Error("Post-check failed: theme column is not varchar(16) NULL.");
    }
    const [[{ nulls }]] = await conn.query(
      "SELECT COUNT(*) AS nulls FROM `user_preferences` WHERE `theme` IS NULL"
    );
    console.log(JSON.stringify({ result: "added", column: after, rowsWithNullTheme: nulls }));
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(JSON.stringify({ result: "failed", error: err.message }));
  process.exit(1);
});
