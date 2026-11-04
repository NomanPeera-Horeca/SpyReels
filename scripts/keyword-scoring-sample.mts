/**
 * Offline comparison of phrase scoring: current (keywords.ts keywordScore)
 * vs the proposed v2 (relevance gate + topic-relative bounded demand +
 * observed performance). Three topics: high / middle / low Google demand.
 * Read-only login; phrases and counts only. Prints rankings, not rows.
 */
import mysql from "mysql2/promise";

const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const conn = await mysql.createConnection({ uri: url });

type Row = {
  phrase: string; source: string; demand: number; runs: number; found: number; passed: number; viral: number;
  creatorsFound: number; goodCreators: number; retired: number; googleVolume: number | null; googleChecked: number; tiktokSuggested: number;
};

/* ---------- current score (copy of keywords.ts keywordScore) ---------- */
function oldScore(k: Row): number {
  const passRate = (k.passed + 1) / (k.found + 3);
  const viralRate = (k.viral + 0.5) / (k.passed + 3);
  const creatorRate = (k.goodCreators + 0.5) / (k.creatorsFound + 3);
  const evidence = Math.min(1, k.runs / 3);
  const measured = passRate * 0.4 + viralRate * 0.4 + creatorRate * 0.2;
  return (1 - evidence) * (k.demand / 100) * 0.6 + evidence * measured + (k.demand / 100) * 0.15;
}

/* ---------- proposed v2 ---------- */
const STOP = new Set("a an and are as at be by for from how i in is it my of on or that the this to what why with you your".split(" "));
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9\s]+/g, " ").split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)).map(w => (w.length > 4 && w.endsWith("s") ? w.slice(0, -1) : w)));
const quantile = (xs: number[], q: number) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * (s.length - 1))))]; };
const clamp = (x: number) => Math.max(0, Math.min(1, x));

function v2(rows: Row[], label: string, platformUsefulMedian: number) {
  const L = words(label);
  // Topic-relative demand: percentile of log(Google volume) among this topic's measured phrases (no saturation, no cross-niche effect).
  const knownLogs = rows.filter(r => r.googleChecked && r.googleVolume != null && r.googleVolume > 0).map(r => Math.log10(1 + (r.googleVolume ?? 0))).sort((a, b) => a - b);
  const pct = (g: number) => (knownLogs.length <= 1 ? 0.5 : knownLogs.filter(x => x < g).length / (knownLogs.length - 1));
  return rows.map(r => {
    // 1. Relevance (gate). Prior from coverage of the topic's own words; observed on-topic rate replaces it as searches add evidence.
    const P = words(r.phrase);
    const coverage = L.size === 0 ? 0.5 : [...L].filter(w => P.has(w)).length / L.size;
    let prior = 0.3 + 0.7 * coverage;
    if (coverage > 0 && (r.source === "viral_hashtag" || r.tiktokSuggested)) prior = Math.min(1, prior + 0.1);
    const w = r.found / (r.found + 5);
    const R = (1 - w) * prior + w * ((r.passed + 1) / (r.found + 2));
    // 2. Demand evidence (bounded 0-1, within the topic).
    let D: number;
    let demandKind: string;
    if (r.googleChecked && r.googleVolume != null) {
      D = r.googleVolume > 0 ? pct(Math.log10(1 + r.googleVolume)) : 0;
      demandKind = r.googleVolume === 0 ? "zero" : "known";
    } else {
      D = 0.5 + 0.2 * (r.demand / 100 - 0.5); // unknown: around the topic median, autocomplete rank nudges +/-0.1
      demandKind = r.googleChecked ? "unknown(no data)" : "unknown(not checked)";
    }
    if (r.tiktokSuggested) D = Math.min(1, D + 0.15); // social-search evidence (TikTok's own suggestions)
    // 3. Observed performance: viral videos per search vs the platform median.
    const u = r.runs > 0 ? r.viral / r.runs : 0;
    const Perf = r.runs > 0 ? u / (u + platformUsefulMedian) : 0;
    const e = r.runs / (r.runs + 1); // 1 search -> 0.5, 3 -> 0.75
    const eligible = R >= 0.45 && !r.retired;
    const score = eligible ? (1 - e) * (0.6 * R + 0.4 * D) + e * (0.55 * Perf + 0.3 * R + 0.15 * D) : 0;
    return { r, R, D, Perf, e, eligible, score, demandKind };
  });
}

const [topics] = (await conn.query(`
  SELECT k.topicSlug AS slug, t.label AS label, AVG(LOG10(1 + v.volume)) AS avgLog, SUM(k.runs) AS runs
  FROM viral_keywords k
  JOIN viral_topics t ON t.slug = k.topicSlug
  JOIN viral_keyword_volumes v ON v.phrase = k.phrase AND v.source = 'google'
  WHERE k.platform = 'tiktok'
  GROUP BY k.topicSlug, t.label
  HAVING COUNT(*) >= 25 AND SUM(k.runs) > 0
  ORDER BY avgLog DESC
`)) as unknown as [Array<{ slug: string; label: string; avgLog: number; runs: number }>];
console.log(`TOPICS_WITH_DATA ${topics.length}`);
const picks = topics.length >= 3 ? [topics[0], topics[Math.floor(topics.length / 2)], topics[topics.length - 1]] : topics;

