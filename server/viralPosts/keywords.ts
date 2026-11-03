/**
 * Keyword bank (Phase 1): real search phrases per topic and platform, scored
 * by how well they find on-topic viral videos and good creators.
 *
 * Where phrases come from (real demand first, AI last):
 * - YouTube autocomplete: what people type into YouTube search;
 * - Google autocomplete: what people type into Google;
 * - hashtags of the topic's viral videos in our library: proven creator
 *   language;
 * - AI-written phrases stay the fallback when the bank has nothing.
 *
 * How they are used: discovery (TikTok, YouTube) and creator search ask the
 * bank for phrases: mostly proven winners, some untried ones (explore), and
 * record what each phrase found (videos, passed the topic check) and, later,
 * how many turned out viral and how many creators were good. Phrases that
 * keep scoring low are retired; the harvest brings new ones.
 *
 * Needs migration drizzle/0111_viral_keywords.sql; before it runs, every
 * function here is a quiet no-op and discovery keeps using AI phrases.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { viralKeywordHits, viralKeywords, viralTopics } from "../../drizzle/viralLibrarySchema";
import { getDb } from "../db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type KeywordPlatform = "youtube" | "tiktok" | "instagram";

const READY_RECHECK_MS = 10 * 60_000;
let ready: { ok: boolean; at: number } | null = null;

export async function isKeywordsReady(db: Db): Promise<boolean> {
  if (ready && (ready.ok || Date.now() - ready.at < READY_RECHECK_MS)) return ready.ok;
  try {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('viral_keywords','viral_keyword_hits')`
    )) as unknown as [Array<{ n: number | string }>];
    ready = { ok: Number(rows?.[0]?.n ?? 0) === 2, at: Date.now() };
  } catch {
    ready = { ok: false, at: Date.now() };
  }
  return ready.ok;
}

/* ---------- pure helpers (exported for tests) ---------- */

