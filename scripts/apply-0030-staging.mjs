/**
 * One-off: apply `drizzle/0030_featured_accounts_posting_time.sql`.
 *
 * Mirrors the shape of `scripts/apply-0027-staging.mjs` but reads the
 * URL from `DATABASE_URL` instead of hardcoding Railway credentials,
 * so this file is safe to commit and reusable against prod later
 * (just swap the env var).
 *
 *   DATABASE_URL="mysql://…" node scripts/apply-0030-staging.mjs
 *
 * Idempotent: swallows ER_DUP_FIELDNAME (column already present) and
 * verifies both new columns exist in INFORMATION_SCHEMA before it
 * exits successfully. Uses `ALGORITHM=INSTANT` as the fast path
 * (MySQL 8.0.12+) and falls back to the plain ALTER if the server
 * refuses.
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import mysql from "mysql2/promise";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(
      "DATABASE_URL is required. Example:\n" +
        '  DATABASE_URL="mysql://user:pw@host:port/db" node scripts/apply-0030-staging.mjs'
    );
    process.exit(1);
  }

  const sqlPath = join(
    __dirname,
    "..",
    "drizzle",
    "0030_featured_accounts_posting_time.sql"
  );
  const sql = fs.readFileSync(sqlPath, "utf8");

  // Build an ALGORITHM=INSTANT variant of the same ALTER. The baked
  // SQL file is portable (some MySQL forks don't support INSTANT);
  // we try the fast path first, fall back to the file as-is.
  const instantSql = `
    ALTER TABLE \`featured_accounts\`
      ADD COLUMN \`bestPostingHour\` INT NULL AFTER \`lastFullScrape\`,
      ADD COLUMN \`bestPostingDay\` VARCHAR(10) NULL AFTER \`bestPostingHour\`,
      ALGORITHM=INSTANT;
  `;

  const conn = await mysql.createConnection(url);
  try {
    try {
      await conn.query(instantSql);
      console.log("0030: ALTER applied (ALGORITHM=INSTANT).");
    } catch (e) {
      if (e?.code === "ER_DUP_FIELDNAME" || e?.errno === 1060) {
        console.log(
          "0030: Columns already present (ER_DUP_FIELDNAME) — idempotent OK."
        );
      } else if (e?.errno === 1845 || e?.code === "ER_ALTER_OPERATION_NOT_SUPPORTED") {
        console.log("0030: INSTANT not supported — retrying without algorithm hint.");
        try {
          await conn.query(sql);
          console.log("0030: ALTER applied (default algorithm).");
        } catch (e2) {
          if (e2?.code === "ER_DUP_FIELDNAME" || e2?.errno === 1060) {
            console.log(
              "0030: Columns already present after fallback — idempotent OK."
            );
          } else {
            throw e2;
          }
        }
      } else {
        throw e;
      }
    }

    const [rows] = await conn.query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_TYPE
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'featured_accounts'
         AND COLUMN_NAME IN ('bestPostingHour', 'bestPostingDay')
       ORDER BY COLUMN_NAME`
    );

    const got = Array.isArray(rows) ? rows : [];
    if (got.length !== 2) {
      console.error(
        `VERIFY FAIL: expected 2 rows in INFORMATION_SCHEMA, got ${got.length}:`,
        JSON.stringify(got, null, 2)
      );
      process.exit(1);
    }
    console.log("VERIFY OK:", JSON.stringify(got, null, 2));
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
