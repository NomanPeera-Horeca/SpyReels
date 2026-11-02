/**
 * Pre-research of the creators shown on Home, so clicking one opens at once
 * even when no SpyReels user researched that creator yet.
 *
 * - Home and the Viral Posts page queue the creators they show
 *   (requestPrefetch, never blocks the page). When nothing shown is waiting,
 *   the worker starts on the library's strongest recent viral creators.
 * - The queue worker researches a few at a time in a hidden system workspace
 *   (runResearchPrefetch), with the normal research runners: last 30 days,
 *   at most 60 videos. A daily cap (RESEARCH_PREFETCH_DAILY_MAX, default 50
 *   creators) bounds cost; RESEARCH_PREFETCH=false turns it off.
 * - When a user then researches that creator, the existing recent-research
 *   seeding (recentResearchSeed.ts) copies these videos into their job
 *   instantly and the live research refreshes them.
 * - Creators researched by anyone in the last 14 days are skipped (free).
 *
 * Needs migration drizzle/0110_research_prefetch.sql (table + system
 * workspace); without it everything here is a quiet no-op.
 */
import { and, asc, eq, gte, sql } from "drizzle-orm";
import { normalizeInstagramHandle } from "@shared/socialHandles";
import { VIRAL_RULE } from "@shared/viralRule";
import {
  scrapeJobs,
  tiktokScrapeJobs,
  workspaces,
  youtubeScrapeJobs,
} from "../../drizzle/schema";
import { researchPrefetch } from "../../drizzle/viralLibrarySchema";
import { createScrapeJob, getDb } from "../db";
import { scrapeCreatorsOutOfCredits, scrapeCreatorsOutOfCreditsSince } from "../scrapeCreatorsMeter";
import {
  RECENT_RESEARCH_MAX_AGE_DAYS,
  recentResearchJobId,
  type Db,
  type ResearchPlatform,
} from "./recentResearchSeed";

export const PREFETCH_WORKSPACE_ID = "spyreels-system-prefetch";
export const PREFETCH_TIMEFRAME_DAYS = 30;
export const PREFETCH_MAX_VIDEOS = 60;

const READY_RECHECK_MS = 10 * 60_000;
let ready: { ownerUserId: number | null; at: number } | null = null;
let warnedNotReady = false;

export function prefetchDailyMax(): number {
  const n = Number(process.env.RESEARCH_PREFETCH_DAILY_MAX);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 50;
}

function prefetchEnabled(): boolean {
  return process.env.RESEARCH_PREFETCH !== "false";
}

/** Same handle form the research routers use. Pure; exported for tests. */
export function prefetchHandle(platform: string, raw: string): string {
  const clean = (raw || "").trim().replace(/^@+/, "");
  if (!clean) return "";
  return platform === "instagram" ? normalizeInstagramHandle(clean) : clean.toLowerCase();
}

/** Unique, valid (platform, handle) pairs. Pure; exported for tests. */
export function prefetchTargets(
  creators: Array<{ platform: string; handle: string }>
): Array<{ platform: ResearchPlatform; handle: string }> {
  const seen = new Set<string>();
  const out: Array<{ platform: ResearchPlatform; handle: string }> = [];
  for (const c of creators) {
    if (c.platform !== "instagram" && c.platform !== "tiktok" && c.platform !== "youtube") continue;
    const handle = prefetchHandle(c.platform, c.handle);
    if (!handle || handle.length > 128) continue;
    const key = `${c.platform}:${handle}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ platform: c.platform, handle });
  }
  return out;
}

/** Owner of the system workspace, or null until the migration ran. */
async function systemOwner(db: Db): Promise<number | null> {
  if (ready && (ready.ownerUserId != null || Date.now() - ready.at < READY_RECHECK_MS)) {
    return ready.ownerUserId;
  }
  let ownerUserId: number | null = null;
  try {
    const [tables] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'research_prefetch'`
    )) as unknown as [Array<{ n: number | string }>];
    if (Number(tables?.[0]?.n ?? 0) === 1) {
      const [ws] = await db
        .select({ ownerUserId: workspaces.ownerUserId })
        .from(workspaces)
        .where(eq(workspaces.id, PREFETCH_WORKSPACE_ID))
        .limit(1);
      ownerUserId = ws?.ownerUserId ?? null;
    }
  } catch {
    ownerUserId = null;
  }
  ready = { ownerUserId, at: Date.now() };
  if (ownerUserId == null && !warnedNotReady) {
    warnedNotReady = true;
    console.warn("[research] prefetch_idle: run drizzle/0110_research_prefetch.sql (table + system workspace)");
  }
  return ownerUserId;
}

