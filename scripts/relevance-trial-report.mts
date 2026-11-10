/**
 * Relevance-ranking trial report (read-only). Compares the "new" and "old"
 * Home ranking arms from the same feedback controls both arms already have.
 *
 * Arms are recomputed from the user id exactly as relevanceArmFor() assigns
 * them, so pass the SAME settings the trial used:
 *   TRIAL_START=2026-11-07   first day of the trial (UTC)
 *   TRIAL_USERS=12,34        safety-stage users (RELEVANCE_TRIAL_USERS)
 *   TRIAL_PERCENT=50         RELEVANCE_TRIAL_PERCENT
 *   DATABASE_URL / EVAL_DB_READONLY_URL   read-only connection
 *
 * Primary measure: share of EXPOSED creators (saw at least one video) who
 * started a remake ("would remake") within their first 3 active days. Every
 * exposed creator counts in the denominator; silence is not relevance.
 * Also: saves, "not relevant to my niche" per impression, feedback
 * participation, days to first remake. Small groups are reported as
 * insufficient evidence, never as a win.
 */
import mysql from "mysql2/promise";
import { relevanceArmFor } from "../server/viralPosts/relevanceHome";

const url = (process.env.EVAL_DB_READONLY_URL || process.env.DATABASE_URL || "").trim();
if (!url) throw new Error("Set EVAL_DB_READONLY_URL (read-only) or DATABASE_URL.");
const start = process.env.TRIAL_START?.trim();
if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) throw new Error("Set TRIAL_START=YYYY-MM-DD.");
const env = { RELEVANCE_RANKING: "trial", RELEVANCE_TRIAL_USERS: process.env.TRIAL_USERS ?? "", RELEVANCE_TRIAL_PERCENT: process.env.TRIAL_PERCENT ?? "0" };
const MIN_PER_ARM = 30;

const conn = await mysql.createConnection({ uri: url });
const q = async (s: string, p: unknown[] = []) => ((await conn.query(s, p)) as unknown as [Array<Record<string, any>>])[0];

const fb = await q(
  `SELECT userId, feedbackType, DATE(createdAt) AS d, createdAt FROM viral_post_feedback
   WHERE createdAt >= ? AND feedbackType IN ('post_impression','remake_started','not_my_niche','not_relevant','more_like_this','too_few_views','wrong_content_type','already_seen','dismissed')`,
  [start]
);
const saves = await q(`SELECT userId, savedAt FROM viral_post_saves WHERE savedAt >= ?`, [start]);

type U = { days: string[]; firstSeen: Date; impressions: number; remakeAt: Date | null; remakeEarly: boolean; wrongTopic: number; explicit: number; saves: number };
const users = new Map<number, U>();
const get = (id: number, at: Date) => {
  let u = users.get(id);
  if (!u) users.set(id, (u = { days: [], firstSeen: at, impressions: 0, remakeAt: null, remakeEarly: false, wrongTopic: 0, explicit: 0, saves: 0 }));
  return u;
};
for (const r of fb.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))) {
  const id = Number(r.userId);
  const at = new Date(r.createdAt);
  const day = String(r.d instanceof Date ? r.d.toISOString().slice(0, 10) : r.d);
  if (r.feedbackType === "post_impression") {
    const u = get(id, at);
    u.impressions++;
    if (!u.days.includes(day)) u.days.push(day);
    continue;
  }
  const u = users.get(id);
  if (!u) continue; // feedback without an impression since the start: not exposed
  if (r.feedbackType === "remake_started") {
    if (!u.remakeAt) u.remakeAt = at;
    if (u.days.slice(0, 3).includes(day)) u.remakeEarly = true;
  }
  if (r.feedbackType === "not_my_niche" || r.feedbackType === "not_relevant") u.wrongTopic++;
  if (r.feedbackType !== "remake_started") u.explicit++;
}
for (const s of saves) users.get(Number(s.userId)) && users.get(Number(s.userId))!.saves++;

const arms = { new: [] as U[], old: [] as U[] };
for (const [id, u] of users) arms[relevanceArmFor(id, env)].push(u);

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");
console.log(`TRIAL from ${start} | assignment: users [${env.RELEVANCE_TRIAL_USERS}] + ${env.RELEVANCE_TRIAL_PERCENT}% by stable hash`);
const primary: Record<string, number> = {};
for (const [arm, list] of Object.entries(arms)) {
  const n = list.length;
  const early = list.filter(u => u.remakeEarly).length;
  const imp = list.reduce((s, u) => s + u.impressions, 0);
  const wrong = list.reduce((s, u) => s + u.wrongTopic, 0);
  const days = list.filter(u => u.remakeAt).map(u => (+u.remakeAt! - +u.firstSeen) / 86_400_000).sort((a, b) => a - b);
  primary[arm] = n ? early / n : NaN;
  console.log(`\nARM ${arm.toUpperCase()}: exposed creators ${n}${n < MIN_PER_ARM ? `  (INSUFFICIENT: fewer than ${MIN_PER_ARM})` : ""}`);
  console.log(`  PRIMARY remade within first 3 active days: ${early}/${n} = ${pct(early, n)}`);
  console.log(`  ever remade: ${list.filter(u => u.remakeAt).length}/${n} | median days to first remake: ${days.length ? days[Math.floor(days.length / 2)]!.toFixed(1) : "n/a"}`);
  console.log(`  saved anything: ${list.filter(u => u.saves > 0).length}/${n} | saves total ${list.reduce((s, u) => s + u.saves, 0)}`);
  console.log(`  wrong-topic per 100 impressions: ${imp ? ((100 * wrong) / imp).toFixed(2) : "n/a"} (${wrong}/${imp})`);
  console.log(`  feedback participation (any explicit feedback): ${pct(list.filter(u => u.explicit > 0).length, n)}`);
}
const diff = (primary.new - primary.old) * 100;
const enough = arms.new.length >= MIN_PER_ARM && arms.old.length >= MIN_PER_ARM;
console.log(`\nDIFFERENCE (new - old) in primary: ${Number.isFinite(diff) ? diff.toFixed(1) : "n/a"} points`);
console.log(
  `READING: ${!enough ? "insufficient evidence (too few exposed creators) - hold, do not decide" : diff >= 10 ? "meets the +10-point bar for a cautious expansion IF wrong-topic did not worsen and no serious regressions were seen" : "below the +10-point bar - hold and investigate"}`
);
console.log("Note: a pilot this size can miss real differences; it decides whether a larger test is worthwhile, not a full rollout.");
await conn.end();
