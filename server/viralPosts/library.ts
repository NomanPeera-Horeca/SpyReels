/**
 * Shared viral library (step A).
 *
 * The library is `viral_post_candidates`: every public video SpyReels has
 * fetched, from pools, search and now research (Creator Radar). This module:
 * - records each creator's usual views from research (their recent videos),
 * - gives every library video one verdict from shared/viralRule.ts
 *   (viral / rising / not_viral / unknown), including non-viral ones,
 * - copies finished research jobs (all three platforms) into the library,
 *   including every past job, a few at a time.
 *
 * Safe before migration 0108: every entry point checks the tables exist and
 * returns quietly when they do not. It never throws into the caller.
 * It makes no provider or model calls.
 */
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import {
  reels,
  scrapeJobs,
  tiktokScrapeJobs,
  tiktokVideos,
  youtubeScrapeJobs,
  youtubeVideos,
  type ViralPostCandidate,
} from "../../drizzle/schema";
import {
  viralCreatorBaselines,
  viralLibraryIngests,
  viralLibraryStatus,
} from "../../drizzle/viralLibrarySchema";
import {
  classifyVirality,
  nextViralRecheckAt,
  normalizeViralPlatform,
  usualViewsFromRecent,
  type ViralRulePlatform,
} from "../../shared/viralRule";
import { getDb } from "../db";
import type { AdaptedCandidate } from "./candidateAdapter";
import { resolvePersonalCandidates } from "./personalCandidateBridge";
import { adaptPublicMetadata } from "./personalization";

const LIBRARY_TABLES = ["viral_creator_baselines", "viral_library_status", "viral_library_ingests"];
const READY_RECHECK_MS = 10 * 60 * 1000;
/** Research videos older than this stay out of the library (baseline still uses them). */
const LIBRARY_MAX_AGE_DAYS = 180;
const UPSERT_CHUNK = 200;

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

let readyCache: { ready: boolean; at: number } | null = null;

/** True once migration 0108 is applied. Cached; a "not ready" answer is re-checked every 10 min. */
export async function isLibraryReady(db: Db): Promise<boolean> {
  if (readyCache?.ready) return true;
  if (readyCache && Date.now() - readyCache.at < READY_RECHECK_MS) return false;
  try {
    const [rows] = (await db.execute(
      sql`SELECT COUNT(*) AS n FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (${sql.join(
        LIBRARY_TABLES.map(t => sql`${t}`),
        sql`, `
      )})`
    )) as unknown as [Array<{ n: number | string }>];
    const ready = Number(rows?.[0]?.n ?? 0) === LIBRARY_TABLES.length;
    readyCache = { ready, at: Date.now() };
    return ready;
  } catch {
    readyCache = { ready: false, at: Date.now() };
    return false;
  }
}

/** Test hook. */
export function resetLibraryReadyCacheForTests(): void {
  readyCache = null;
}

