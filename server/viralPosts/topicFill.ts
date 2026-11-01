/**
 * One-time topic fill: search every topic on TikTok and YouTube (Instagram
 * later) with the existing pool pipeline, so the shared library has viral
 * videos in every niche before users arrive.
 *
 * - Reuses pools: one pool per (platform, category, topic), refreshed with the
 *   same search, viral check and admission as today. New videos flow into the
 *   library, get their viral verdict, and the worker reads them (understanding).
 * - Order: topics our creators actually have first (most creators first), then
 *   the rest of the approved list.
 * - Each pool's FIRST search only; later refreshes are the normal refresher's
 *   job. A few pools per call.
 * - Hard total cap: VIRAL_TOPIC_FILL_BUDGET_USD (default $20), counted from the
 *   provider calls each search reports, kept in viral_processing_spend under
 *   the key "fill-total". Platforms: VIRAL_TOPIC_FILL_PLATFORMS
 *   (default "tiktok,youtube").
 * Never throws into the caller.
 */
import { eq, sql } from "drizzle-orm";
import { viralProcessingSpend, viralProfileTopics, viralTopics } from "../../drizzle/viralLibrarySchema";
import { VIRAL_TOPIC_CATEGORY_LABELS } from "../../shared/viralTopics";
import { getDb } from "../db";
import {
  isViralPostsInstagramEnabled,
  isViralPostsTiktokEnabled,
  isViralPostsYoutubeEnabled,
} from "./featureFlag";
import { buildPoolKey } from "./constants";
import { refreshPoolById } from "./poolRefresh";
import * as poolRepo from "./poolRepository";
import { isTopicsReady } from "./topics";

const FILL_SPEND_KEY = "fill-total";
let warnedNoPlatforms = false;
/** After the normal starter pools (100) and seed pools (80) in the regular refresher. */
const FILL_POOL_PRIORITY = 110;

export function topicFillBudgetUsd(): number {
  const n = Number(process.env.VIRAL_TOPIC_FILL_BUDGET_USD);
  return Number.isFinite(n) && n >= 0 ? n : 20;
}

function usdPerCredit(): number {
  const n = Number(process.env.SCRAPECREATORS_USD_PER_CREDIT);
  return Number.isFinite(n) && n > 0 ? n : 0.002;
}

export function topicFillPlatforms(): string[] {
  const enabled: Record<string, boolean> = {
    tiktok: isViralPostsTiktokEnabled,
    youtube: isViralPostsYoutubeEnabled,
    instagram: isViralPostsInstagramEnabled,
  };
  return (process.env.VIRAL_TOPIC_FILL_PLATFORMS ?? "tiktok,youtube")
    .split(",")
    .map(p => p.trim().toLowerCase())
    .filter(p => enabled[p]);
}

export type FillTopic = { label: string; category: string; creators: number };

/** Pool niche name for a topic category (the taxonomy label, e.g. "Tech"). */
export function fillNicheForCategory(categorySlug: string): string {
  return VIRAL_TOPIC_CATEGORY_LABELS[categorySlug] ?? categorySlug;
}

/**
 * Search order: topics with creators first (most creators first), then the
 * rest; within a topic, platforms alternate. Pure; exported for tests.
 */
export function planFill(
  topics: FillTopic[],
  platforms: string[]
): Array<{ platform: string; niche: string; pillar: string }> {
  const ordered = topics
    .slice()
    .sort((a, b) => b.creators - a.creators || a.category.localeCompare(b.category) || a.label.localeCompare(b.label));
  return ordered.flatMap(t =>
    platforms.map(platform => ({ platform, niche: fillNicheForCategory(t.category), pillar: t.label }))
  );
}

async function fillSpent(db: NonNullable<Awaited<ReturnType<typeof getDb>>>): Promise<{ usd: number; pools: number }> {
  const [row] = await db.select().from(viralProcessingSpend).where(eq(viralProcessingSpend.day, FILL_SPEND_KEY)).limit(1);
  return { usd: row ? Number(row.usd) : 0, pools: row?.videos ?? 0 };
}

