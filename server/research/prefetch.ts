/**
 * Pre-research of the creators shown on Home, so clicking one opens at once
 * even when no SpyReels user researched that creator yet.
 *
 * - Home queues the creators it shows (requestPrefetch, never blocks Home).
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
import {
  scrapeJobs,
  tiktokScrapeJobs,
  workspaces,
  youtubeScrapeJobs,
} from "../../drizzle/schema";
import { researchPrefetch } from "../../drizzle/viralLibrarySchema";
import { createScrapeJob, getDb } from "../db";
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
  skipped?: "disabled" | "not_ready" | "daily_cap" | "empty";
}> {
  const out = { researched: 0, alreadyFresh: 0, failed: 0 };
  if (!prefetchEnabled()) return { ...out, skipped: "disabled" };
  const db = await getDb();
  if (!db) return { ...out, skipped: "not_ready" };
  const ownerUserId = await systemOwner(db);
  if (ownerUserId == null) return { ...out, skipped: "not_ready" };
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

    const due = await db
      .select({ platform: researchPrefetch.platform, handle: researchPrefetch.handle })
      .from(researchPrefetch)
      .where(eq(researchPrefetch.status, "pending"))
      .orderBy(asc(researchPrefetch.requestedAt))
      .limit(Math.max(1, Math.min(10, args.max ?? 2)));
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
        const jobId = await runners[platform]({ db, ownerUserId, handle: row.handle });
        if (await jobCompleted(db, platform, jobId)) {
          await finish("done", jobId, null);
          out.researched += 1;
        } else {
          await finish("failed", jobId, "research did not complete");
          out.failed += 1;
        }
      } catch (err) {
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