/** Clean a phrase for searching; null when it is not a usable phrase. */
export function normalizePhrase(raw: string): string | null {
  const s = raw.replace(/#/g, " ").replace(/[^\p{L}\p{N}\s'&-]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
  if (s.length < 3 || s.length > 80) return null;
  const words = s.split(" ").length;
  return words >= 1 && words <= 7 ? s : null;
}

/** Google/YouTube autocomplete ("client=firefox") answers ["query", ["s1", "s2", ...]]. */
export function parseAutocomplete(body: unknown): string[] {
  if (!Array.isArray(body) || !Array.isArray(body[1])) return [];
  return (body[1] as unknown[]).filter((s): s is string => typeof s === "string");
}

/** Demand 0-100 from the suggestion's position (first = most searched). */
export function demandFromRank(rank: number, total: number, sourceWeight = 1): number {
  if (total <= 0) return 0;
  const base = 100 - Math.round((rank / Math.max(1, total)) * 50);
  return Math.max(10, Math.min(100, Math.round(base * sourceWeight)));
}

/** Split a camel-free hashtag like "homeworkout" is kept whole; "home_workout" becomes "home workout". */
export function hashtagToPhrase(tag: string): string | null {
  return normalizePhrase(tag.replace(/^#/, "").replace(/[_-]+/g, " "));
}

export type KeywordStats = {
  demand: number;
  runs: number;
  found: number;
  passed: number;
  viral: number;
  creatorsFound: number;
  goodCreators: number;
};

/**
 * Higher is better. Demand counts most for untried phrases; once a phrase
 * has results, what it actually found counts most (smoothed so one lucky or
 * unlucky run does not decide).
 */
export function keywordScore(k: KeywordStats): number {
  const passRate = (k.passed + 1) / (k.found + 3);
  const viralRate = (k.viral + 0.5) / (k.passed + 3);
  const creatorRate = (k.goodCreators + 0.5) / (k.creatorsFound + 3);
  const evidence = Math.min(1, k.runs / 3);
  const measured = passRate * 0.4 + viralRate * 0.4 + creatorRate * 0.2;
  return (1 - evidence) * (k.demand / 100) * 0.6 + evidence * measured + (k.demand / 100) * 0.15;
}

/** Retire a phrase that keeps failing. */
export function shouldRetire(k: KeywordStats): boolean {
  if (k.runs >= 2 && k.found >= 5 && k.passed / k.found < 0.2) return true;
  if (k.runs >= 4 && k.viral === 0 && k.goodCreators === 0) return true;
  return false;
}

/**
 * Pick `count` phrases: about 70% best-scoring tried phrases (exploit) and
 * 30% untried ones by demand (explore); falls back to whatever is available.
 */
export function pickKeywords<T extends KeywordStats & { phrase: string }>(rows: T[], count: number): T[] {
  if (count <= 0 || rows.length === 0) return [];
  const tried = rows.filter(r => r.runs > 0).sort((a, b) => keywordScore(b) - keywordScore(a));
  const untried = rows.filter(r => r.runs === 0).sort((a, b) => b.demand - a.demand);
  const exploreSlots = untried.length > 0 ? Math.max(1, Math.round(count * 0.3)) : 0;
  const out: T[] = [...tried.slice(0, count - Math.min(exploreSlots, count)), ...untried.slice(0, exploreSlots)];
  for (const r of [...tried, ...untried]) {
    if (out.length >= count) break;
    if (!out.includes(r)) out.push(r);
  }
  return out.slice(0, count);
}

/* ---------- harvest ---------- */

async function fetchAutocomplete(query: string, youtube: boolean): Promise<string[]> {
  const url = new URL("https://suggestqueries.google.com/complete/search");
  url.searchParams.set("client", "firefox");
  if (youtube) url.searchParams.set("ds", "yt");
  url.searchParams.set("q", query);
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return [];
    return parseAutocomplete(await res.json());
  } catch {
    return [];
  }
}

type Harvested = { phrase: string; source: string; demand: number; platforms: KeywordPlatform[] };

/** Real search phrases for one topic. No paid calls. */
export async function harvestTopicPhrases(db: Db, topic: { slug: string; label: string }): Promise<Harvested[]> {
  const label = topic.label.toLowerCase();
  const seeds = [label, `${label} tips`, `how to ${label}`];
  const byPhrase = new Map<string, Harvested>();
  const add = (raw: string, source: string, demand: number, platforms: KeywordPlatform[]) => {
    const phrase = normalizePhrase(raw);
    if (!phrase) return;
    const prev = byPhrase.get(phrase);
    if (prev) {
      // Found by two sources: real demand, rank it higher.
      prev.demand = Math.min(100, Math.max(prev.demand, demand) + 10);
      prev.platforms = [...new Set([...prev.platforms, ...platforms])];
      return;
    }
    byPhrase.set(phrase, { phrase, source, demand, platforms });
  };

  for (const seed of seeds) {
    const yt = await fetchAutocomplete(seed, true);
    yt.forEach((s, i) => add(s, "youtube_autocomplete", demandFromRank(i, yt.length), ["youtube", "tiktok"]));
    const google = await fetchAutocomplete(seed, false);
    google.forEach((s, i) => add(s, "google_autocomplete", demandFromRank(i, google.length, 0.85), ["youtube", "tiktok", "instagram"]));
  }

  // Hashtags of this topic's viral videos: the words creators who win use.
  const [tagRows] = (await db.execute(sql`
    SELECT c.hashtags AS hashtags
    FROM viral_video_topics vt
    JOIN viral_library_status s ON s.candidateId = vt.candidateId
    JOIN viral_post_candidates c ON c.id = vt.candidateId
    WHERE vt.topicSlug = ${topic.slug} AND s.status IN ('viral','rising') AND c.hashtags IS NOT NULL
    LIMIT 300
  `)) as unknown as [Array<{ hashtags: unknown }>];
  const counts = new Map<string, number>();
  for (const r of tagRows ?? []) {
    const tags = typeof r.hashtags === "string" ? (JSON.parse(r.hashtags) as unknown) : r.hashtags;
    if (!Array.isArray(tags)) continue;
    for (const t of tags) {
      const p = typeof t === "string" ? hashtagToPhrase(t) : null;
      if (p && !["fyp", "foryou", "foryoupage", "viral", "reels", "trending", "explore", "shorts"].includes(p.replace(/\s/g, ""))) {
        counts.set(p, (counts.get(p) ?? 0) + 1);
      }
    }
  }
  const topTags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  topTags.forEach(([p, n], i) => add(p, "viral_hashtag", Math.min(100, 40 + n * 5 - i), ["instagram", "tiktok"]));

  return [...byPhrase.values()];
}

/** Save harvested phrases (existing phrases keep their stats; demand is refreshed upward). */
async function saveHarvest(db: Db, topicSlug: string, phrases: Harvested[]): Promise<number> {
  const rows = phrases.flatMap(h =>
    h.platforms.map(platform => ({ topicSlug, platform, phrase: h.phrase, source: h.source, demand: h.demand }))
  );
  if (rows.length === 0) return 0;
  await db
    .insert(viralKeywords)
    .values(rows)
    .onDuplicateKeyUpdate({ set: { demand: sql`GREATEST(demand, VALUES(demand))` } });
  return rows.length;
}

/** Harvest phrases for up to `max` topics that have none or a stale set (30+ days). Never throws. */
export async function harvestDueTopics(args: { max?: number } = {}): Promise<{ topics: number; phrases: number }> {
  const out = { topics: 0, phrases: 0 };
  const db = await getDb();
  if (!db || !(await isKeywordsReady(db))) return out;
  try {
    const [due] = (await db.execute(sql`
      SELECT t.slug AS slug, t.label AS label
      FROM viral_topics t
      LEFT JOIN (SELECT topicSlug, MAX(createdAt) AS newest, COUNT(*) AS n FROM viral_keywords GROUP BY topicSlug) k
        ON k.topicSlug = t.slug
      WHERE k.n IS NULL OR k.newest < (NOW() - INTERVAL 30 DAY)
      ORDER BY (SELECT COUNT(*) FROM viral_profile_topics pt WHERE pt.topicSlug = t.slug) DESC
      LIMIT ${Math.max(1, Math.min(10, args.max ?? 2))}
    `)) as unknown as [Array<{ slug: string; label: string }>];
    for (const topic of due ?? []) {
      const phrases = await harvestTopicPhrases(db, topic);
      out.phrases += await saveHarvest(db, topic.slug, phrases);
      out.topics += 1;
    }
    if (out.topics > 0) console.info("[viralLibrary] keywords_harvested", out);
  } catch (err) {
    console.warn("[viralLibrary] keyword_harvest_failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return out;
}

/* ---------- use in discovery ---------- */

/**
 * Instagram hashtag for a search phrase: "Meal prep for beginners" ->
 * "mealprepforbeginners". Null when too short or too long to be a real tag.
 * Pure; exported for tests.
 */
export function phraseToHashtag(phrase: string): string | null {
  const tag = phrase.toLowerCase().replace(/[^a-z0-9\s]+/g, "").split(/\s+/).filter(Boolean).join("");
  return tag.length >= 3 && tag.length <= 40 ? tag : null;
}

/** The same pick, limited to the phrases that were actually searched. Pure; exported for tests. */
export function searchedPick(pick: KeywordPick, searched: Iterable<string>): KeywordPick {
  const keep = new Set(searched);
  return {
    topicSlug: pick.topicSlug,
    queries: pick.queries.filter(q => keep.has(q)),
    idByQuery: new Map([...pick.idByQuery].filter(([q]) => keep.has(q))),
  };
}

export type KeywordPick = { topicSlug: string; queries: string[]; idByQuery: Map<string, number> };

async function topicSlugForPillar(db: Db, pillar: string): Promise<string | null> {
  const [row] = await db
    .select({ slug: viralTopics.slug })
    .from(viralTopics)
    .where(sql`LOWER(${viralTopics.label}) = ${pillar.trim().toLowerCase()}`)
    .limit(1);
  return row?.slug ?? null;
}

/**
 * Phrases for one pool search, or null when the bank has none (the caller
 * then uses its AI-written phrases, as before). Never throws.
 */
export async function keywordQueriesFor(args: {
  pillar: string;
  platform: KeywordPlatform;
  count: number;
}): Promise<KeywordPick | null> {
  try {
    const db = await getDb();
    if (!db || !(await isKeywordsReady(db))) return null;
    const topicSlug = await topicSlugForPillar(db, args.pillar);
    if (!topicSlug) return null;
    const rows = await db
      .select()
      .from(viralKeywords)
      .where(and(eq(viralKeywords.topicSlug, topicSlug), eq(viralKeywords.platform, args.platform), eq(viralKeywords.retired, 0)))
      .orderBy(desc(viralKeywords.demand))
      .limit(200);
    const picked = pickKeywords(rows, args.count);
    if (picked.length === 0) return null;
    await db
      .update(viralKeywords)
      .set({ lastUsedAt: new Date() })
      .where(inArray(viralKeywords.id, picked.map(p => p.id)));
    return { topicSlug, queries: picked.map(p => p.phrase), idByQuery: new Map(picked.map(p => [p.phrase, p.id])) };
  } catch (err) {
    console.warn("[viralLibrary] keyword_pick_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

/**
 * Record one search: per phrase, videos found and videos that passed the
 * topic check (and which ones, to count viral ones later). Never throws.
 */
export async function recordVideoSearch(args: {
  pick: KeywordPick;
  platform: KeywordPlatform;
  foundByQuery: Map<string, number>;
  passedByQuery: Map<string, string[]>;
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    for (const [query, id] of args.pick.idByQuery) {
      const found = args.foundByQuery.get(query) ?? 0;
      const passed = args.passedByQuery.get(query) ?? [];
      await db
        .update(viralKeywords)
        .set({ runs: sql`runs + 1`, found: sql`found + ${found}`, passed: sql`passed + ${passed.length}` })
        .where(eq(viralKeywords.id, id));
      if (passed.length > 0) {
        await db
          .insert(viralKeywordHits)
          .ignore()
          .values(passed.map(sourceId => ({ keywordId: id, platform: args.platform, sourceId, creatorHandle: "" })));
      }
    }
  } catch (err) {
    console.warn("[viralLibrary] keyword_record_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Record a creator search: the phrase, and which creators it found (good ones are counted later). */
export async function recordCreatorSearch(args: {
  keywordId: number;
  platform: KeywordPlatform;
  handles: string[];
}): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    await db
      .update(viralKeywords)
      .set({ runs: sql`runs + 1`, creatorsFound: sql`creatorsFound + ${args.handles.length}` })
      .where(eq(viralKeywords.id, args.keywordId));
    if (args.handles.length > 0) {
      await db
        .insert(viralKeywordHits)
        .ignore()
        .values(args.handles.map(h => ({ keywordId: args.keywordId, platform: args.platform, sourceId: "", creatorHandle: h.toLowerCase() })));
    }
  } catch (err) {
    console.warn("[viralLibrary] keyword_record_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * Update viral videos and good creators per recently used phrase from the
 * library's verdicts, then retire phrases that keep failing. Never throws.
 */
export async function refreshKeywordOutcomes(): Promise<{ updated: number; retired: number }> {
  const out = { updated: 0, retired: 0 };
  const db = await getDb();
  if (!db || !(await isKeywordsReady(db))) return out;
  try {
    const [upd] = (await db.execute(sql`
      UPDATE viral_keywords k
      SET viral = (
            SELECT COUNT(DISTINCT c.id) FROM viral_keyword_hits h
            JOIN viral_post_candidates c ON c.platform = h.platform AND c.sourceId = h.sourceId
            JOIN viral_library_status s ON s.candidateId = c.id
            WHERE h.keywordId = k.id AND h.sourceId <> '' AND s.status = 'viral'
          ),
          goodCreators = (
            SELECT COUNT(DISTINCT h.creatorHandle) FROM viral_keyword_hits h
            WHERE h.keywordId = k.id AND h.sourceId = '' AND EXISTS (
              SELECT 1 FROM viral_post_candidates c
              JOIN viral_library_status s ON s.candidateId = c.id
              WHERE c.platform = h.platform
                AND LOWER(TRIM(LEADING '@' FROM c.creatorHandle)) = h.creatorHandle
                AND s.status = 'viral'
            )
          )
      WHERE k.lastUsedAt >= (NOW() - INTERVAL 30 DAY)
    `)) as unknown as [{ affectedRows?: number }];
    out.updated = upd?.affectedRows ?? 0;
    const [ret] = (await db.execute(sql`
      UPDATE viral_keywords SET retired = 1
      WHERE retired = 0 AND (
        (runs >= 2 AND found >= 5 AND passed / found < 0.2)
        OR (runs >= 4 AND viral = 0 AND goodCreators = 0)
      )
    `)) as unknown as [{ affectedRows?: number }];
    out.retired = ret?.affectedRows ?? 0;
    if (out.updated > 0 || out.retired > 0) console.info("[viralLibrary] keyword_outcomes", out);
  } catch (err) {
    console.warn("[viralLibrary] keyword_outcomes_failed", { error: err instanceof Error ? err.message : String(err) });
  }
  return out;
}
