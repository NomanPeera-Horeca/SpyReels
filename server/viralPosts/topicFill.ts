/**
 * One-time topic fill: search every topic on TikTok, YouTube and Instagram with the existing pool pipeline, so the shared library has viral
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
 *   (default "tiktok,youtube,instagram").
 * Never throws into the caller.
 */
import { eq, sql } from "drizzle-orm";
import { viralPostPools } from "../../drizzle/schema";
import { scrapeCreatorsOutOfCredits, scrapeCreatorsOutOfCreditsSince } from "../scrapeCreatorsMeter";
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
  return (process.env.VIRAL_TOPIC_FILL_PLATFORMS ?? "tiktok,youtube,instagram")
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
  skipped?: "db_unavailable" | "migration_missing" | "budget_reached" | "no_platforms" | "done" | "out_of_credits";
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
  // Provider out of credits: searching now would only record empty topics.
  if (scrapeCreatorsOutOfCredits()) return { ...out, skipped: "out_of_credits" };
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
      const started = Date.now();
      const r = await refreshPoolById(pool.id, { force: true });
      if (scrapeCreatorsOutOfCreditsSince(started)) {
        // The provider ran out of credits during this search: its empty result
        // is not real. Leave the topic unsearched (and unbilled) and stop.
        await db.update(viralPostPools).set({ lastRefreshedAt: null }).where(eq(viralPostPools.id, pool.id));
        console.warn("[viralLibrary] fill_paused_out_of_credits", { poolKey: pool.poolKey });
        return { ...out, spentTotalUsd: spent, remaining: pending.length - out.searched, skipped: "out_of_credits" };
      }
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

/* ---------- recurring topic refresh (after the one-time fill) ---------- */

/** Topics our creators have: searched again after this many days (VIRAL_TOPIC_REFRESH_DAYS). */
export const REFRESH_DEMAND_DAYS = 3;
/** Every other topic: searched again after this many days (VIRAL_TOPIC_REFRESH_OTHER_DAYS). */
export const REFRESH_OTHER_DAYS = 14;

function envDays(name: string, fallback: number): number {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function topicRefreshWeeklyBudgetUsd(): number {
  const n = Number(process.env.VIRAL_TOPIC_REFRESH_WEEKLY_USD);
  return Number.isFinite(n) && n >= 0 ? n : 10;
}

/** Spend key for the ISO-like week of `d` (max 10 chars, fits viral_processing_spend.day). Pure; exported for tests. */
export function refreshWeekKey(d = new Date()): string {
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.floor((d.getTime() - start) / (7 * 86_400_000)) + 1;
  return `rf${d.getUTCFullYear()}w${String(week).padStart(2, "0")}`;
}

/**
 * Which already-searched topic pools are due again, most wanted first.
 * Pure; exported for tests.
 */
export function pickDueRefreshes<T extends { creators: number; lastRefreshedAt: Date | null }>(
  rows: T[],
  now = new Date()
): T[] {
  const dayMs = 86_400_000;
  const demandDays = envDays("VIRAL_TOPIC_REFRESH_DAYS", REFRESH_DEMAND_DAYS);
  const otherDays = envDays("VIRAL_TOPIC_REFRESH_OTHER_DAYS", REFRESH_OTHER_DAYS);
  return rows
    .filter(r => {
      if (!r.lastRefreshedAt) return false; // never searched: that is the fill's job
      const days = r.creators > 0 ? demandDays : otherDays;
      return now.getTime() - r.lastRefreshedAt.getTime() >= days * dayMs;
    })
    .sort(
      (a, b) =>
        b.creators - a.creators ||
        (a.lastRefreshedAt?.getTime() ?? 0) - (b.lastRefreshedAt?.getTime() ?? 0)
    );
}

/**
 * Keep the library fresh: search topics again on a schedule (topics our
 * creators have every 3 days, the rest every 14), new viral videos flow into
 * the library as with the fill. Weekly cap VIRAL_TOPIC_REFRESH_WEEKLY_USD
 * (default $10). Pauses while ScrapeCreators is out of credits. Never throws.
 */
export async function runTopicRefresh(args: { maxPools?: number } = {}): Promise<{
  searched: number;
  candidates: number;
  costUsd: number;
  spentWeekUsd: number;
  due: number;
  skipped?: "db_unavailable" | "migration_missing" | "no_platforms" | "budget_reached" | "out_of_credits" | "none_due";
}> {
  const out = { searched: 0, candidates: 0, costUsd: 0, spentWeekUsd: 0, due: 0 };
  const db = await getDb();
  if (!db) return { ...out, skipped: "db_unavailable" };
  if (!(await isTopicsReady(db))) return { ...out, skipped: "migration_missing" };
  const platforms = topicFillPlatforms();
  if (platforms.length === 0) return { ...out, skipped: "no_platforms" };
  if (scrapeCreatorsOutOfCredits()) return { ...out, skipped: "out_of_credits" };
  const weekKey = refreshWeekKey();
  const budget = topicRefreshWeeklyBudgetUsd();
  const [weekRow] = await db.select().from(viralProcessingSpend).where(eq(viralProcessingSpend.day, weekKey)).limit(1);
  let spent = weekRow ? Number(weekRow.usd) : 0;
  out.spentWeekUsd = spent;
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
  const demandByKey = new Map(
    topics.flatMap(t =>
      platforms.map(platform => [
        buildPoolKey({ platform, niche: fillNicheForCategory(t.category), pillar: t.label }),
        creators.get(t.slug) ?? 0,
      ] as const)
    )
  );
  const existing = await poolRepo.findExistingPools(plan);
  const due = pickDueRefreshes(
    existing.map(p => ({ pool: p, creators: demandByKey.get(p.poolKey) ?? 0, lastRefreshedAt: p.lastRefreshedAt }))
  );
  out.due = due.length;
  if (due.length === 0) return { ...out, skipped: "none_due" };

  for (const { pool } of due.slice(0, Math.max(1, Math.min(10, args.maxPools ?? 3)))) {
    if (spent >= budget) return { ...out, skipped: "budget_reached" };
    try {
      const started = Date.now();
      const r = await refreshPoolById(pool.id, { force: true });
      if (scrapeCreatorsOutOfCreditsSince(started)) {
        console.warn("[viralLibrary] topic_refresh_paused_out_of_credits", { poolKey: pool.poolKey });
        return { ...out, spentWeekUsd: spent, skipped: "out_of_credits" };
      }
      const cost = r.scCalls * usdPerCredit();
      spent += cost;
      out.searched += 1;
      out.candidates += r.status === "refreshed" ? r.candidateCount : 0;
      out.costUsd += cost;
      await db
        .insert(viralProcessingSpend)
        .values({ day: weekKey, usd: cost.toFixed(4), videos: 1 })
        .onDuplicateKeyUpdate({ set: { usd: sql`usd + ${cost.toFixed(4)}`, videos: sql`videos + 1` } });
    } catch (err) {
      console.warn("[viralLibrary] topic_refresh_failed", {
        poolKey: pool.poolKey,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  out.spentWeekUsd = spent;
  console.info("[viralLibrary] topic_refresh_done", { ...out, costUsd: Number(out.costUsd.toFixed(4)) });
  return out;
}
