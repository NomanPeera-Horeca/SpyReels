/**
 * Phrase picking for scoring v2 and for both experiment arms.
 *
 * Phrase history each scoring sees:
 * - production (no experiment): the live counters on viral_keywords and the
 *   whole search log;
 * - experiment arm: the counters frozen at the experiment start
 *   (viral_keyword_experiment_stats) plus only this arm's own searches in
 *   the log. Cooldowns are per arm too. So neither arm, nor production
 *   searches running meanwhile, change the other arm's conditions.
 */
import { sql } from "drizzle-orm";
import type { getDb } from "../db";
import { keywordScore, type KeywordPick, type KeywordPlatform, pickKeywords } from "./keywords";
import { classifyRelevance, storedTopicTerms, topicTerms, type RelevanceLabel } from "./keywordRelevance";
import { pickV2, platformMedian, scoreV2, type V2Input } from "./keywordScoringV2";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

type BankRow = {
  id: number;
  phrase: string;
  demand: number;
  runs: number;
  found: number;
  passed: number;
  viral: number;
  creatorsFound: number;
  goodCreators: number;
  retired: number;
};

/** The current retirement rule, applied to an arm's own view of the stats. Pure; exported for tests. */
export function retiredUnderCurrentRule(r: Pick<BankRow, "runs" | "found" | "passed" | "viral" | "goodCreators">): boolean {
  return (r.runs >= 2 && r.found >= 5 && r.passed / r.found < 0.2) || (r.runs >= 4 && r.viral === 0 && r.goodCreators === 0);
}

const medianCache = new Map<string, { at: number; value: number }>();

async function median(db: Db, platform: string, experimentId: number | null): Promise<number> {
  const key = `${platform}:${experimentId ?? "prod"}`;
  const hit = medianCache.get(key);
  if (hit && Date.now() - hit.at < 3_600_000) return hit.value;
  const [rows] = (experimentId == null
    ? await db.execute(sql`SELECT runs AS searches, passed FROM viral_keywords WHERE platform = ${platform} AND runs > 0`)
    : await db.execute(sql`
        SELECT s.runs AS searches, s.passed AS passed FROM viral_keyword_experiment_stats s
        JOIN viral_keywords k ON k.id = s.keywordId
        WHERE s.experimentId = ${experimentId} AND k.platform = ${platform} AND s.runs > 0
      `)) as unknown as [Array<{ searches: number; passed: number }>];
  const value = platformMedian((rows ?? []).map(r => ({ searches: Number(r.searches), passed: Number(r.passed) })));
  medianCache.set(key, { at: Date.now(), value });
  return value;
}

