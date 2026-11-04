/**
 * Scoring experiment report (read-only login, EVAL_DB_READONLY_URL).
 *
 *   pnpm exec tsx scripts/keyword-experiment-report.mts [experimentId]
 *
 * Both arms are measured the same way, against the same pre-test library
 * snapshot (the experiment's snapshotAt):
 * - on-topic: videos that passed the topic check and the viral pre-check
 *   when searched (passedIds in the search log);
 * - unique: distinct on-topic videos within the arm;
 * - new: not in the library before snapshotAt (first stored after it). A
 *   video found by both arms counts as new for BOTH (no "first finder wins");
 * - viral or rising: the library's verdict at report time, one rule for both;
 * - useful = on-topic AND unique AND new AND viral-or-rising;
 * - fresh: published within 30 days before it was found (reported separately).
 * Per arm, niche and platform: searches, calls, useful per search and per
 * 100 calls (with a 95% interval), off-topic and duplicate rates, fresh
 * share, cost per useful video, coverage, and 10 random useful videos per
 * arm per niche for manual review.
 */
import mysql from "mysql2/promise";

const url = process.env.EVAL_DB_READONLY_URL?.trim();
if (!url) throw new Error("EVAL_DB_READONLY_URL is not configured.");
const USD_PER_CALL = Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || 0.002;
const conn = await mysql.createConnection({ uri: url });

const [allExps] = (await conn.query(
  `SELECT e.id, e.name, e.status, e.snapshotAt, e.startedAt, e.endedAt, e.createdAt,
          (SELECT COUNT(DISTINCT searchId) FROM viral_keyword_searches s WHERE s.experimentId = e.id) AS searches
   FROM viral_keyword_experiments e ORDER BY e.id`
)) as unknown as [Array<Record<string, unknown>>];
console.log("ALL EXPERIMENTS");
console.table(allExps);
const wanted = Number(process.argv[2]) || null;
const [exps] = (await conn.query(
  wanted ? `SELECT * FROM viral_keyword_experiments WHERE id = ?` : `SELECT * FROM viral_keyword_experiments WHERE snapshotAt IS NOT NULL ORDER BY id DESC LIMIT 1`,
  wanted ? [wanted] : []
)) as unknown as [Array<Record<string, unknown>>];
const exp = exps[0];
if (!exp) {
  console.log("No experiment found.");
  process.exit(0);
}
const snapshotAt = exp.snapshotAt ? new Date(String(exp.snapshotAt)) : null;
console.log(`EXPERIMENT ${exp.id} "${exp.name}" status ${exp.status} snapshotAt ${snapshotAt?.toISOString() ?? "-"} min/arm ${exp.minSearchesPerArm} maxUsd ${exp.maxUsd}`);
if (!snapshotAt) process.exit(0);

type Row = { searchId: string; topicSlug: string; platform: string; scoring: string; lane: string; calls: number | null; found: number; passed: number; passedIds: unknown; createdAt: string };
const [rows] = (await conn.query(
  `SELECT searchId, topicSlug, platform, scoring, lane, calls, found, passed, passedIds, createdAt FROM viral_keyword_searches WHERE experimentId = ?`,
  [exp.id]
)) as unknown as [Row[]];

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? (JSON.parse(v) as string[]) : []);
// Library facts for every on-topic video found by either arm.
const allKeys = new Map<string, { platform: string; sourceId: string }>();
for (const r of rows) for (const id of ids(r.passedIds)) allKeys.set(`${r.platform}:${id}`, { platform: r.platform, sourceId: id });
const facts = new Map<string, { createdAt: Date; publishedAt: Date | null; status: string | null; url: string; caption: string; views: number | null }>();
const list = [...allKeys.values()];
for (let i = 0; i < list.length; i += 500) {
  const chunk = list.slice(i, i + 500);
  const [f] = (await conn.query(
    `SELECT c.platform, c.sourceId, c.createdAt, c.publishedAt, c.sourceUrl, c.caption, c.views, s.status
     FROM viral_post_candidates c LEFT JOIN viral_library_status s ON s.candidateId = c.id
     WHERE (c.platform, c.sourceId) IN (${chunk.map(() => "(?, ?)").join(", ")})`,
    chunk.flatMap(k => [k.platform, k.sourceId])
  )) as unknown as [Array<Record<string, unknown>>];
  for (const x of f) {
    facts.set(`${x.platform}:${x.sourceId}`, {
      createdAt: new Date(String(x.createdAt)),
      publishedAt: x.publishedAt ? new Date(String(x.publishedAt)) : null,
      status: x.status == null ? null : String(x.status),
      url: String(x.sourceUrl ?? ""),
      caption: String(x.caption ?? "").replace(/\s+/g, " ").slice(0, 80),
      views: x.views == null ? null : Number(x.views),
    });
  }
}

