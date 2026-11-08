/** "Your winners" coverage (read-only, counts only): do active creators' own accounts have researched videos and winners? */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({ uri: process.env.EVAL_DB_READONLY_URL!.trim() });
const q = async (s: string) => ((await conn.query(s)) as unknown as [Array<Record<string, any>>])[0];

const accounts = await q(`
  SELECT DISTINCT sp.platform AS platform, LOWER(sp.normalizedHandle) AS handle
  FROM social_profiles sp
  JOIN workspace_member_active_profiles a ON a.workspaceId = sp.workspaceId
  JOIN users u ON u.id = a.userId
  WHERE u.lastActiveAt >= NOW() - INTERVAL 14 DAY AND sp.deletedAt IS NULL
    AND sp.platform IS NOT NULL AND sp.normalizedHandle IS NOT NULL`);
console.log(`ACTIVE_ACCOUNTS ${accounts.length} | by platform ${JSON.stringify(accounts.reduce((m: any, a) => ((m[a.platform] = (m[a.platform] ?? 0) + 1), m), {}))}`);

let withVideos = 0, withWinners = 0, withTopics = 0, winnersTotal = 0;
const multiples: number[] = [];
for (const a of accounts) {
  const [r] = await q(`
    SELECT COUNT(*) AS n,
      SUM(s.multiple >= 1.5) AS winners,
      SUM(s.multiple >= 1.5 AND EXISTS (SELECT 1 FROM viral_video_topics t WHERE t.candidateId = c.id)) AS tagged,
      MAX(s.multiple) AS best
    FROM viral_post_candidates c JOIN viral_library_status s ON s.candidateId = c.id
    WHERE c.platform = ${conn.escape(a.platform)} AND LOWER(TRIM(LEADING '@' FROM c.creatorHandle)) = ${conn.escape(a.handle)}`);
  const n = Number(r?.n ?? 0), w = Number(r?.winners ?? 0), t = Number(r?.tagged ?? 0);
  if (n > 0) withVideos++;
  if (w > 0) { withWinners++; winnersTotal += w; multiples.push(Number(r?.best ?? 0)); }
  if (t > 0) withTopics++;
}
multiples.sort((x, y) => x - y);
const med = multiples.length ? multiples[Math.floor(multiples.length / 2)] : 0;
console.log(`ACCOUNTS with own videos in library ${withVideos} | with winners (>=1.5x) ${withWinners} | with tagged winners ${withTopics}`);
console.log(`WINNERS total ${winnersTotal} | median best multiple ${med}`);
const [pf] = await q(`SELECT COUNT(*) AS n FROM research_prefetch WHERE status = 'pending'`);
console.log(`PREFETCH pending queue ${pf?.n}`);
await conn.end();