/**
 * Queue creators for pre-research. New creators become pending; creators
 * whose last pre-research finished more than 14 days ago are queued again.
 * Never throws.
 */
export async function requestPrefetch(creators: Array<{ platform: string; handle: string }>): Promise<void> {
  if (!prefetchEnabled()) return;
  const targets = prefetchTargets(creators);
  if (targets.length === 0) return;
  try {
    const db = await getDb();
    if (!db || (await systemOwner(db)) == null) return;
    const now = new Date();
    const stale = sql`(status IN ('done','failed') AND finishedAt < (NOW() - INTERVAL ${RECENT_RESEARCH_MAX_AGE_DAYS} DAY))`;
    await db
      .insert(researchPrefetch)
      .values(targets.map(t => ({ ...t, status: "pending", requestedAt: now })))
      .onDuplicateKeyUpdate({
        // requestedAt first: MySQL applies these left to right, and the
        // status check must see the old status.
        set: {
          requestedAt: sql`IF(${stale}, NOW(), requestedAt)`,
          status: sql`IF(${stale}, 'pending', status)`,
        },
      });
  } catch (err) {
    console.warn("[research] prefetch_request_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

/** Queue the creators of videos a user is being shown (Home, Viral Posts). Never throws. */
export async function requestPrefetchForPosts(
  posts: Array<{ platform: string; creatorHandle?: string | null }>
): Promise<void> {
  await requestPrefetch(posts.map(p => ({ platform: p.platform, handle: p.creatorHandle ?? "" })));
}

/** Library rows read for seeding (more than needed: some are already queued). */
const LIBRARY_SEED_SCAN = 200;
/** Only creators active lately are worth pre-researching. */
const LIBRARY_SEED_RECENT_DAYS = 60;

/**
 * Queue up to `limit` creators of the library's strongest recent viral
 * videos (and YouTube channels still waiting for a verdict) that were never
 * queued. Returns how many were queued; 0 on any
 * error (for example before the library migration).
 */
export async function seedPrefetchFromLibrary(db: Db, limit: number): Promise<number> {
  try {
    const [rows] = (await db.execute(sql`
      SELECT c.platform AS platform, c.creatorHandle AS handle
      FROM viral_library_status s
      JOIN viral_post_candidates c ON c.id = s.candidateId
      WHERE (
          s.status = 'viral'
          -- YouTube Shorts from search stay "unknown" until their channel is
          -- researched (that gives its usual views): those go first, since
          -- they cannot show anywhere until then.
          OR (c.platform = 'youtube' AND s.status = 'unknown' AND c.views >= ${VIRAL_RULE.minViews})
        )
        AND c.creatorHandle IS NOT NULL AND c.creatorHandle <> ''
        AND LOWER(TRIM(LEADING '@' FROM c.creatorHandle)) <> 'youtube'
        AND (c.publishedAt IS NULL OR c.publishedAt >= (NOW() - INTERVAL ${LIBRARY_SEED_RECENT_DAYS} DAY))
      ORDER BY (s.status = 'unknown') DESC, s.multiple DESC, c.views DESC
      LIMIT ${LIBRARY_SEED_SCAN}
    `)) as unknown as [Array<{ platform: string; handle: string }>];
    const targets = prefetchTargets(rows ?? []);
    if (targets.length === 0) return 0;
    const queued = await db
      .select({ platform: researchPrefetch.platform, handle: researchPrefetch.handle })
      .from(researchPrefetch);
    const known = new Set(queued.map(q => `${q.platform}:${q.handle}`));
    const fresh = targets.filter(t => !known.has(`${t.platform}:${t.handle}`)).slice(0, limit);
    if (fresh.length === 0) return 0;
    const now = new Date();
    await db
      .insert(researchPrefetch)
      .ignore()
      .values(fresh.map(t => ({ ...t, status: "pending", requestedAt: now })));
    console.info("[research] prefetch_seeded_from_library", { creators: fresh.length });
    return fresh.length;
  } catch (err) {
    console.warn("[research] prefetch_seed_failed", { error: err instanceof Error ? err.message : String(err) });
    return 0;
  }
}

type Runner = (args: { db: Db; ownerUserId: number; handle: string }) => Promise<number>;

const runners: Record<ResearchPlatform, Runner> = {
  instagram: async ({ ownerUserId, handle }) => {
    const { runScrapeJobInner } = await import("../routers/scrapeRouter");
    const jobId = await createScrapeJob({
      userId: ownerUserId,
      workspaceId: PREFETCH_WORKSPACE_ID,
      handle,
      timeframeDays: PREFETCH_TIMEFRAME_DAYS,
      status: "running",
      currentStep: "connecting",
    });
    await runScrapeJobInner(jobId, ownerUserId, handle, PREFETCH_TIMEFRAME_DAYS, {
      system: true,
      maxReels: PREFETCH_MAX_VIDEOS,
    });
    return jobId;
  },
  tiktok: async ({ db, ownerUserId, handle }) => {
    const { runTikTokScrapeJob } = await import("../tiktokScrape/runJob");
    const [res] = await db.insert(tiktokScrapeJobs).values({
      userId: ownerUserId,
      workspaceId: PREFETCH_WORKSPACE_ID,
      handle,
      status: "pending",
      timeframeDays: PREFETCH_TIMEFRAME_DAYS,
    });
    await runTikTokScrapeJob(res.insertId, ownerUserId, PREFETCH_WORKSPACE_ID, handle, {
      timeframeDays: PREFETCH_TIMEFRAME_DAYS,
      maxVideos: PREFETCH_MAX_VIDEOS,
    });
    return res.insertId;
  },
  youtube: async ({ db, ownerUserId, handle }) => {
    const { runYouTubeScrapeJob } = await import("../youtubeScrape/runJob");
    const [res] = await db.insert(youtubeScrapeJobs).values({
      userId: ownerUserId,
      workspaceId: PREFETCH_WORKSPACE_ID,
      handle,
      status: "pending",
      timeframeDays: PREFETCH_TIMEFRAME_DAYS,
    });
    await runYouTubeScrapeJob(res.insertId, ownerUserId, PREFETCH_WORKSPACE_ID, handle, {
      timeframeDays: PREFETCH_TIMEFRAME_DAYS,
      maxVideos: PREFETCH_MAX_VIDEOS,
    });
    return res.insertId;
  },
};

async function jobCompleted(db: Db, platform: ResearchPlatform, jobId: number): Promise<boolean> {
  const table = platform === "instagram" ? scrapeJobs : platform === "tiktok" ? tiktokScrapeJobs : youtubeScrapeJobs;
  const [row] = await db.select({ status: table.status }).from(table).where(eq(table.id, jobId)).limit(1);
  return row?.status === "completed";
}

/**
 * Research up to `max` queued creators, oldest request first, within the
 * daily cap. Never throws.
 */
export async function runResearchPrefetch(args: { max?: number } = {}): Promise<{
  researched: number;
  alreadyFresh: number;
  failed: number;
  skipped?: "disabled" | "not_ready" | "daily_cap" | "empty" | "out_of_credits";
}> {
  const out = { researched: 0, alreadyFresh: 0, failed: 0 };
  if (!prefetchEnabled()) return { ...out, skipped: "disabled" };
  const db = await getDb();
  if (!db) return { ...out, skipped: "not_ready" };
  const ownerUserId = await systemOwner(db);
  if (ownerUserId == null) return { ...out, skipped: "not_ready" };
  // Provider out of credits: research would only fail. Try again later.
  if (scrapeCreatorsOutOfCredits()) return { ...out, skipped: "out_of_credits" };
  try {
    // A worker restart mid-research leaves rows "running": queue them again.
    await db
      .update(researchPrefetch)
      .set({ status: "pending" })
      .where(
        and(
          eq(researchPrefetch.status, "running"),
          sql`${researchPrefetch.startedAt} < (NOW() - INTERVAL 30 MINUTE)`,
          sql`${researchPrefetch.attempts} < 3`
        )
      );
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)` })
      .from(researchPrefetch)
      .where(and(gte(researchPrefetch.startedAt, dayStart), sql`${researchPrefetch.jobId} IS NOT NULL`));
    let budget = prefetchDailyMax() - Number(n);
    if (budget <= 0) return { ...out, skipped: "daily_cap" };

    const take = Math.max(1, Math.min(10, args.max ?? 2));
    const pending = () =>
      db
        .select({ platform: researchPrefetch.platform, handle: researchPrefetch.handle })
        .from(researchPrefetch)
        .where(eq(researchPrefetch.status, "pending"))
        .orderBy(asc(researchPrefetch.requestedAt))
        .limit(take);
    let due = await pending();
    if (due.length === 0) {
      // Nothing shown to users is waiting: start on the library's strongest
      // viral creators, so even creators nobody has looked at yet are ready.
      if ((await seedPrefetchFromLibrary(db, take)) > 0) due = await pending();
    }
    if (due.length === 0) return { ...out, skipped: "empty" };

    for (const row of due) {
      const platform = row.platform as ResearchPlatform;
      if (!runners[platform]) continue;
      const key = and(eq(researchPrefetch.platform, row.platform), eq(researchPrefetch.handle, row.handle));
      // Claim it (two worker instances can overlap during a deploy).
      const [claim] = await db
        .update(researchPrefetch)
        .set({ status: "running", startedAt: new Date(), attempts: sql`attempts + 1`, error: null })
        .where(and(key, eq(researchPrefetch.status, "pending")));
      if (!(claim as unknown as { affectedRows?: number })?.affectedRows) continue;

      const finish = (status: "done" | "failed", jobId: number | null, error: string | null) =>
        db
          .update(researchPrefetch)
          .set({ status, jobId, error: error?.slice(0, 255) ?? null, finishedAt: new Date() })
          .where(key);

      try {
        const fresh = await recentResearchJobId(db, platform, row.handle);
        if (fresh != null) {
          // Someone researched it recently: nothing to pay for. jobId stays
          // null so it does not count against the daily cap.
          await finish("done", null, null);
          out.alreadyFresh += 1;
          continue;
        }
        if (budget <= 0) {
          await db.update(researchPrefetch).set({ status: "pending" }).where(key);
          break;
        }
        budget -= 1;
        const started = Date.now();
        const jobId = await runners[platform]({ db, ownerUserId, handle: row.handle });
        if (scrapeCreatorsOutOfCreditsSince(started)) {
          // Failed only because the provider ran out of credits: keep it
          // queued (not failed) and stop until credits are back.
          await db
            .update(researchPrefetch)
            .set({ status: "pending", jobId: null, startedAt: null, attempts: sql`GREATEST(attempts - 1, 0)` })
            .where(key);
          console.warn("[research] prefetch_paused_out_of_credits", { platform, handle: row.handle });
          return { ...out, skipped: "out_of_credits" };
        }
        if (await jobCompleted(db, platform, jobId)) {
          await finish("done", jobId, null);
          out.researched += 1;
        } else {
          await finish("failed", jobId, "research did not complete");
          out.failed += 1;
        }
      } catch (err) {
        if (scrapeCreatorsOutOfCredits()) {
          await db.update(researchPrefetch).set({ status: "pending", startedAt: null }).where(key);
          return { ...out, skipped: "out_of_credits" };
        }
        await finish("failed", null, err instanceof Error ? err.message : String(err));
        out.failed += 1;
      }
    }
    console.info("[research] prefetch_done", out);
    return out;
  } catch (err) {
    console.warn("[research] prefetch_failed", { error: err instanceof Error ? err.message : String(err) });
    return out;
  }
}