export async function pickForArm(
  db: Db,
  args: { topicSlug: string; platform: KeywordPlatform; count: number; scoring: "v1" | "v2"; experimentId: number | null }
): Promise<KeywordPick | null> {
  const [bank] = (await db.execute(sql`
    SELECT id, phrase, demand, runs, found, passed, viral, creatorsFound, goodCreators, retired
    FROM viral_keywords WHERE topicSlug = ${args.topicSlug} AND platform = ${args.platform}
    ORDER BY demand DESC LIMIT 400
  `)) as unknown as [BankRow[]];
  let rows = (bank ?? []).map(r => ({ ...r, demand: Number(r.demand), runs: Number(r.runs), found: Number(r.found), passed: Number(r.passed), viral: Number(r.viral), creatorsFound: Number(r.creatorsFound), goodCreators: Number(r.goodCreators), retired: Number(r.retired) }));
  if (rows.length === 0) return null;
  const ids = rows.map(r => r.id);
  const idList = sql.join(ids.map(id => sql`${id}`), sql`, `);

  // Arm view of the stats: frozen at start + this arm's own searches.
  if (args.experimentId != null) {
    const [snap] = (await db.execute(sql`
      SELECT keywordId, runs, found, passed, viral, creatorsFound, goodCreators, retired
      FROM viral_keyword_experiment_stats WHERE experimentId = ${args.experimentId} AND keywordId IN (${idList})
    `)) as unknown as [Array<Omit<BankRow, "id" | "phrase" | "demand"> & { keywordId: number }>];
    const [own] = (await db.execute(sql`
      SELECT keywordId, COUNT(*) AS runs, SUM(found) AS found, SUM(passed) AS passed
      FROM viral_keyword_searches WHERE experimentId = ${args.experimentId} AND scoring = ${args.scoring} AND keywordId IN (${idList})
      GROUP BY keywordId
    `)) as unknown as [Array<{ keywordId: number; runs: number; found: number; passed: number }>];
    const snapBy = new Map((snap ?? []).map(s => [Number(s.keywordId), s]));
    const ownBy = new Map((own ?? []).map(o => [Number(o.keywordId), o]));
    rows = rows.map(r => {
      const s = snapBy.get(r.id);
      const o = ownBy.get(r.id);
      return {
        ...r,
        runs: Number(s?.runs ?? 0) + Number(o?.runs ?? 0),
        found: Number(s?.found ?? 0) + Number(o?.found ?? 0),
        passed: Number(s?.passed ?? 0) + Number(o?.passed ?? 0),
        viral: Number(s?.viral ?? 0),
        creatorsFound: Number(s?.creatorsFound ?? 0),
        goodCreators: Number(s?.goodCreators ?? 0),
        retired: Number(s?.retired ?? 0),
      };
    });
  }

  if (args.scoring === "v1") {
    // Current scoring (experiment arm): same rule set as production, on the arm's own view.
    const live = rows.filter(r => !r.retired && !retiredUnderCurrentRule(r));
    const picked = pickKeywords(live, args.count);
    if (picked.length === 0) return null;
    return {
      topicSlug: args.topicSlug,
      queries: picked.map(p => p.phrase),
      idByQuery: new Map(picked.map(p => [p.phrase, p.id])),
      scoring: "v1",
      laneByQuery: new Map(picked.map(p => [p.phrase, p.runs > 0 ? "exploit" : "explore"])),
    };
  }

  // v2 inputs: Google volume, TikTok suggestion, relevance label, search history.
  const phraseList = sql.join(rows.map(r => sql`${r.phrase}`), sql`, `);
  const volumes = new Map<string, number | null>();
  try {
    const [v] = (await db.execute(sql`
      SELECT phrase, volume FROM viral_keyword_volumes WHERE source = 'google' AND location = 'US' AND phrase IN (${phraseList})
    `)) as unknown as [Array<{ phrase: string; volume: number | null }>];
    for (const r of v ?? []) volumes.set(r.phrase, r.volume == null ? null : Number(r.volume));
  } catch {
    // no volume table yet: every volume unknown
  }
  const [src] = (await db.execute(sql`
    SELECT DISTINCT phrase, source FROM viral_keywords WHERE topicSlug = ${args.topicSlug} AND source IN ('tiktok_autocomplete', 'viral_hashtag')
  `)) as unknown as [Array<{ phrase: string; source: string }>];
  const tiktok = new Set((src ?? []).filter(r => r.source === "tiktok_autocomplete").map(r => r.phrase));
  const fromTopicVideos = new Set((src ?? []).filter(r => r.source === "viral_hashtag").map(r => r.phrase));
  const [labels] = (await db.execute(sql`
    SELECT keywordId, label FROM viral_keyword_relevance WHERE keywordId IN (${idList})
  `)) as unknown as [Array<{ keywordId: number; label: RelevanceLabel }>];
  const labelBy = new Map((labels ?? []).map(l => [Number(l.keywordId), l.label]));
  const [topic] = (await db.execute(sql`SELECT label FROM viral_topics WHERE slug = ${args.topicSlug} LIMIT 1`)) as unknown as [Array<{ label: string }>];
  const terms = topicTerms(topic?.[0]?.label ?? args.topicSlug, await storedTopicTerms(db, args.topicSlug));
  const [hist] = (await (args.experimentId != null
    ? db.execute(sql`
        SELECT keywordId, passed, createdAt FROM viral_keyword_searches
        WHERE experimentId = ${args.experimentId} AND scoring = 'v2' AND keywordId IN (${idList}) ORDER BY createdAt DESC`)
    : db.execute(sql`
        SELECT keywordId, passed, createdAt FROM viral_keyword_searches
        WHERE experimentId IS NULL AND keywordId IN (${idList}) ORDER BY createdAt DESC`))) as unknown as [Array<{ keywordId: number; passed: number; createdAt: Date }>];
  const histBy = new Map<number, Array<{ passed: number; at: Date }>>();
  for (const h of hist ?? []) {
    const list = histBy.get(Number(h.keywordId)) ?? [];
    list.push({ passed: Number(h.passed), at: new Date(h.createdAt) });
    histBy.set(Number(h.keywordId), list);
  }
  const inputs: V2Input[] = rows.map(r => {
    const h = histBy.get(r.id) ?? [];
    return {
      id: r.id,
      phrase: r.phrase,
      demand: r.demand,
      searches: r.runs,
      found: r.found,
      passed: r.passed,
      googleVolume: volumes.has(r.phrase) ? (volumes.get(r.phrase) ?? null) : null,
      tiktokSuggested: tiktok.has(r.phrase),
      label: labelBy.get(r.id) ?? classifyRelevance({ phrase: r.phrase, terms, fromTopicVideos: fromTopicVideos.has(r.phrase) }),
      recentPassed: h.slice(0, 10).map(x => x.passed),
      lastSearchedAt: h[0]?.at ?? null,
      firstSearchedAt: h.length ? h[h.length - 1].at : null,
    };
  });
  const picked = pickV2(scoreV2(inputs, await median(db, args.platform, args.experimentId)), args.count);
  if (picked.length === 0) return null;
  return {
    topicSlug: args.topicSlug,
    queries: picked.map(p => p.phrase),
    idByQuery: new Map(picked.map(p => [p.phrase, p.id])),
    scoring: "v2",
    laneByQuery: new Map(picked.map(p => [p.phrase, p.pickedLane])),
  };
}

// Re-exported for the offline comparison script.
export { keywordScore };
