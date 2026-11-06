/** Relevance trial prep (read-only): confirm migration 0116, list active creators to choose 10 safety-stage users from. */
import mysql from "mysql2/promise";
const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const conn = await mysql.createConnection({ uri: url });
const q = async (s: string, p: unknown[] = []) => ((await conn.query(s, p)) as unknown as [Array<Record<string, any>>])[0];
const cols = await q(`SELECT COLUMN_NAME AS c, COLUMN_TYPE AS t FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'viral_profile_relevance' ORDER BY ORDINAL_POSITION`);
console.log(`TABLE viral_profile_relevance ${cols.length ? "EXISTS" : "MISSING"} | ${cols.map(c => `${c.c} ${c.t}`).join(", ")}`);
if (cols.length) console.log(`TABLE rows ${(await q(`SELECT COUNT(*) AS n FROM viral_profile_relevance`))[0]?.n}`);
const rows = await q(`
  SELECT a.userId, a.socialProfileId,
    (SELECT COUNT(*) FROM viral_post_feedback f WHERE f.userId = a.userId AND f.feedbackType = 'post_impression' AND f.createdAt >= NOW() - INTERVAL 14 DAY) AS imp14,
    (SELECT COUNT(DISTINCT DATE(f.createdAt)) FROM viral_post_feedback f WHERE f.userId = a.userId AND f.feedbackType = 'post_impression' AND f.createdAt >= NOW() - INTERVAL 14 DAY) AS days14,
    (SELECT COUNT(*) FROM viral_post_feedback f WHERE f.userId = a.userId AND f.feedbackType = 'remake_started' AND f.createdAt >= NOW() - INTERVAL 30 DAY) AS remakes30,
    (SELECT CAST(payload AS CHAR) FROM personalization_items pi WHERE pi.socialProfileId = a.socialProfileId AND pi.kind = 'niche' AND pi.status = 'confirmed' LIMIT 1) AS niche,
    (SELECT COUNT(*) FROM personalization_items pi WHERE pi.socialProfileId = a.socialProfileId AND pi.kind = 'pillar' AND pi.status = 'confirmed') AS pillars,
    (SELECT COUNT(*) FROM viral_profile_topics t WHERE t.socialProfileId = a.socialProfileId) AS topics
  FROM workspace_member_active_profiles a`);
const active = rows.filter(r => Number(r.days14) >= 2 && r.niche && Number(r.topics) > 0)
  .map(r => { let n: any = {}; try { n = JSON.parse(r.niche); } catch {} return { ...r, label: String(n.label ?? "?"), category: String(n.categoryLabel ?? "") }; })
  .sort((a, b) => Number(b.days14) - Number(a.days14) || Number(b.imp14) - Number(a.imp14));
console.log(`ACTIVE creators (2+ days with videos shown in last 14 days, niche confirmed, topics matched): ${active.length}`);
for (const r of active.slice(0, 60)) console.log(`CAND user ${r.userId} | days ${r.days14} | shown ${r.imp14} | remakes30 ${r.remakes30} | ${Number(r.pillars) > 0 ? "detailed" : "SPARSE"} | ${r.category} | ${r.label.slice(0, 70)}`);
await conn.end();
