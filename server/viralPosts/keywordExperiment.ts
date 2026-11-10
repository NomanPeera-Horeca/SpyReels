/**
 * Scoring experiment: current scoring (v1) vs v2 on the same niches,
 * platforms, time window and per-search call budget.
 *
 * Off unless BOTH are true: KEYWORD_EXPERIMENT_RUNNER=on on the Queue Worker
 * and an experiment row has status 'ready' (set by hand after approval).
 *
 * - Start: the first worker to flip 'ready' -> 'running' (conditional
 *   update, so overlapping workers cannot both start it) records snapshotAt
 *   and freezes every phrase's stats for the experiment topics. Both arms
 *   score from that snapshot plus only their own searches (keywordPicker).
 * - Assignment: one search per tick. The cell (topic x platform) with the
 *   fewest searches goes next; within a cell the arm with fewer searches
 *   goes, ties broken by a seeded hash. So each cell gets the same number of
 *   searches per arm (block randomization), interleaved in time.
 * - Budget: every search is a normal pool refresh with the same fixed call
 *   ceiling for both arms (KEYWORD_EXPERIMENT_CALLS_PER_SEARCH, default 10).
 *   The experiment uses its own cap (maxUsd, checked before every search)
 *   instead of each pool's daily budget, so it can finish in hours.
 * - Pace: KEYWORD_EXPERIMENT_SEARCHES_PER_TICK searches per worker tick
 *   (default 3, every 5 minutes).
 * - Relevance labels for the experiment topics are prepared at start, so
 *   the v2 arm uses the same labels from its first search.
 * - While running, production topic refresh skips the experiment topics, so
 *   their pools are searched only by the experiment.
 * - Ends when every cell has minSearchesPerArm per arm ('done'), or the cap
 *   is reached ('stopped'). Rollback: set status to 'stopped'.
 * Production storage dedupes as always (one candidate per platform+video).
 */
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "../db";
import { buildPoolKey } from "./constants";
import { isScoringV2Ready } from "./keywordRelevance";
import { runWithKeywordArm } from "./keywords";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export type ExperimentRow = {
  id: number;
  status: string;
  topicSlugs: string[];
  platforms: string[];
  minSearchesPerArm: number;
  maxUsd: number;
  seed: number;
  snapshotAt: Date | null;
};

export type CellCounts = { topicSlug: string; platform: string; v1: number; v2: number };

export function experimentCallsPerSearch(): number {
  const n = Number(process.env.KEYWORD_EXPERIMENT_CALLS_PER_SEARCH);
  return Number.isFinite(n) && n >= 3 ? Math.floor(n) : 10;
}

/** Next cell and arm (fewest searches first; ties by seeded hash). Null when all cells reached the minimum. Pure; exported for tests. */
export function nextAssignment(cells: CellCounts[], minPerArm: number, seed: number): { topicSlug: string; platform: string; arm: "v1" | "v2" } | null {
  const open = cells.filter(c => c.v1 < minPerArm || c.v2 < minPerArm);
  if (open.length === 0) return null;
  const tieHash = (s: string) => parseInt(createHash("sha1").update(`${seed}:${s}`).digest("hex").slice(0, 8), 16);
  open.sort((a, b) => a.v1 + a.v2 - (b.v1 + b.v2) || tieHash(`${a.topicSlug}|${a.platform}`) - tieHash(`${b.topicSlug}|${b.platform}`));
  const c = open[0];
  const arm: "v1" | "v2" = c.v1 === c.v2 ? (tieHash(`${c.topicSlug}|${c.platform}|${c.v1}`) % 2 === 0 ? "v1" : "v2") : c.v1 < c.v2 ? "v1" : "v2";
  return { topicSlug: c.topicSlug, platform: c.platform, arm };
}

function parseJsonList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v) as unknown;
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

async function activeExperiment(db: Db): Promise<ExperimentRow | null> {
  const [rows] = (await db.execute(sql`
    SELECT id, status, topicSlugs, platforms, minSearchesPerArm, maxUsd, seed, snapshotAt
    FROM viral_keyword_experiments WHERE status IN ('ready','running') ORDER BY id LIMIT 1
  `)) as unknown as [Array<Record<string, unknown>>];
  const r = rows?.[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    status: String(r.status),
    topicSlugs: parseJsonList(r.topicSlugs),
    platforms: parseJsonList(r.platforms),
    minSearchesPerArm: Number(r.minSearchesPerArm),
    maxUsd: Number(r.maxUsd),
    seed: Number(r.seed),
    snapshotAt: r.snapshotAt ? new Date(r.snapshotAt as string) : null,
  };
}

