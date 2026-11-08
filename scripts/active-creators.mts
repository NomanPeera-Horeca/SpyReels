/** Active creators (read-only, counts only): by last activity and sign-in, with/without a confirmed niche profile. */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection({ uri: process.env.EVAL_DB_READONLY_URL!.trim() });
const q = async (s: string) => ((await conn.query(s)) as unknown as [Array<Record<string, any>>])[0];

const [tot] = await q(`SELECT COUNT(*) n FROM users`);
console.log(`USERS total ${tot?.n}`);
const withNiche = `EXISTS (SELECT 1 FROM workspace_member_active_profiles a
  JOIN personalization_items pi ON pi.socialProfileId = a.socialProfileId AND pi.kind = 'niche' AND pi.status = 'confirmed'
  WHERE a.userId = u.id)`;
for (const days of [1, 7, 14, 30, 90]) {
  const [r] = await q(`SELECT COUNT(*) n, SUM(${withNiche}) withNiche FROM users u WHERE u.lastActiveAt >= NOW() - INTERVAL ${days} DAY`);
  const [s] = await q(`SELECT COUNT(*) n FROM users u WHERE u.lastSignedIn >= NOW() - INTERVAL ${days} DAY`);
  const [c] = await q(`SELECT COUNT(*) n FROM users u WHERE u.createdAt >= NOW() - INTERVAL ${days} DAY`);
  console.log(`LAST ${days}d | active ${r?.n} (with confirmed niche ${r?.withNiche ?? 0}) | signed in ${s?.n} | new sign-ups ${c?.n}`);
}
const [p] = await q(`SELECT COUNT(DISTINCT socialProfileId) n FROM personalization_items WHERE kind = 'niche' AND status = 'confirmed'`);
console.log(`PROFILES with confirmed niche ${p?.n}`);
for (const days of [7, 14, 30]) {
  const [f] = await q(`SELECT COUNT(DISTINCT userId) n FROM viral_post_feedback WHERE createdAt >= NOW() - INTERVAL ${days} DAY`);
  const [sv] = await q(`SELECT COUNT(DISTINCT userId) n FROM viral_post_saves WHERE savedAt >= NOW() - INTERVAL ${days} DAY`);
  console.log(`ENGAGED ${days}d | any video feedback/views ${f?.n} | saved a video ${sv?.n}`);
}
await conn.end();
