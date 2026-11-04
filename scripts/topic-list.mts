/** Every topic with its category, source, users matched and viral/rising videos per platform. Read-only, aggregates only. */
import mysql from "mysql2/promise";
const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const conn = await mysql.createConnection({ uri: url });
const [rows] = (await conn.query(`
  SELECT t.slug, t.label, t.category, t.source, DATE(t.createdAt) AS created,
    (SELECT COUNT(*) FROM viral_profile_topics pt WHERE pt.topicSlug = t.slug) AS profiles,
    COUNT(DISTINCT CASE WHEN s.status IN ('viral','rising') THEN vt.candidateId END) AS total,
    COUNT(DISTINCT CASE WHEN s.status IN ('viral','rising') AND c.platform = 'instagram' THEN vt.candidateId END) AS ig,
    COUNT(DISTINCT CASE WHEN s.status IN ('viral','rising') AND c.platform = 'tiktok' THEN vt.candidateId END) AS tt,
    COUNT(DISTINCT CASE WHEN s.status IN ('viral','rising') AND c.platform = 'youtube' THEN vt.candidateId END) AS yt
  FROM viral_topics t
  LEFT JOIN viral_video_topics vt ON vt.topicSlug = t.slug
  LEFT JOIN viral_library_status s ON s.candidateId = vt.candidateId
  LEFT JOIN viral_post_candidates c ON c.id = vt.candidateId
  GROUP BY t.slug, t.label, t.category, t.source, t.createdAt
  ORDER BY t.category, total DESC, t.label
`)) as unknown as [Array<Record<string, unknown>>];
console.log(`TOPICS ${rows.length}`);
for (const r of rows) console.log(`T|${r.category}|${r.label}|${r.source}|${r.profiles}|${r.total}|${r.ig}|${r.tt}|${r.yt}|${String(r.created).slice(0, 10)}`);
const [untagged] = (await conn.query(`
  SELECT COUNT(*) AS n FROM viral_library_status s
  WHERE s.status IN ('viral','rising') AND NOT EXISTS (SELECT 1 FROM viral_video_topics vt WHERE vt.candidateId = s.candidateId)`)) as unknown as [Array<{ n: number }>];
console.log(`UNTAGGED_VIRAL ${untagged[0].n}`);
await conn.end();