let topicCache: { at: number; labels: Set<string> } | null = null;

/** Topic labels of a running experiment (production refresh skips them). Cached 5 minutes; empty when none. */
export async function experimentTopicLabels(): Promise<Set<string>> {
  if (topicCache && Date.now() - topicCache.at < 300_000) return topicCache.labels;
  const labels = new Set<string>();
  try {
    const db = await getDb();
    if (db && (await isScoringV2Ready(db))) {
      const exp = await activeExperiment(db);
      if (exp?.status === "running" && exp.topicSlugs.length) {
        const [rows] = (await db.execute(sql`
          SELECT label FROM viral_topics WHERE slug IN (${sql.join(exp.topicSlugs.map(s => sql`${s}`), sql`, `)})
        `)) as unknown as [Array<{ label: string }>];
        for (const r of rows ?? []) labels.add(r.label.trim().toLowerCase());
      }
    }
  } catch {
    // none
  }
  topicCache = { at: Date.now(), labels };
  return labels;
}

async function start(db: Db, exp: ExperimentRow): Promise<boolean> {
  const [res] = (await db.execute(sql`
    UPDATE viral_keyword_experiments SET status = 'running', snapshotAt = NOW(), startedAt = NOW()
    WHERE id = ${exp.id} AND status = 'ready'
  `)) as unknown as [{ affectedRows?: number }];
  if ((res?.affectedRows ?? 0) !== 1) return false;
  await db.execute(sql`
    INSERT IGNORE INTO viral_keyword_experiment_stats (experimentId, keywordId, runs, found, passed, viral, creatorsFound, goodCreators, retired)
    SELECT ${exp.id}, id, runs, found, passed, viral, creatorsFound, goodCreators, retired
    FROM viral_keywords WHERE topicSlug IN (${sql.join(exp.topicSlugs.map(s => sql`${s}`), sql`, `)})
  `);
  console.info("[viralLibrary] keyword_experiment_started", { id: exp.id, topics: exp.topicSlugs, platforms: exp.platforms });
  return true;
}

export function experimentSearchesPerTick(): number {
  const n = Number(process.env.KEYWORD_EXPERIMENT_SEARCHES_PER_TICK);
  return Number.isFinite(n) && n >= 1 ? Math.min(10, Math.floor(n)) : 3;
}

