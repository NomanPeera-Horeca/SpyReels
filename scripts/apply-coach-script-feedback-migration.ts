/**
 * Apply coach_script_feedback migration on production MySQL.
 *
 * Usage:
 *   pnpm tsx scripts/apply-coach-script-feedback-migration.ts --dry-run
 *   pnpm tsx scripts/apply-coach-script-feedback-migration.ts
 */
import { config } from "dotenv";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";
import mysql from "mysql2/promise";

const PRODUCTION_HOST = "maglev.proxy.rlwy.net:16621";
const DRY_RUN = process.argv.includes("--dry-run");

function loadEnv(): void {
  const envFileArg = process.argv.find((a) => a.startsWith("--env-file="));
  const envPath = envFileArg
    ? resolve(process.cwd(), envFileArg.slice("--env-file=".length))
    : resolve(process.cwd(), ".env");

  if (existsSync(envPath)) {
    config({ path: envPath });
  }
}

function assertProductionDatabase(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy the current URL from Railway production into .env."
    );
  }
  if (!url.includes(PRODUCTION_HOST)) {
    throw new Error(`Refusing to run: DATABASE_URL must use production host ${PRODUCTION_HOST}.`);
  }
  return url;
}

function splitSqlStatements(sqlText: string): string[] {
  return sqlText
    .split(/;\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => (part.endsWith(";") ? part : `${part};`));
}

async function main() {
  loadEnv();
  const databaseUrl = assertProductionDatabase();
  const migrationPath = resolve(process.cwd(), "drizzle/0071_coach_script_feedback.sql");
  const sqlText = readFileSync(migrationPath, "utf8");
  const statements = splitSqlStatements(sqlText);

  console.log(
    `Coach script feedback migration on production (${PRODUCTION_HOST})${
      DRY_RUN ? " [DRY RUN]" : ""
    }`
  );

  if (DRY_RUN) {
    for (const statement of statements) {
      console.log(`\n${statement}`);
    }
    return;
  }

  const conn = await mysql.createConnection(databaseUrl);
  try {
    const [tables] = await conn.query<mysql.RowDataPacket[]>(
      "SHOW TABLES LIKE 'coach_script_feedback'"
    );
    if (tables.length > 0) {
      console.log("Table coach_script_feedback already exists. Skipping CREATE TABLE.");
    } else {
      await conn.query(statements[0]!);
      console.log("Created coach_script_feedback table.");
    }

    for (const statement of statements.slice(1)) {
      try {
        await conn.query(statement);
        console.log(`Applied: ${statement.split("\n")[0]}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/Duplicate key name|already exists/i.test(message)) {
          console.log(`Skipped existing index: ${statement.split("\n")[0]}`);
          continue;
        }
        throw err;
      }
    }

    const [verify] = await conn.query<mysql.RowDataPacket[]>(
      "SHOW TABLES LIKE 'coach_script_feedback'"
    );
    if (verify.length === 0) {
      throw new Error("Migration finished but coach_script_feedback table was not found.");
    }
    console.log("Migration verified.");
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