export function libraryHandle(value: string | null | undefined): string | null {
  const handle = (value ?? "").trim().replace(/^@+/, "").toLowerCase();
  return handle || null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function loadBaselines(
  db: Db,
  keys: Array<{ platform: ViralRulePlatform; handle: string }>
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const unique = [...new Map(keys.map(k => [`${k.platform}:${k.handle}`, k])).values()];
  for (const part of chunk(unique, UPSERT_CHUNK)) {
    if (part.length === 0) continue;
    const rows = await db
      .select({
        platform: viralCreatorBaselines.platform,
        handle: viralCreatorBaselines.handle,
        usualViews: viralCreatorBaselines.usualViews,
      })
      .from(viralCreatorBaselines)
      .where(
        or(
          ...part.map(k =>
            and(eq(viralCreatorBaselines.platform, k.platform), eq(viralCreatorBaselines.handle, k.handle))
          )
        )
      );
    for (const row of rows) out.set(`${row.platform}:${row.handle}`, Number(row.usualViews));
  }
  return out;
}

/**
 * Give each library row the one viral verdict. `fresh` overrides views and
 * publish time for rows a caller just measured (e.g. research).
 */
export async function classifyLibraryRows(args: {
  rows: ViralPostCandidate[];
  source: string;
  fresh?: Map<string, { views: number | null; publishedAt: Date | null }>;
  now?: Date;
}): Promise<{ classified: number; byStatus: Record<string, number> }> {
  const empty = { classified: 0, byStatus: {} };
  if (args.rows.length === 0) return empty;
  const db = await getDb();
  if (!db || !(await isLibraryReady(db))) return empty;
  const now = args.now ?? new Date();

  const keyed = args.rows.flatMap(row => {
    const platform = normalizeViralPlatform(row.platform);
    return platform ? [{ row, platform, handle: libraryHandle(row.creatorHandle ?? row.creatorId) }] : [];
  });
  const baselines = await loadBaselines(
    db,
    keyed.flatMap(k => (k.handle ? [{ platform: k.platform, handle: k.handle }] : []))
  );

  const byStatus: Record<string, number> = {};
  const values = keyed.map(({ row, platform, handle }) => {
    const fresh = args.fresh?.get(`${platform}:${row.sourceId}`);
    const views = fresh?.views ?? row.views ?? null;
    const publishedAt = fresh?.publishedAt ?? row.publishedAt ?? null;
    const verdict = classifyVirality({
      platform,
      views,
      followers: row.creatorFollowers,
      usualViews: handle ? baselines.get(`${platform}:${handle}`) ?? null : null,
      publishedAt,
      now,
    });
    byStatus[verdict.status] = (byStatus[verdict.status] ?? 0) + 1;
    return {
      candidateId: row.id,
      platform,
      status: verdict.status,
      basis: verdict.basis,
      multiple: verdict.multiple != null ? String(verdict.multiple) : null,
      views: views != null && Number.isFinite(views) ? Math.round(views) : null,
      source: args.source.slice(0, 32),
      checkedAt: now,
      nextCheckAt: nextViralRecheckAt({ status: verdict.status, publishedAt, now }),
    };
  });

  for (const part of chunk(values, UPSERT_CHUNK)) {
    await db
      .insert(viralLibraryStatus)
      .values(part)
      .onDuplicateKeyUpdate({
        set: {
          status: sql`VALUES(status)`,
          basis: sql`VALUES(basis)`,
          multiple: sql`VALUES(multiple)`,
          views: sql`VALUES(views)`,
          checkedAt: sql`VALUES(checkedAt)`,
          nextCheckAt: sql`VALUES(nextCheckAt)`,
        },
      });
  }
  return { classified: values.length, byStatus };
}

/** Fire-and-forget wrapper for discovery paths. Never throws. */
export function classifyLibraryRowsInBackground(rows: ViralPostCandidate[], source: string): void {
  if (rows.length === 0) return;
  void classifyLibraryRows({ rows, source }).catch(err =>
    console.warn("[viralLibrary] classify_failed", {
      source,
      rows: rows.length,
      error: err instanceof Error ? err.message : String(err),
    })
  );
}

/* ---------- research ingest ---------- */

export type ResearchSource = "instagram" | "tiktok" | "youtube";

type ResearchJob = {
  source: ResearchSource;
  jobId: number;
  handle: string;
  followers: number | null;
  avatarUrl: string | null;
  videos: Array<{
    sourceId: string;
    sourceUrl: string;
    caption: string | null;
    views: number | null;
    likes: number | null;
    comments: number | null;
    thumbnailUrl: string | null;
    videoUrl: string | null;
    postedAt: Date | null;
    ownerHandle: string | null;
  }>;
};

async function pendingJobIds(db: Db, source: ResearchSource, limit: number): Promise<number[]> {
  const notIngested = (jobIdColumn: import("drizzle-orm").SQLWrapper) =>
    and(eq(viralLibraryIngests.source, source), eq(viralLibraryIngests.jobId, jobIdColumn));
  if (source === "instagram") {
    const rows = await db
      .select({ id: scrapeJobs.id })
      .from(scrapeJobs)
      .leftJoin(viralLibraryIngests, notIngested(scrapeJobs.id))
      .where(and(eq(scrapeJobs.status, "completed"), eq(scrapeJobs.isDemo, false), isNull(viralLibraryIngests.jobId)))
      .orderBy(desc(scrapeJobs.id))
      .limit(limit);
    return rows.map(r => r.id);
  }
  if (source === "tiktok") {
    const rows = await db
      .select({ id: tiktokScrapeJobs.id })
      .from(tiktokScrapeJobs)
      .leftJoin(viralLibraryIngests, notIngested(tiktokScrapeJobs.id))
      .where(and(eq(tiktokScrapeJobs.status, "completed"), isNull(viralLibraryIngests.jobId)))
      .orderBy(desc(tiktokScrapeJobs.id))
      .limit(limit);
    return rows.map(r => r.id);
  }
  const rows = await db
    .select({ id: youtubeScrapeJobs.id })
    .from(youtubeScrapeJobs)
    .leftJoin(viralLibraryIngests, notIngested(youtubeScrapeJobs.id))
    .where(and(eq(youtubeScrapeJobs.status, "completed"), isNull(viralLibraryIngests.jobId)))
    .orderBy(desc(youtubeScrapeJobs.id))
    .limit(limit);
  return rows.map(r => r.id);
}

async function loadResearchJob(db: Db, source: ResearchSource, jobId: number): Promise<ResearchJob | null> {
  if (source === "instagram") {
    const [job] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, jobId)).limit(1);
    if (!job) return null;
    const rows = await db.select().from(reels).where(eq(reels.jobId, jobId));
    return {
      source,
      jobId,
      handle: job.handle,
      followers: job.followerCount || null,
      avatarUrl: job.profilePicUrl ?? null,
      videos: rows.map(r => ({
        sourceId: r.shortcode,
        sourceUrl: r.reelUrl,
        caption: r.caption,
        views: r.viewCount,
        likes: r.likeCount,
        comments: r.commentCount,
        thumbnailUrl: r.thumbnailUrl,
        videoUrl: r.videoUrl,
        postedAt: r.postedAt,
        ownerHandle: r.ownerUsername,
      })),
    };
  }
  if (source === "tiktok") {
    const [job] = await db.select().from(tiktokScrapeJobs).where(eq(tiktokScrapeJobs.id, jobId)).limit(1);
    if (!job) return null;
    const rows = await db.select().from(tiktokVideos).where(eq(tiktokVideos.jobId, jobId));
    return {
      source,
      jobId,
      handle: job.handle,
      followers: job.followerCount || null,
      avatarUrl: job.profilePicUrl ?? null,
      videos: rows.map(r => ({
        sourceId: r.awemeId,
        sourceUrl: r.videoPageUrl,
        caption: r.caption,
        views: r.viewCount,
        likes: r.likeCount,
        comments: r.commentCount,
        thumbnailUrl: r.thumbnailUrl,
        videoUrl: r.videoUrl,
        postedAt: r.postedAt,
        ownerHandle: r.ownerUsername,
      })),
    };
  }
  const [job] = await db.select().from(youtubeScrapeJobs).where(eq(youtubeScrapeJobs.id, jobId)).limit(1);
  if (!job) return null;
  const rows = await db.select().from(youtubeVideos).where(eq(youtubeVideos.jobId, jobId));
  return {
    source,
    jobId,
    handle: job.handle,
    followers: job.subscriberCount || null,
    avatarUrl: job.profilePicUrl ?? null,
    videos: rows.map(r => ({
      sourceId: r.videoId,
      sourceUrl: r.videoPageUrl,
      caption: r.title,
      views: r.viewCount,
      likes: r.likeCount,
      comments: r.commentCount,
      thumbnailUrl: r.thumbnailUrl,
      videoUrl: null,
      postedAt: r.postedAt,
      ownerHandle: r.ownerHandle,
    })),
  };
}

