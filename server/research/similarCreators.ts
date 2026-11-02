/**
 * Similar-creator discovery: find NEW creators in the niches where the
 * library is thinnest, and pre-research them.
 *
 * ScrapeCreators has no "related accounts" data (checked 2026-11-02: the
 * Instagram field is empty, TikTok and YouTube have none), so this searches
 * creators by the topic's name instead:
 * - TikTok user search (30 creators, with followers and video counts):
 *   keeps active mid-size creators, the ones most likely to have outliers;
 * - Instagram account search (33 accounts, names only): keeps the first few.
 * YouTube has no channel search; its channels already come from Shorts search.
 *
 * Found creators go to pre-research (status "similar", after creators shown
 * to users and the weekly watchlist). Their videos then pass the same viral
 * rule, so only real outliers reach users. Each topic and platform is searched
 * at most once a week; RESEARCH_SIMILAR_PER_DAY (default 30) caps creators.
 */
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { researchPrefetch, viralProcessingSpend } from "../../drizzle/viralLibrarySchema";
import { noteScrapeCreatorsStatus, scrapeCreatorsOutOfCredits } from "../scrapeCreatorsMeter";
import { prefetchTargets } from "./prefetch";
import type { Db } from "./recentResearchSeed";

const API_BASE = "https://api.scrapecreators.com";
const PER_SEARCH = 5;
/** TikTok creators in this follower range are kept (mid-size breaks out most). */
const TIKTOK_MIN_FOLLOWERS = 10_000;
const TIKTOK_MAX_FOLLOWERS = 5_000_000;
const TIKTOK_MIN_VIDEOS = 20;

export function similarPerDay(): number {
  const n = Number(process.env.RESEARCH_SIMILAR_PER_DAY);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 30;
}

