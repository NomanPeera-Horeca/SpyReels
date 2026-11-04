/**
 * Library progress for the owner (read-only, aggregates only): videos by
 * platform and verdict, daily growth, per category and topic, and how many
 * viral/rising videos have speech vs music/visuals only.
 */
import mysql from "mysql2/promise";
const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const conn = await mysql.createConnection({ uri: url });
const q = async (title: string, sql: string) => {
  try {
    const [rows] = await conn.query(sql);
    console.log(`\n=== ${title} ===`);
    console.table(rows);
  } catch (e) {
    console.log(`\n=== ${title} === FAILED: ${e instanceof Error ? e.message : String(e)}`);
  }
};
await q("1. All library videos by platform and verdict", `
  SELECT s.platform, s.status, COUNT(*) AS videos FROM viral_library_status s GROUP BY s.platform, s.status ORDER BY s.platform, s.status`);
await q("2. Viral + rising found per day (by first stored date), last 10 days", `
  SELECT DATE(c.createdAt) AS day,
         SUM(c.platform='instagram') AS instagram, SUM(c.platform='tiktok') AS tiktok, SUM(c.platform='youtube') AS youtube, COUNT(*) AS total
  FROM viral_library_status s JOIN viral_post_candidates c ON c.id = s.candidateId
  WHERE s.status IN ('viral','rising') AND c.createdAt >= NOW() - INTERVAL 10 DAY
  GROUP BY DATE(c.createdAt) ORDER BY day`);
await q("3. Viral + rising stored before 10 days ago (older research)", `
  SELECT COUNT(*) AS videos FROM viral_library_status s JOIN viral_post_candidates c ON c.id = s.candidateId
  WHERE s.status IN ('viral','rising') AND c.createdAt < NOW() - INTERVAL 10 DAY`);
await q("4. Viral + rising per category (a video can carry up to 3 topics; counted once per category)", `
  SELECT t.category, COUNT(DISTINCT vt.candidateId) AS videos, COUNT(DISTINCT t.slug) AS topics_with_videos
  FROM viral_video_topics vt JOIN viral_topics t ON t.slug = vt.topicSlug
  JOIN viral_library_status s ON s.candidateId = vt.candidateId
  WHERE s.status IN ('viral','rising') GROUP BY t.category ORDER BY videos DESC`);
await q("5. Topics per category: total vs with 10+ viral/rising videos", `
  SELECT t.category, COUNT(*) AS topics,
         SUM(COALESCE(x.n,0) >= 10) AS with_10_plus, SUM(COALESCE(x.n,0) = 0) AS with_none, ROUND(AVG(COALESCE(x.n,0)),1) AS avg_videos
  FROM viral_topics t LEFT JOIN (
    SELECT vt.topicSlug, COUNT(DISTINCT vt.candidateId) AS n FROM viral_video_topics vt
    JOIN viral_library_status s ON s.candidateId = vt.candidateId WHERE s.status IN ('viral','rising') GROUP BY vt.topicSlug
  ) x ON x.topicSlug = t.slug GROUP BY t.category ORDER BY topics DESC`);
await q("6. Top 15 topics by viral/rising videos", `
  SELECT t.label, t.category, COUNT(DISTINCT vt.candidateId) AS videos
  FROM viral_video_topics vt JOIN viral_topics t ON t.slug = vt.topicSlug JOIN viral_library_status s ON s.candidateId = vt.candidateId
  WHERE s.status IN ('viral','rising') GROUP BY t.slug, t.label, t.category ORDER BY videos DESC LIMIT 15`);
await q("7. Thinnest 15 topics (fewest viral/rising videos)", `
  SELECT t.label, t.category, COUNT(DISTINCT s.candidateId) AS videos
  FROM viral_topics t LEFT JOIN viral_video_topics vt ON vt.topicSlug = t.slug
  LEFT JOIN viral_library_status s ON s.candidateId = vt.candidateId AND s.status IN ('viral','rising')
  GROUP BY t.slug, t.label, t.category ORDER BY videos ASC LIMIT 15`);
await q("8. Viral + rising: talking vs no talking, by platform", `
  SELECT c.platform,
         SUM(st.status = 'ok' AND COALESCE(CHAR_LENGTH(st.transcript),0) >= 40) AS with_talking,
         SUM(st.status = 'no_speech' OR (st.status = 'ok' AND COALESCE(CHAR_LENGTH(st.transcript),0) < 40)) AS no_talking_music_or_visual,
         SUM(st.platform IS NULL OR st.status NOT IN ('ok','no_speech')) AS not_checked_yet,
         COUNT(*) AS total
  FROM viral_library_status s JOIN viral_post_candidates c ON c.id = s.candidateId
  LEFT JOIN shared_transcripts st ON st.platform = c.platform AND st.sourceId = c.sourceId
  WHERE s.status IN ('viral','rising') GROUP BY c.platform`);
await q("9. Transcript status values (for reference)", `SELECT status, source, COUNT(*) AS n FROM shared_transcripts GROUP BY status, source ORDER BY n DESC LIMIT 12`);
await q("10. Topic tagging done for viral/rising", `
  SELECT c.platform, COUNT(*) AS viral_or_rising, SUM(EXISTS (SELECT 1 FROM viral_video_topics vt WHERE vt.candidateId = c.id)) AS tagged
  FROM viral_library_status s JOIN viral_post_candidates c ON c.id = s.candidateId WHERE s.status IN ('viral','rising') GROUP BY c.platform`);
await q("11. Views of viral/rising videos (median-ish buckets)", `
  SELECT c.platform, SUM(c.views < 50000) AS under_50k, SUM(c.views BETWEEN 50000 AND 499999) AS k50_to_500k, SUM(c.views BETWEEN 500000 AND 4999999) AS k500_to_5m, SUM(c.views >= 5000000) AS over_5m
  FROM viral_library_status s JOIN viral_post_candidates c ON c.id = s.candidateId WHERE s.status IN ('viral','rising') GROUP BY c.platform`);
await conn.end();