/** Research videos as library rows. Pure; exported for tests. */
export function researchJobToCandidates(job: ResearchJob, now = new Date()): AdaptedCandidate[] {
  const maxAgeMs = LIBRARY_MAX_AGE_DAYS * 86_400_000;
  const handle = libraryHandle(job.handle);
  return job.videos
    .filter(v => v.sourceId?.trim() && v.sourceUrl?.trim())
    .filter(v => !v.postedAt || now.getTime() - v.postedAt.getTime() <= maxAgeMs)
    .map(v =>
      adaptPublicMetadata({
        platform: job.source,
        sourceId: v.sourceId.trim(),
        sourceUrl: v.sourceUrl,
        creatorHandle: libraryHandle(v.ownerHandle) ?? handle,
        creatorName: handle,
        creatorAvatarUrl: job.avatarUrl,
        creatorFollowers: job.followers,
        thumbnailUrl: v.thumbnailUrl,
        videoUrl: v.videoUrl,
        caption: v.caption,
        publishedAt: v.postedAt,
        views: v.views,
        likes: v.likes,
        comments: v.comments,
        activePillars: [],
        fallbackNiche: "",
        relevanceLabel: "From research",
        relevanceReason: "A public video from a creator researched on SpyReels.",
        relevanceHint: 60,
        now,
      })
    );
}