type Cell = { searches: Map<string, number>; calls: number; found: number; passed: number; seen: Set<string>; dup: number; useful: Set<string>; fresh: number; usefulBySearch: Map<string, number> };
const cells = new Map<string, Cell>();
const cellOf = (k: string) => {
  let c = cells.get(k);
  if (!c) cells.set(k, (c = { searches: new Map(), calls: 0, found: 0, passed: 0, seen: new Set(), dup: 0, useful: new Set(), fresh: 0, usefulBySearch: new Map() }));
  return c;
};
for (const r of [...rows].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))) {
  for (const key of [`${r.scoring}|${r.topicSlug}|${r.platform}`, `${r.scoring}|ALL|ALL`]) {
    const c = cellOf(key);
    c.searches.set(r.searchId, 1);
    c.calls += Number(r.calls ?? 0);
    c.found += Number(r.found);
    c.passed += Number(r.passed);
    if (!c.usefulBySearch.has(r.searchId)) c.usefulBySearch.set(r.searchId, 0);
    for (const id of ids(r.passedIds)) {
      const k = `${r.platform}:${id}`;
      if (c.seen.has(k)) {
        c.dup += 1;
        continue;
      }
      c.seen.add(k);
      const f = facts.get(k);
      const isNew = !f || f.createdAt >= snapshotAt;
      if (!isNew) {
        c.dup += 1;
        continue;
      }
      if (f && (f.status === "viral" || f.status === "rising")) {
        c.useful.add(k);
        c.usefulBySearch.set(r.searchId, (c.usefulBySearch.get(r.searchId) ?? 0) + 1);
        if (f.publishedAt && new Date(r.createdAt).getTime() - f.publishedAt.getTime() <= 30 * 86_400_000) c.fresh += 1;
      }
    }
  }
}

const meanCi = (xs: number[]) => {
  const n = xs.length;
  if (n === 0) return "-";
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1)) : 0;
  return `${m.toFixed(2)} [${Math.max(0, m - (1.96 * sd) / Math.sqrt(n)).toFixed(2)}, ${(m + (1.96 * sd) / Math.sqrt(n)).toFixed(2)}]`;
};
console.log("\narm | topic | platform | searches | calls | useful | useful/search (95% CI) | useful/100 calls | off-topic | duplicate | fresh share | $/useful");
for (const [key, c] of [...cells].sort(([a], [b]) => a.localeCompare(b))) {
  const [arm, topic, platform] = key.split("|");
  const n = c.searches.size;
  const useful = c.useful.size;
  console.log(
    [
      arm, topic, platform, n, c.calls.toFixed(0), useful, meanCi([...c.usefulBySearch.values()]),
      c.calls ? ((100 * useful) / c.calls).toFixed(2) : "-",
      c.found ? `${((1 - c.passed / c.found) * 100).toFixed(0)}%` : "-",
      c.passed ? `${((c.dup / c.passed) * 100).toFixed(0)}%` : "-",
      useful ? `${((c.fresh / useful) * 100).toFixed(0)}%` : "-",
      useful ? `$${((c.calls * USD_PER_CALL) / useful).toFixed(3)}` : "-",
    ].join(" | ")
  );
}
const topics = [...new Set(rows.map(r => r.topicSlug))];
for (const arm of ["v1", "v2"]) {
  const covered = topics.filter(t => [...cells].some(([k, c]) => k.startsWith(`${arm}|${t}|`) && c.useful.size > 0)).length;
  console.log(`COVERAGE ${arm}: ${covered}/${topics.length} niches with at least one useful video`);
}
console.log("\nMANUAL REVIEW SAMPLE (10 random useful videos per arm per niche)");
for (const arm of ["v1", "v2"]) {
  for (const t of topics) {
    const pool = [...cells].filter(([k]) => k.startsWith(`${arm}|${t}|`)).flatMap(([, c]) => [...c.useful]);
    const pick = pool.sort(() => Math.random() - 0.5).slice(0, 10);
    console.log(`--- ${arm} / ${t} (${pool.length} useful)`);
    for (const k of pick) {
      const f = facts.get(k);
      console.log(`  ${k} | ${f?.status} | views ${f?.views ?? "?"} | ${f?.url} | ${f?.caption}`);
    }
  }
}
await conn.end();
