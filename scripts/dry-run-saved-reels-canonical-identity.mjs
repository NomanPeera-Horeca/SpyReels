#!/usr/bin/env node
/**
 * Read-only report for saved_reels canonical identity readiness.
 *
 * Reports:
 *   1) rows missing platform/sourceId that can be filled from reels.shortcode
 *   2) duplicate groups on (workspaceId, userId, platform, sourceId)
 *
 * Usage:
 *   DATABASE_URL=... node scripts/dry-run-saved-reels-canonical-identity.mjs
 *
 * Does not write. A future batch merge job can use this output; not required
 * while duplicate counts stay at zero.
 */
import mysql from "mysql2/promise";

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const connection = await mysql.createConnection(databaseUrl);

try {
  const [[cols]] = await connection.query(
    `SELECT
       SUM(COLUMN_NAME = 'platform') AS has_platform,
       SUM(COLUMN_NAME = 'sourceId') AS has_source
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'saved_reels'
       AND COLUMN_NAME IN ('platform', 'sourceId')`
  );

  if (!cols?.has_platform || !cols?.has_source) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          reason: "missing_columns",
          has_platform: Number(cols?.has_platform || 0) > 0,
          has_source: Number(cols?.has_source || 0) > 0,
        },
        null,
        2
      )
    );
    process.exit(0);
  }

  const [missingIdentity] = await connection.query(
    `SELECT
       sr.id,
       sr.workspaceId,
       sr.userId,
       sr.reelId,
       r.shortcode AS inferredSourceId,
       CASE
         WHEN r.id IS NULL THEN NULL
         ELSE 'instagram_or_tiktok_via_reels'
       END AS inferredPlatformHint
     FROM saved_reels sr
     LEFT JOIN reels r
       ON r.id = sr.reelId
      AND r.workspaceId = sr.workspaceId
     WHERE sr.platform IS NULL OR sr.sourceId IS NULL OR sr.platform = '' OR sr.sourceId = ''
     ORDER BY sr.id
     LIMIT 500`
  );

  const [duplicates] = await connection.query(
    `SELECT
       workspaceId,
       userId,
       platform,
       sourceId,
       COUNT(*) AS rowCount,
       GROUP_CONCAT(id ORDER BY id) AS ids
     FROM saved_reels
     WHERE platform IS NOT NULL
       AND sourceId IS NOT NULL
       AND platform <> ''
       AND sourceId <> ''
     GROUP BY workspaceId, userId, platform, sourceId
     HAVING COUNT(*) > 1
     ORDER BY rowCount DESC, workspaceId, userId
     LIMIT 200`
  );

  const [[totals]] = await connection.query(
    `SELECT
       COUNT(*) AS totalRows,
       SUM(platform IS NOT NULL AND sourceId IS NOT NULL AND platform <> '' AND sourceId <> '') AS withIdentity,
       SUM(platform IS NULL OR sourceId IS NULL OR platform = '' OR sourceId = '') AS missingIdentity
     FROM saved_reels`
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        totals,
        missingIdentitySample: missingIdentity,
        duplicateGroups: duplicates,
        duplicateGroupCount: duplicates.length,
      },
      null,
      2
    )
  );
} finally {
  await connection.end();
}