/** Spend-table key counting similar creators queued today (10 chars). Pure; exported for tests. */
export function similarDayKey(d = new Date()): string {
  return `sc${d.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

/** "Searched this week" marker for one topic + platform (10 chars). Pure; exported for tests. */
export function searchedKey(topicSlug: string, platform: string, d = new Date()): string {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.floor((d.getTime() - start) / (7 * 86_400_000)) + 1;
  const hash = createHash("sha1").update(`${platform}:${topicSlug}`).digest("hex").slice(0, 7);
  return `c${hash}${String(week).padStart(2, "0")}`;
}

type TikTokUser = { unique_id?: unknown; follower_count?: unknown; aweme_count?: unknown; secret?: unknown };

/** Active mid-size TikTok creators, closest to ~200k followers first. Pure; exported for tests. */
export function pickTikTokCreators(users: TikTokUser[], max = PER_SEARCH): string[] {
  return users
    .map(u => ({
      handle: typeof u.unique_id === "string" ? u.unique_id.trim() : "",
      followers: Number(u.follower_count),
      videos: Number(u.aweme_count),
      privateAccount: u.secret === true || u.secret === 1,
    }))
    .filter(
      u =>
        u.handle &&
        !u.privateAccount &&
        Number.isFinite(u.followers) &&
        u.followers >= TIKTOK_MIN_FOLLOWERS &&
        u.followers <= TIKTOK_MAX_FOLLOWERS &&
        (!Number.isFinite(u.videos) || u.videos >= TIKTOK_MIN_VIDEOS)
    )
    .sort((a, b) => Math.abs(Math.log10(a.followers) - 5.3) - Math.abs(Math.log10(b.followers) - 5.3))
    .slice(0, max)
    .map(u => u.handle);
}

/** First few Instagram accounts the search returned. Pure; exported for tests. */
export function pickInstagramCreators(users: Array<{ username?: unknown }>, max = PER_SEARCH): string[] {
  return users
    .map(u => (typeof u.username === "string" ? u.username.trim() : ""))
    .filter(Boolean)
    .slice(0, max);
}

async function scSearch(path: string, query: string): Promise<Record<string, unknown> | null> {
  const key = process.env.SCRAPECREATORS_API_KEY?.trim();
  if (!key) return null;
  const url = new URL(`${API_BASE}${path}`);
  url.searchParams.set("query", query);
  try {
    const res = await fetch(url, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(30_000) });
    noteScrapeCreatorsStatus(res.status);
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function searchCreators(platform: "tiktok" | "instagram", query: string): Promise<string[]> {
  if (platform === "tiktok") {
    const data = await scSearch("/v1/tiktok/search/users", query);
    const list = Array.isArray(data?.user_list) ? (data!.user_list as Array<{ user_info?: TikTokUser }>) : [];
    return pickTikTokCreators(list.map(x => x.user_info ?? (x as TikTokUser)));
  }
  const data = await scSearch("/v1/instagram/search", query);
  const users = Array.isArray(data?.users) ? (data!.users as Array<{ username?: unknown }>) : [];
  return pickInstagramCreators(users);
}

/**
 * Search the thinnest topics for new creators and queue them for
 * pre-research. Returns how many creators were queued; 0 on any error.
 */
export async function queueSimilarCreators(db: Db, limit: number): Promise<number> {
  if (process.env.RESEARCH_SIMILAR === "false") return 0;
  if (scrapeCreatorsOutOfCredits()) return 0;
  try {
    const dayKey = similarDayKey();
    const [today] = await db.select().from(viralProcessingSpend).where(eq(viralProcessingSpend.day, dayKey)).limit(1);
    const room = Math.min(limit, similarPerDay() - (today?.videos ?? 0));
    if (room <= 0) return 0;

    // Topics with the fewest viral/rising videos first; topics our creators have go first.
    const [topics] = (await db.execute(sql`
      SELECT t.slug AS slug, t.label AS label,
             (SELECT COUNT(*) FROM viral_profile_topics pt WHERE pt.topicSlug = t.slug) AS creators,
             (SELECT COUNT(*) FROM viral_video_topics vt
                JOIN viral_library_status s ON s.candidateId = vt.candidateId
               WHERE vt.topicSlug = t.slug AND s.status IN ('viral','rising')) AS videos
      FROM viral_topics t
      ORDER BY (creators > 0) DESC, videos ASC, creators DESC
      LIMIT 40
    `)) as unknown as [Array<{ slug: string; label: string }>];

    const queued: Array<{ platform: "tiktok" | "instagram"; handle: string }> = [];
    for (const topic of topics ?? []) {
      if (queued.length >= room) break;
      for (const platform of ["tiktok", "instagram"] as const) {
        if (queued.length >= room) break;
        const marker = searchedKey(topic.slug, platform);
        const [seen] = await db.select().from(viralProcessingSpend).where(eq(viralProcessingSpend.day, marker)).limit(1);
        if (seen) continue; // searched this week already
        const handles = await searchCreators(platform, topic.label);
        await db
          .insert(viralProcessingSpend)
          .values({ day: marker, usd: "0.0020", videos: handles.length })
          .onDuplicateKeyUpdate({ set: { videos: handles.length } });
        for (const t of prefetchTargets(handles.map(h => ({ platform, handle: h })))) {
          if (queued.length >= room) break;
          queued.push(t as { platform: "tiktok" | "instagram"; handle: string });
        }
        // Only one topic search per call: keeps each worker tick short.
        if (handles.length > 0) break;
      }
      if (queued.length > 0) break;
    }
    if (queued.length === 0) return 0;

    // New creators only; anyone already queued or researched keeps their row.
    const now = new Date();
    await db
      .insert(researchPrefetch)
      .ignore()
      .values(queued.map(q => ({ ...q, status: "similar", requestedAt: now })));
    await db
      .insert(viralProcessingSpend)
      .values({ day: dayKey, usd: "0", videos: queued.length })
      .onDuplicateKeyUpdate({ set: { videos: sql`videos + ${queued.length}` } });
    console.info("[research] similar_creators_queued", { creators: queued.length, handles: queued.map(q => `${q.platform}:${q.handle}`) });
    return queued.length;
  } catch (err) {
    console.warn("[research] similar_creators_failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}
