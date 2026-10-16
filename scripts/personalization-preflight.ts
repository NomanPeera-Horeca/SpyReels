/**
 * READ-ONLY production preflight for the personalization migration.
 *
 * Run by someone with production database access (never from CI):
 *   PREFLIGHT_DATABASE_URL='mysql://...' pnpm exec tsx scripts/personalization-preflight.ts
 *
 * Prints a JSON report and exits 0 only if all four checks pass.
 * It uses a read-only transaction, refuses any non-read statement, and never
 * prints the connection string.
 */
import path from "node:path";
import mysql from "mysql2/promise";
import {
  loadRepoMigrations,
  runPersonalizationPreflight,
} from "../server/personalization/preflight";

const EXPECTED_LATEST_PREFIX = "0102";

async function main() {
  const url = process.env.PREFLIGHT_DATABASE_URL;
  if (!url) {
    console.error(
      "Set PREFLIGHT_DATABASE_URL (read-only credentials preferred)."
    );
    process.exit(2);
  }
  const conn = await mysql.createConnection(url);
  try {
    const report = await runPersonalizationPreflight(conn, {
      repoMigrations: loadRepoMigrations(
        path.resolve(import.meta.dirname, "../drizzle")
      ),
      expectedLatestPrefix: EXPECTED_LATEST_PREFIX,
    });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.pass ? 0 : 1);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(
    `Preflight failed to run: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(2);
});