/** Up to KEYWORD_EXPERIMENT_SEARCHES_PER_TICK experiment searches. Never throws. */
export async function runKeywordExperimentTick(): Promise<{ ran: number; reason?: string }> {
  if (process.env.KEYWORD_EXPERIMENT_RUNNER !== "on") return { ran: 0, reason: "runner_off" };
  const db = await getDb();
  if (!db || !(await isScoringV2Ready(db))) return { ran: 0, reason: "not_ready" };
  let ran = 0;
  try {
    let exp = await activeExperiment(db);
    if (!exp) return { ran, reason: "no_experiment" };
    if (exp.status === "ready") {
      if (await start(db, exp)) {
        // Same relevance labels for the v2 arm from its first search.
        const { prepareKeywordRelevance } = await import("./keywordRelevance");
        await prepareKeywordRelevance({ topicSlugs: exp.topicSlugs, maxTopics: 10 });
      }
      exp = await activeExperiment(db);
      if (!exp || exp.status !== "running") return { ran, reason: "start_race" };
    }
    // Cells that have a pool (a cell without one cannot be searched and does not hold the experiment open).
    const { fillNicheForCategory } = await import("./topicFill");
    const poolByCell = new Map<string, number>();
    for (const topicSlug of exp.topicSlugs) {
      const [topic] = (await db.execute(sql`SELECT label, category FROM viral_topics WHERE slug = ${topicSlug} LIMIT 1`)) as unknown as [Array<{ label: string; category: string }>];
      const t = topic?.[0];
      if (!t) continue;
      for (const platform of exp.platforms) {
        const poolKey = buildPoolKey({ platform, niche: fillNicheForCategory(t.category), pillar: t.label });
        const [pool] = (await db.execute(sql`SELECT id FROM viral_post_pools WHERE poolKey = ${poolKey} LIMIT 1`)) as unknown as [Array<{ id: number }>];
        if (pool?.[0]?.id) poolByCell.set(`${topicSlug}|${platform}`, Number(pool[0].id));
      }
    }
    const ceiling = experimentCallsPerSearch();
    const { refreshPoolById } = await import("./poolRefresh");
    for (let i = 0; i < experimentSearchesPerTick(); i += 1) {
      const [spend] = (await db.execute(sql`
        SELECT COALESCE(SUM(calls), 0) AS calls FROM viral_keyword_searches WHERE experimentId = ${exp.id}
      `)) as unknown as [Array<{ calls: number }>];
      const usd = Number(spend?.[0]?.calls ?? 0) * (Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || 0.002);
      // Stop before a search that could cross the cap.
      if (usd + ceiling * (Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || 0.002) > exp.maxUsd) {
        await db.execute(sql`UPDATE viral_keyword_experiments SET status = 'stopped', endedAt = NOW() WHERE id = ${exp.id}`);
        console.warn("[viralLibrary] keyword_experiment_stopped_budget", { id: exp.id, usd });
        return { ran, reason: "budget" };
      }
      const [counts] = (await db.execute(sql`
        SELECT topicSlug, platform, scoring, COUNT(DISTINCT searchId) AS n
        FROM viral_keyword_searches WHERE experimentId = ${exp.id} GROUP BY topicSlug, platform, scoring
      `)) as unknown as [Array<{ topicSlug: string; platform: string; scoring: string; n: number }>];
      const cells: CellCounts[] = [...poolByCell.keys()].map(k => {
        const [topicSlug, platform] = k.split("|");
        return { topicSlug, platform, v1: 0, v2: 0 };
      });
      for (const c of counts ?? []) {
        const cell = cells.find(x => x.topicSlug === c.topicSlug && x.platform === c.platform);
        if (cell && (c.scoring === "v1" || c.scoring === "v2")) cell[c.scoring] = Number(c.n);
      }
      const next = nextAssignment(cells, exp.minSearchesPerArm, exp.seed);
      if (!next) {
        await db.execute(sql`UPDATE viral_keyword_experiments SET status = 'done', endedAt = NOW() WHERE id = ${exp.id}`);
        console.info("[viralLibrary] keyword_experiment_done", { id: exp.id, cells: cells.length });
        return { ran, reason: "done" };
      }
      const poolId = poolByCell.get(`${next.topicSlug}|${next.platform}`)!;
      const searchId = randomUUID();
      const r = await runWithKeywordArm({ scoring: next.arm, experimentId: exp.id, searchId }, () =>
        refreshPoolById(poolId, { force: true, maxScCalls: ceiling, ignoreDailyBudget: true })
      );
      if (r.status !== "refreshed") {
        // Skipped (lock, provider problem): not a search. Drop anything logged so both arms stay comparable.
        await db.execute(sql`DELETE FROM viral_keyword_searches WHERE searchId = ${searchId}`);
        console.warn("[viralLibrary] keyword_experiment_search_skipped", { id: exp.id, ...next, status: r.status });
        return { ran, reason: r.status };
      }
      // Spread the pool's provider calls over the phrases it logged; record the search even when no bank phrase was used.
      const [logged] = (await db.execute(sql`SELECT COUNT(*) AS n FROM viral_keyword_searches WHERE searchId = ${searchId}`)) as unknown as [Array<{ n: number }>];
      const n = Number(logged?.[0]?.n ?? 0);
      if (n > 0) {
        await db.execute(sql`UPDATE viral_keyword_searches SET calls = ${r.scCalls / n} WHERE searchId = ${searchId}`);
      } else {
        await db.execute(sql`
          INSERT INTO viral_keyword_searches (searchId, keywordId, topicSlug, platform, phrase, scoring, lane, experimentId, calls, found, passed, passedIds)
          VALUES (${searchId}, 0, ${next.topicSlug}, ${next.platform}, '(no bank phrase)', ${next.arm}, 'none', ${exp.id}, ${r.scCalls}, 0, 0, '[]')
        `);
      }
      ran += 1;
      console.info("[viralLibrary] keyword_experiment_search", { id: exp.id, ...next, calls: r.scCalls });
    }
    return { ran };
  } catch (err) {
    console.warn("[viralLibrary] keyword_experiment_failed", { error: err instanceof Error ? err.message : String(err) });
    return { ran, reason: "error" };
  }
}