async function ingestOne(db: Db, source: ResearchSource, jobId: number, now: Date) {
  const job = await loadResearchJob(db, source, jobId);
  let videoCount = 0;
  let byStatus: Record<string, number> = {};
  if (job) {
    const handle = libraryHandle(job.handle);
    const usual = usualViewsFromRecent(job.videos.map(v => ({ views: v.views, postedAt: v.postedAt })));
    if (handle && usual) {
      await db
        .insert(viralCreatorBaselines)
        .values({
          platform: source,
          handle,
          usualViews: usual.usualViews,
          sampleSize: usual.sampleSize,
          followers: job.followers,
          source: "research",
          measuredAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            usualViews: usual.usualViews,
            sampleSize: usual.sampleSize,
            followers: job.followers,
            source: "research",
            measuredAt: now,
          },
        });
    }
    const adapted = researchJobToCandidates(job, now);
    const resolved = await resolvePersonalCandidates(adapted);
    const fresh = new Map(
      adapted.map(c => [`${c.platform}:${c.sourceId}`, { views: c.views, publishedAt: c.publishedAt }])
    );
    const result = await classifyLibraryRows({ rows: resolved.rows, source: "research", fresh, now });
    videoCount = resolved.rows.length;
    byStatus = result.byStatus;
  }
  await db
    .insert(viralLibraryIngests)
    .values({ source, jobId, videoCount, ingestedAt: now })
    .onDuplicateKeyUpdate({ set: { videoCount, ingestedAt: now } });
  return { videoCount, byStatus };
}

/**
 * Copy finished research jobs into the library, newest first, a few per
 * platform per call. Past jobs are picked up too, so repeated calls backfill
 * all history. Never throws.
 */
export async function ingestResearchJobs(args: { perSource?: number; now?: Date } = {}): Promise<{
  jobs: number;
  videos: number;
  byStatus: Record<string, number>;
  skipped?: "db_unavailable" | "migration_missing";
}> {
  const totals = { jobs: 0, videos: 0, byStatus: {} as Record<string, number> };
  const db = await getDb();
  if (!db) return { ...totals, skipped: "db_unavailable" };
  if (!(await isLibraryReady(db))) return { ...totals, skipped: "migration_missing" };
  const now = args.now ?? new Date();
  const perSource = Math.max(1, Math.min(50, args.perSource ?? 5));
  for (const source of ["instagram", "tiktok", "youtube"] as const) {
    let ids: number[] = [];
    try {
      ids = await pendingJobIds(db, source, perSource);
    } catch (err) {
      console.warn("[viralLibrary] ingest_list_failed", {
        source,
        error: err instanceof Error ? err.message : String(err),
      });
      continue;
    }
    for (const jobId of ids) {
      try {
        const r = await ingestOne(db, source, jobId, now);
        totals.jobs += 1;
        totals.videos += r.videoCount;
        for (const [k, n] of Object.entries(r.byStatus)) totals.byStatus[k] = (totals.byStatus[k] ?? 0) + n;
      } catch (err) {
        console.warn("[viralLibrary] ingest_job_failed", {
          source,
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }
  if (totals.jobs > 0) console.info("[viralLibrary] ingest_done", totals);
  return totals;
}

/**
 * Library rows that have no verdict yet (rows saved before step A), oldest
 * first. Used by the backfill script.
 */
export async function classifyUnlabeledLibraryRows(limit = 500): Promise<number> {
  const db = await getDb();
  if (!db || !(await isLibraryReady(db))) return 0;
  const { viralPostCandidates } = await import("../../drizzle/schema");
  const rows = await db
    .select({ candidate: viralPostCandidates })
    .from(viralPostCandidates)
    .leftJoin(viralLibraryStatus, eq(viralLibraryStatus.candidateId, viralPostCandidates.id))
    .where(isNull(viralLibraryStatus.candidateId))
    .orderBy(viralPostCandidates.id)
    .limit(Math.max(1, Math.min(2_000, limit)));
  const list = rows.map(r => r.candidate);
  const result = await classifyLibraryRows({ rows: list, source: "backfill" });
  return result.classified;
}

/** Counts per platform and status, for the backfill report. */
export async function libraryStatusCounts(): Promise<Array<{ platform: string; status: string; n: number }>> {
  const db = await getDb();
  if (!db || !(await isLibraryReady(db))) return [];
  const rows = await db
    .select({
      platform: viralLibraryStatus.platform,
      status: viralLibraryStatus.status,
      n: sql<number>`count(*)`,
    })
    .from(viralLibraryStatus)
    .groupBy(viralLibraryStatus.platform, viralLibraryStatus.status);
  return rows.map(r => ({ platform: r.platform, status: r.status, n: Number(r.n) }));
}

