/**
 * One-off: run against DATABASE_URL in the environment.
 *   DATABASE_URL=... node scripts/featured-reels-db-snapshot.mjs
 * Bug #37 investigation: featured_reels transcription coverage.
 */
import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL");
  process.exit(1);
}

const conn = await mysql.createConnection(url);
try {
  const [[r1]] = await conn.query("SELECT COUNT(*) AS c FROM featured_reels");
  console.log("1. featured_reels count:", r1.c);

  const [rows2] = await conn.query(
    "SELECT transcriptionStatus, COUNT(*) AS c FROM featured_reels GROUP BY transcriptionStatus ORDER BY transcriptionStatus"
  );
  console.log("2. by transcriptionStatus:", rows2);

  const [rows3] = await conn.query(
    "SELECT id, transcriptionStatus FROM featured_reels WHERE featuredAccountId = 128 ORDER BY id"
  );
  console.log("3. account 128 (rows):", rows3.length, rows3);

  const [[r4]] = await conn.query(
    "SELECT SUM(transcriptionStatus IN ('completed', 'no_speech')) AS done_like, SUM(transcriptionStatus NOT IN ('completed', 'no_speech')) AS not_done FROM featured_reels"
  );
  console.log("4. done_like / not_done:", r4);
} finally {
  await conn.end();
}