const [perfRows] = (await conn.query(`SELECT viral / runs AS u FROM viral_keywords WHERE platform = 'tiktok' AND runs > 0 ORDER BY u`)) as unknown as [Array<{ u: number }>];
const platformMedian = Math.max(0.25, Number(perfRows[Math.floor(perfRows.length / 2)]?.u ?? 1));
console.log(`TIKTOK_MEDIAN_VIRAL_PER_SEARCH ${platformMedian.toFixed(3)}`);

const fmt = (x: { r: Row; R: number; D: number; Perf: number; score: number; demandKind: string }, rank: number, oldRank: number) =>
  `${String(rank).padStart(3)} (was ${String(oldRank).padStart(3)}) | ${x.r.phrase.slice(0, 42).padEnd(42)} | vol ${x.r.googleVolume == null ? "unknown" : x.r.googleVolume} | tt ${x.r.tiktokSuggested ? "y" : "n"} | runs ${x.r.runs} viral ${x.r.viral} pass ${x.r.passed}/${x.r.found} | R ${x.R.toFixed(2)} D ${x.D.toFixed(2)} P ${x.Perf.toFixed(2)} | old ${oldScore(x.r).toFixed(3)} new ${x.score.toFixed(3)}`;

for (const t of picks) {
  const [rows] = (await conn.query(
    `SELECT k.phrase, k.source, k.demand, k.runs, k.found, k.passed, k.viral, k.creatorsFound, k.goodCreators, k.retired,
            v.volume AS googleVolume, (v.phrase IS NOT NULL) AS googleChecked,
            EXISTS (SELECT 1 FROM viral_keywords x WHERE x.topicSlug = k.topicSlug AND x.phrase = k.phrase AND x.source = 'tiktok_autocomplete') AS tiktokSuggested
     FROM viral_keywords k
     LEFT JOIN viral_keyword_volumes v ON v.phrase = k.phrase AND v.source = 'google' AND v.location = 'US'
     WHERE k.topicSlug = ? AND k.platform = 'tiktok'`,
    [t.slug]
  )) as unknown as [Row[]];
  const scored = v2(rows.map(r => ({ ...r, googleVolume: r.googleVolume == null ? null : Number(r.googleVolume), googleChecked: Number(r.googleChecked), tiktokSuggested: Number(r.tiktokSuggested) })), t.label, platformMedian);
  const byOld = [...scored].sort((a, b) => oldScore(b.r) - oldScore(a.r));
  const byNew = [...scored].sort((a, b) => b.score - a.score);
  const oldRank = new Map(byOld.map((x, i) => [x.r.phrase, i + 1]));
  const newRank = new Map(byNew.map((x, i) => [x.r.phrase, i + 1]));
  const kinds = scored.reduce<Record<string, number>>((m, x) => ({ ...m, [x.demandKind]: (m[x.demandKind] ?? 0) + 1 }), {});
  console.log(`\n=== TOPIC ${t.label} (${t.slug}) | phrases ${rows.length} | tried ${rows.filter(r => r.runs > 0).length} | demand kinds ${JSON.stringify(kinds)} | ineligible ${scored.filter(x => !x.eligible).length}`);
  console.log("--- top 12 NEW (with old rank)");
  byNew.slice(0, 12).forEach((x, i) => console.log(fmt(x, i + 1, oldRank.get(x.r.phrase)!)));
  console.log("--- top 8 OLD (with new rank)");
  byOld.slice(0, 8).forEach(x => console.log(fmt(x, newRank.get(x.r.phrase)!, oldRank.get(x.r.phrase)!)));
  const pick = (f: (x: typeof scored[number]) => boolean, sort: (a: typeof scored[number], b: typeof scored[number]) => number) => [...scored].filter(f).sort(sort)[0];
  const reps: Array<[string, typeof scored[number] | undefined]> = [
    ["known-high", pick(x => x.demandKind === "known", (a, b) => (b.r.googleVolume ?? 0) - (a.r.googleVolume ?? 0))],
    ["known-low", pick(x => x.demandKind === "known" && (x.r.googleVolume ?? 0) <= 30, (a, b) => b.r.demand - a.r.demand)],
    ["zero", pick(x => x.demandKind === "zero", (a, b) => b.r.demand - a.r.demand)],
    ["unknown", pick(x => x.demandKind.startsWith("unknown"), (a, b) => b.r.demand - a.r.demand)],
    ["tried-best", pick(x => x.r.runs > 0, (a, b) => b.r.viral - a.r.viral)],
    ["tried-worst", pick(x => x.r.runs > 1, (a, b) => a.r.passed / Math.max(1, a.r.found) - b.r.passed / Math.max(1, b.r.found))],
  ];
  console.log("--- representative");
  for (const [k, x] of reps) if (x) console.log(`${k.padEnd(11)} ${fmt(x, newRank.get(x.r.phrase)!, oldRank.get(x.r.phrase)!)}`);
}
await conn.end();
