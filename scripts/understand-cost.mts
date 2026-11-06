/** Video-understanding cost and backlog (read-only). */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({ uri: process.env.EVAL_DB_READONLY_URL!.trim() });
const q = async (s: string) => ((await conn.query(s)) as unknown as [Array<Record<string, any>>])[0];

for (const r of await q(
  `SELECT c.platform, COUNT(*) n, ROUND(AVG(i.costUsd), 4) avgUsd FROM viral_video_insights i
   JOIN viral_post_candidates c ON c.id = i.candidateId
   WHERE i.status = 'done' AND i.processedAt >= NOW() - INTERVAL 14 DAY GROUP BY c.platform`
))
  console.log(`AVG_COST ${r.platform} done14d ${r.n} avg $${r.avgUsd}`);

for (const r of await q(`SELECT status, attempts, COUNT(*) n FROM viral_video_insights WHERE status <> 'done' GROUP BY status, attempts ORDER BY status, attempts`))
  console.log(`NOT_DONE ${r.status} attempts ${r.attempts} n ${r.n}`);

for (const r of await q(`SELECT day, usd FROM viral_processing_spend ORDER BY day DESC LIMIT 12`)) console.log(`SPEND ${r.day} $${r.usd}`);

for (const r of await q(
  `SELECT DATE(processedAt) d, COUNT(*) n FROM viral_video_insights
   WHERE status = 'done' AND processedAt >= NOW() - INTERVAL 10 DAY GROUP BY DATE(processedAt) ORDER BY d DESC`
))
  console.log(`DONE_PER_DAY ${String(r.d).slice(0, 15)} ${r.n}`);

for (const r of await q(
  `SELECT LEFT(error, 200) e, COUNT(*) n, MIN(claimedAt) first, MAX(claimedAt) last FROM viral_video_insights
   WHERE status = 'failed' GROUP BY LEFT(error, 200) ORDER BY n DESC LIMIT 4`
))
  console.log(`FAILED x${r.n} ${r.first} -> ${r.last} | ${r.e}`);

const [u] = await q(
  `SELECT COUNT(*) n FROM viral_library_status s LEFT JOIN viral_video_insights i ON i.candidateId = s.candidateId
   WHERE s.status IN ('viral', 'rising') AND i.candidateId IS NULL`
);
console.log(`BACKLOG never processed ${u?.n}`);
await conn.end();
