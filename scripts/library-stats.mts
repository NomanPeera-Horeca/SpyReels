/**
 * Viral library counts for the owner: aggregates only (no handles, no user
 * data), through the read-only login. Run by the library-stats eval job.
 */
import mysql from "mysql2/promise";

const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
if (url === process.env.DATABASE_URL?.trim()) throw new Error("Use the read-only login, not DATABASE_URL.");

const conn = await mysql.createConnection({ uri: url });
const queries: Array<[string, string]> = [
  [
    "Library videos by platform and verdict",
    `SELECT platform, status, COUNT(*) AS videos FROM viral_library_status GROUP BY platform, status ORDER BY platform, status`,
  ],
  [
    "Viral/rising videos tagged with a topic, by platform",
    `SELECT s.platform, COUNT(*) AS viral_or_rising,
            SUM(EXISTS (SELECT 1 FROM viral_video_topics vt WHERE vt.candidateId = s.candidateId)) AS tagged
       FROM viral_library_status s WHERE s.status IN ('viral','rising') GROUP BY s.platform`,
  ],
  [
    "Video analysis (insights) status, viral/rising only",
    `SELECT COALESCE(i.status, 'not_started') AS status,
            SUM(COALESCE(i.attempts, 0) >= 3) AS out_of_tries, COUNT(*) AS videos
       FROM viral_library_status s LEFT JOIN viral_video_insights i ON i.candidateId = s.candidateId
      WHERE s.status IN ('viral','rising') GROUP BY COALESCE(i.status, 'not_started')`,
  ],
  [
    "Top failure reasons (failed analyses)",
    `SELECT LEFT(error, 90) AS reason, COUNT(*) AS videos FROM viral_video_insights WHERE status = 'failed' GROUP BY LEFT(error, 90) ORDER BY videos DESC LIMIT 8`,
  ],
  [
    "Search phrase bank",
    `SELECT platform, COUNT(*) AS phrases, SUM(runs > 0) AS searched, SUM(runs) AS searches,
            SUM(found) AS found, SUM(passed) AS on_topic, SUM(viral) AS viral, SUM(goodCreators) AS good_creators,
            SUM(retired) AS retired FROM viral_keywords GROUP BY platform`,
  ],
  [
    "Search volume columns (migration 0112)",
    `SELECT COLUMN_NAME AS col FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viral_keywords' AND COLUMN_NAME IN ('searchVolume','volumeCheckedAt')`,
  ],
  [
    "Search volume progress",
    `SELECT SUM(volumeCheckedAt IS NOT NULL) AS checked, SUM(searchVolume > 0) AS with_volume, MAX(searchVolume) AS max_volume, COUNT(DISTINCT phrase) AS phrases FROM viral_keywords`,
  ],
  [
    "Phrase sources",
    `SELECT source, COUNT(*) AS rows_ FROM viral_keywords GROUP BY source`,
  ],
  ["Phrase bank topics covered", `SELECT COUNT(DISTINCT topicSlug) AS topics FROM viral_keywords`],
  [
    "Topics with viral/rising videos",
    `SELECT COUNT(DISTINCT vt.topicSlug) AS topics_with_videos, (SELECT COUNT(*) FROM viral_topics) AS all_topics
       FROM viral_video_topics vt JOIN viral_library_status s ON s.candidateId = vt.candidateId WHERE s.status IN ('viral','rising')`,
  ],
  ["Pre-research queue", `SELECT status, COUNT(*) AS creators FROM research_prefetch GROUP BY status`],
  [
    "Spend markers (last 3 days and catch-up)",
    `SELECT day, usd, videos FROM viral_processing_spend
      WHERE day IN ('fill-total','und-catch') OR day >= DATE_FORMAT(NOW() - INTERVAL 3 DAY, '%Y-%m-%d')
         OR day LIKE CONCAT('wl', DATE_FORMAT(NOW(), '%Y%m'), '%') OR day LIKE CONCAT('sc', DATE_FORMAT(NOW(), '%Y%m'), '%') OR day LIKE 'df%'
      ORDER BY day`,
  ],
];
for (const [title, q] of queries) {
  try {
    const [rows] = await conn.query(q);
    console.log(`\n=== ${title} ===`);
    console.table(rows);
  } catch (err) {
    console.log(`\n=== ${title} === FAILED: ${err instanceof Error ? err.message : String(err)}`);
  }
}
await conn.end();
