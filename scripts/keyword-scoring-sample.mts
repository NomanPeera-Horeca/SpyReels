/**
 * Phrase rows for three topics (high / middle / low Google demand) so a
 * scoring change can be compared offline. Read-only login, phrases and
 * counts only (no user data). Prints one JSON line per topic.
 */
import mysql from "mysql2/promise";

const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const conn = await mysql.createConnection({ uri: url });

const [topics] = (await conn.query(`
  SELECT k.topicSlug AS slug, t.label AS label, COUNT(DISTINCT k.phrase) AS phrases,
         SUM(v.volume IS NOT NULL) AS measured, AVG(LOG10(1 + v.volume)) AS avgLog
  FROM viral_keywords k
  JOIN viral_topics t ON t.slug = k.topicSlug
  JOIN viral_keyword_volumes v ON v.phrase = k.phrase AND v.source = 'google'
  WHERE k.platform = 'tiktok'
  GROUP BY k.topicSlug, t.label
  HAVING measured >= 25 AND SUM(k.runs) > 0
  ORDER BY avgLog DESC
`)) as unknown as [Array<{ slug: string; label: string; phrases: number; measured: number; avgLog: number }>];
console.log(`TOPICS_WITH_DATA ${topics.length}`);
const picks = topics.length >= 3 ? [topics[0], topics[Math.floor(topics.length / 2)], topics[topics.length - 1]] : topics;

for (const t of picks) {
  const [rows] = await conn.query(
    `SELECT k.phrase, k.platform, k.source, k.demand, k.runs, k.found, k.passed, k.viral, k.creatorsFound, k.goodCreators, k.retired,
            v.volume AS googleVolume, (v.phrase IS NOT NULL) AS googleChecked,
            (SELECT COUNT(*) FROM viral_keywords x WHERE x.topicSlug = k.topicSlug AND x.phrase = k.phrase AND x.source = 'tiktok_autocomplete') AS tiktokSuggested
     FROM viral_keywords k
     LEFT JOIN viral_keyword_volumes v ON v.phrase = k.phrase AND v.source = 'google' AND v.location = 'US'
     WHERE k.topicSlug = ? AND k.platform = 'tiktok'`,
    [t.slug]
  );
  console.log(`TOPIC_JSON ${JSON.stringify({ slug: t.slug, label: t.label, avgLog: Number(t.avgLog), rows })}`);
}

// Library-wide context for normalising performance.
const [perf] = await conn.query(
  `SELECT platform, SUM(runs) AS runs, SUM(passed) AS passed, SUM(viral) AS viral, COUNT(*) AS phrases, SUM(runs > 0) AS tried FROM viral_keywords GROUP BY platform`
);
console.log(`PERF_JSON ${JSON.stringify(perf)}`);
await conn.end();