/**
 * Run the first search for up to `maxPools` topic pools that were never
 * searched. Returns what it did and how much is left.
 */
export async function runTopicFill(args: { maxPools?: number } = {}): Promise<{
  searched: number;
  candidates: number;
  costUsd: number;
  spentTotalUsd: number;
  remaining: number;
  skipped?: "db_unavailable" | "migration_missing" | "budget_reached" | "no_platforms" | "done";
}> {
  const out = { searched: 0, candidates: 0, costUsd: 0, spentTotalUsd: 0, remaining: 0 };
  const db = await getDb();
  if (!db) return { ...out, skipped: "db_unavailable" };
  if (!(await isTopicsReady(db))) return { ...out, skipped: "migration_missing" };
  const platforms = topicFillPlatforms();
  if (platforms.length === 0) {
    if (!warnedNoPlatforms) {
      warnedNoPlatforms = true;
      console.warn(
        "[viralLibrary] fill_idle: no platform is switched on in this service. Set VIRAL_POSTS_LIVE and VIRAL_POSTS_<PLATFORM>_ENABLED=true here (they are per service)."
      );
    }
    return { ...out, skipped: "no_platforms" };
  }
  const budget = topicFillBudgetUsd();
  let spent = (await fillSpent(db)).usd;
  out.spentTotalUsd = spent;
  if (spent >= budget) return { ...out, skipped: "budget_reached" };

  const [topics, demand] = await Promise.all([
    db.select({ slug: viralTopics.slug, label: viralTopics.label, category: viralTopics.category }).from(viralTopics),
    db
      .select({ slug: viralProfileTopics.topicSlug, n: sql<number>`count(*)` })
      .from(viralProfileTopics)
      .groupBy(viralProfileTopics.topicSlug),
  ]);
  const creators = new Map(demand.map(d => [d.slug, Number(d.n)]));
  const plan = planFill(
    topics.map(t => ({ label: t.label, category: t.category, creators: creators.get(t.slug) ?? 0 })),
    platforms
  );
  const existing = await poolRepo.findExistingPools(plan);
  const byKey = new Map(existing.map(p => [p.poolKey, p]));
  const pending = plan.filter(spec => {
    const pool = byKey.get(buildPoolKey(spec));
    return !pool || !pool.lastRefreshedAt;
  });
  out.remaining = pending.length;
  if (pending.length === 0) return { ...out, skipped: "done" };

  const batch = pending.slice(0, Math.max(1, Math.min(20, args.maxPools ?? 3)));
  const pools = await poolRepo.ensurePools(batch.map(spec => ({ ...spec, priority: FILL_POOL_PRIORITY })));
  for (const pool of pools) {
    if (spent >= budget) return { ...out, skipped: "budget_reached" };
    try {
      const r = await refreshPoolById(pool.id, { force: true });
      const cost = r.scCalls * usdPerCredit();
      spent += cost;
      out.searched += 1;
      out.candidates += r.status === "refreshed" ? r.candidateCount : 0;
      out.costUsd += cost;
      await db
        .insert(viralProcessingSpend)
        .values({ day: FILL_SPEND_KEY, usd: cost.toFixed(4), videos: 1 })
        .onDuplicateKeyUpdate({ set: { usd: sql`usd + ${cost.toFixed(4)}`, videos: sql`videos + 1` } });
      console.info("[viralLibrary] fill_pool", {
        poolKey: pool.poolKey,
        status: r.status,
        scCalls: r.scCalls,
        candidates: r.candidateCount,
      });
    } catch (err) {
      console.warn("[viralLibrary] fill_pool_failed", {
        poolKey: pool.poolKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  out.spentTotalUsd = spent;
  out.remaining = Math.max(0, pending.length - out.searched);
  console.info("[viralLibrary] fill_done", { ...out, costUsd: Number(out.costUsd.toFixed(4)) });
  return out;
}
