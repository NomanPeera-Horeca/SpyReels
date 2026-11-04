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
 *   A cell whose pool cannot afford the full ceiling today is skipped until
 *   the pool's daily budget resets, so no search runs on a smaller budget.
 *   Experiment calls in total are capped by maxUsd.
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

/** One experiment search. Never throws. */
export async function runKeywordExperimentTick(): Promise<{ ran: boolean; reason?: string }> {
  if (process.env.KEYWORD_EXPERIMENT_RUNNER !== "on") return { ran: false, reason: "runner_off" };
  const db = await getDb();
  if (!db || !(await isScoringV2Ready(db))) return { ran: false, reason: "not_ready" };
  try {
    let exp = await activeExperiment(db);
    if (!exp) return { ran: false, reason: "no_experiment" };
    if (exp.status === "ready") {
      await start(db, exp);
      exp = await activeExperiment(db);
      if (!exp || exp.status !== "running") return { ran: false, reason: "start_race" };
    }
    const [spend] = (await db.execute(sql`
      SELECT COALESCE(SUM(calls), 0) AS calls FROM viral_keyword_searches WHERE experimentId = ${exp.id}
    `)) as unknown as [Array<{ calls: number }>];
    const usd = Number(spend?.[0]?.calls ?? 0) * (Number(process.env.SCRAPECREATORS_USD_PER_CREDIT) || 0.002);
    if (usd >= exp.maxUsd) {
      await db.execute(sql`UPDATE viral_keyword_experiments SET status = 'stopped', endedAt = NOW() WHERE id = ${exp.id}`);
      console.warn("[viralLibrary] keyword_experiment_stopped_budget", { id: exp.id, usd });
      return { ran: false, reason: "budget" };
    }
    const [counts] = (await db.execute(sql`
      SELECT topicSlug, platform, scoring, COUNT(DISTINCT searchId) AS n
      FROM viral_keyword_searches WHERE experimentId = ${exp.id} GROUP BY topicSlug, platform, scoring
    `)) as unknown as [Array<{ topicSlug: string; platform: string; scoring: string; n: number }>];
    const cells: CellCounts[] = exp.topicSlugs.flatMap(t => exp!.platforms.map(p => ({ topicSlug: t, platform: p, v1: 0, v2: 0 })));
    for (const c of counts ?? []) {
      const cell = cells.find(x => x.topicSlug === c.topicSlug && x.platform === c.platform);
      if (cell && (c.scoring === "v1" || c.scoring === "v2")) cell[c.scoring] = Number(c.n);
    }
    if (!nextAssignment(cells, exp.minSearchesPerArm, exp.seed)) {
      await db.execute(sql`UPDATE viral_keyword_experiments SET status = 'done', endedAt = NOW() WHERE id = ${exp.id}`);
      console.info("[viralLibrary] keyword_experiment_done", { id: exp.id });
      return { ran: false, reason: "done" };
    }
    // Only cells whose pool can afford the full fixed ceiling today.
    const ceiling = experimentCallsPerSearch();
    const { fillNicheForCategory } = await import("./topicFill");
    const poolRepo = await import("./poolRepository");
    const poolByCell = new Map<string, number>();
    for (const c of cells) {
      const [topic] = (await db.execute(sql`SELECT label, category FROM viral_topics WHERE slug = ${c.topicSlug} LIMIT 1`)) as unknown as [Array<{ label: string; category: string }>];
      const t = topic?.[0];
      if (!t) continue;
      const poolKey = buildPoolKey({ platform: c.platform, niche: fillNicheForCategory(t.category), pillar: t.label });
      const [pool] = (await db.execute(sql`SELECT id, dailyCallBudget FROM viral_post_pools WHERE poolKey = ${poolKey} LIMIT 1`)) as unknown as [Array<{ id: number; dailyCallBudget: number }>];
      const p = pool?.[0];
      if (!p) continue;
      const used = await poolRepo.getBudgetUsed(Number(p.id));
      if (Number(p.dailyCallBudget) - used >= ceiling) poolByCell.set(`${c.topicSlug}|${c.platform}`, Number(p.id));
    }
    const next = nextAssignment(cells.filter(c => poolByCell.has(`${c.topicSlug}|${c.platform}`)), exp.minSearchesPerArm, exp.seed);
    if (!next) return { ran: false, reason: "waiting_for_pool_budget" };
    const poolId = poolByCell.get(`${next.topicSlug}|${next.platform}`)!;
    const searchId = randomUUID();
    const { refreshPoolById } = await import("./poolRefresh");
    const r = await runWithKeywordArm({ scoring: next.arm, experimentId: exp.id, searchId }, () =>
      refreshPoolById(poolId, { force: true, maxScCalls: ceiling })
    );
    if (r.status !== "refreshed") {
      // Skipped (lock, budget): not a search. Drop anything logged so both arms stay comparable.
      await db.execute(sql`DELETE FROM viral_keyword_searches WHERE searchId = ${searchId}`);
      return { ran: false, reason: r.status };
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
    console.info("[viralLibrary] keyword_experiment_search", { id: exp.id, ...next, calls: r.scCalls, status: r.status });
    return { ran: true };
  } catch (err) {
    console.warn("[viralLibrary] keyword_experiment_failed", { error: err instanceof Error ? err.message : String(err) });
    return { ran: false, reason: "error" };
  }
}
