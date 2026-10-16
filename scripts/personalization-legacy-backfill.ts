/**
 * Legacy personalization backfill (ops tool). NOT approved for production yet.
 *
 * Dry run (default, writes nothing):
 *   BACKFILL_DATABASE_URL='mysql://...' pnpm exec tsx scripts/personalization-legacy-backfill.ts
 * Execute (non-production only, after the migration is applied there):
 *   ... scripts/personalization-legacy-backfill.ts --execute --preflight-passed
 *
 * Production additionally requires PERSONALIZATION_BACKFILL_ALLOW_PRODUCTION=yes,
 * which must only be set after separate CEO approval.
 * Output contains ids and counts only, never names, emails or free text.
 */
import mysql from "mysql2/promise";
import { runLegacyBackfill } from "../server/personalization/backfill/runLegacyBackfill";

async function main() {
  const url = process.env.BACKFILL_DATABASE_URL;
  if (!url) {
    console.error("Set BACKFILL_DATABASE_URL.");
    process.exit(2);
  }
  const execute = process.argv.includes("--execute");
  if (execute && !process.argv.includes("--preflight-passed")) {
    console.error(
      "Refusing to execute without --preflight-passed (run scripts/personalization-preflight.ts first)."
    );
    process.exit(2);
  }
  const looksLikeProduction = /railway|rlwy|prod/i.test(new URL(url).hostname);
  if (
    execute &&
    looksLikeProduction &&
    process.env.PERSONALIZATION_BACKFILL_ALLOW_PRODUCTION !== "yes"
  ) {
    console.error(
      "Refusing to execute against what looks like production without separate approval."
    );
    process.exit(2);
  }
  const conn = await mysql.createConnection(url);
  try {
    const result = await runLegacyBackfill(conn, { execute });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.reconciliation.ok ? 0 : 1);
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error(
    `Backfill failed: ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(2);
});
