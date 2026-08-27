import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  viralPostCandidates,
  viralPostDailyFeedItems,
  viralPostDailyFeeds,
  viralPostFeedback,
  viralPostHiddenCreators,
  viralPostSaves,
  type InsertViralPostCandidate,
  type ViralPostCandidate,
  type ViralPostDailyFeed,
} from "../../drizzle/schema";
import { getDb } from "../db";
import type { AdaptedCandidate } from "./candidateAdapter";
import type { ViralFeedbackType } from "@shared/viralPosts";

const DB_OP_TIMEOUT_MS = 20_000;
const DB_DEBUG = process.env.VIRAL_POSTS_DB_DEBUG === "true";

async function withDbLog<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const started = Date.now();
  if (DB_DEBUG) console.info(`[viralPosts.db] BEFORE ${label}`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const raced = await Promise.race([
      fn().then((value) => ({ ok: true as const, value })),
      new Promise<{ ok: false; error: Error }>((resolve) => {
        timer = setTimeout(
          () =>
            resolve({
              ok: false,
              error: new Error(
                `[viralPosts.db] TIMEOUT ${DB_OP_TIMEOUT_MS}ms: ${label}`
              ),
            }),
          DB_OP_TIMEOUT_MS
        );
      }),
    ]);
    if (!raced.ok) throw raced.error;
    if (DB_DEBUG) {
      console.info(`[viralPosts.db] AFTER  ${label} (${Date.now() - started}ms)`);
    }
    return raced.value;
  } catch (err) {
    const cause =
      err && typeof err === "object" && "cause" in err
        ? (err as { cause?: unknown }).cause
        : undefined;
    console.error(
      `[viralPosts.db] FAIL   ${label} (${Date.now() - started}ms)`,
      err
    );
    if (cause) console.error(`[viralPosts.db] cause`, cause);
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function upsertCandidates(
  adapted: AdaptedCandidate[]
): Promise<ViralPostCandidate[]> {
  const db = await getDb();
  if (!db || adapted.length === 0) return [];

  const out: ViralPostCandidate[] = [];
  for (let index = 0; index < adapted.length; index++) {
    const c = adapted[index]!;
    const sourceThumb = (c.thumbnailUrl ?? "").trim() || null;
    const row: InsertViralPostCandidate = {
      platform: c.platform,
      sourceId: c.sourceId,
      sourceUrl: c.sourceUrl,
      creatorId: c.creatorId,
      creatorName: c.creatorName,
      creatorHandle: c.creatorHandle,
      creatorAvatarUrl: c.creatorAvatarUrl,
      creatorFollowers: c.creatorFollowers,
      thumbnailUrl: sourceThumb,
      sourceThumbnailUrl: sourceThumb,
      thumbnailMediaStatus: sourceThumb ? "source_fallback" : "failed",
      videoUrl: c.videoUrl,
      caption: c.caption,
      transcript: c.transcript,
      hashtags: c.hashtags,
      publishedAt: c.publishedAt,
      views: c.views,
      likes: c.likes,
      comments: c.comments,
      shares: c.shares,
      saves: c.saves,
      reachMultiplier:
        c.reachMultiplier != null ? String(c.reachMultiplier) : null,
      engagementRate:
        c.engagementRate != null ? String(c.engagementRate) : null,
      viewsPerHour: c.viewsPerHour != null ? String(c.viewsPerHour) : null,
      trendStatus: c.trendStatus,
      rawProviderPayload: c.rawProviderPayload,
      refreshedAt: new Date(),
    };

    await withDbLog(
      `upsertCandidates.insert[${index}] sourceId=${c.sourceId}`,
      () =>
        db
          .insert(viralPostCandidates)
          .values(row)
          .onDuplicateKeyUpdate({
            set: {
              sourceUrl: row.sourceUrl,
              creatorId: row.creatorId,
              creatorName: row.creatorName,
              creatorHandle: row.creatorHandle,
              creatorAvatarUrl: row.creatorAvatarUrl,
              creatorFollowers: row.creatorFollowers,
              // Keep existing mirrored URL if present; only refresh source thumb.
              sourceThumbnailUrl: row.sourceThumbnailUrl,
              thumbnailUrl: sql`COALESCE(thumbnailUrl, ${row.thumbnailUrl})`,
              thumbnailMediaStatus: sql`CASE
                WHEN thumbnailMediaStatus = 'mirrored' THEN thumbnailMediaStatus
                ELSE ${row.thumbnailMediaStatus}
              END`,
              videoUrl: row.videoUrl,
              caption: row.caption,
              hashtags: row.hashtags,
              publishedAt: row.publishedAt,
              views: row.views,
              likes: row.likes,
              comments: row.comments,
              shares: row.shares,
              saves: row.saves,
              reachMultiplier: row.reachMultiplier,
              engagementRate: row.engagementRate,
              viewsPerHour: row.viewsPerHour,
              trendStatus: row.trendStatus,
              rawProviderPayload: row.rawProviderPayload,
              refreshedAt: new Date(),
            },
          })
    );

    const existing = await withDbLog(
      `upsertCandidates.select[${index}] sourceId=${c.sourceId}`,
      async () => {
        const [rowOut] = await db
          .select()
          .from(viralPostCandidates)
          .where(
            and(
              eq(viralPostCandidates.platform, c.platform),
              eq(viralPostCandidates.sourceId, c.sourceId)
            )
          )
          .limit(1);
        return rowOut;
      }
    );
    if (existing) out.push(existing);
  }
  return out;
}

export async function getDailyFeedByUserDate(
  userId: number,
  localDate: string
): Promise<ViralPostDailyFeed | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(viralPostDailyFeeds)
    .where(
      and(
        eq(viralPostDailyFeeds.userId, userId),
        eq(viralPostDailyFeeds.localDate, localDate)
      )
    )
    .limit(1);
  return row ?? null;
}

/** Delete a day's feed (and items) so cron can force-regenerate. */
export async function deleteDailyFeedByUserDate(
  userId: number,
  localDate: string
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await getDailyFeedByUserDate(userId, localDate);
  if (!existing) return;
  await withDbLog(`deleteDailyFeed.items.feedId=${existing.id}`, () =>
    db
      .delete(viralPostDailyFeedItems)
      .where(eq(viralPostDailyFeedItems.feedId, existing.id))
  );
  await withDbLog(`deleteDailyFeed.feedId=${existing.id}`, () =>
    db
      .delete(viralPostDailyFeeds)
      .where(eq(viralPostDailyFeeds.id, existing.id))
  );
}

export async function createDailyFeed(args: {
  userId: number;
  localDate: string;
  timezone: string;
  status: string;
  generationReason: string;
  errorMessage?: string | null;
  scCallCount?: number;
  costEstimateUsd?: number | null;
}): Promise<ViralPostDailyFeed> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const insertResult = await withDbLog("createDailyFeed.insert", () =>
    db.insert(viralPostDailyFeeds).values({
      userId: args.userId,
      localDate: args.localDate,
      timezone: args.timezone,
      status: args.status,
      generationReason: args.generationReason,
      errorMessage: args.errorMessage ?? null,
      scCallCount: args.scCallCount ?? 0,
      costEstimateUsd:
        args.costEstimateUsd != null ? String(args.costEstimateUsd) : null,
      generatedAt: new Date(),
    })
  );
  const id = insertResult[0].insertId;
  const row = await withDbLog("createDailyFeed.select", async () => {
    const [found] = await db
      .select()
      .from(viralPostDailyFeeds)
      .where(eq(viralPostDailyFeeds.id, id))
      .limit(1);
    return found;
  });
  if (!row) throw new Error("Failed to create daily feed");
  return row;
}

export function isDuplicateKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const cause =
    err && typeof err === "object" && "cause" in err
      ? (err as { cause?: { code?: string; errno?: number } }).cause
      : undefined;
  return (
    cause?.code === "ER_DUP_ENTRY" ||
    cause?.errno === 1062 ||
    /Duplicate entry/i.test(msg)
  );
}

export async function updateDailyFeedStatus(args: {
  feedId: number;
  status: string;
  generationReason?: string | null;
  errorMessage?: string | null;
  scCallCount?: number;
  costEstimateUsd?: number | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const set: Record<string, unknown> = {
    status: args.status,
    updatedAt: new Date(),
  };
  if (args.generationReason !== undefined) {
    set.generationReason = args.generationReason;
  }
  if (args.errorMessage !== undefined) set.errorMessage = args.errorMessage;
  if (args.scCallCount !== undefined) set.scCallCount = args.scCallCount;
  if (args.costEstimateUsd !== undefined) {
    set.costEstimateUsd =
      args.costEstimateUsd != null ? String(args.costEstimateUsd) : null;
  }
  await withDbLog(`updateDailyFeedStatus.id=${args.feedId}`, () =>
    db
      .update(viralPostDailyFeeds)
      .set(set)
      .where(eq(viralPostDailyFeeds.id, args.feedId))
  );
}

export async function insertFeedItems(
  items: Array<{
    feedId: number;
    candidateId: number;
    rank: number;
    contentPillar: string | null;
    relevanceScore: number | null;
    relevanceLabel: string;
    relevanceReason: string;
    adaptabilityScore: number | null;
    finalScore: number;
  }>
): Promise<void> {
  const db = await getDb();
  if (!db || items.length === 0) return;
  await withDbLog(`insertFeedItems.count=${items.length}`, () =>
    db.insert(viralPostDailyFeedItems).values(
      items.map((i) => ({
        feedId: i.feedId,
        candidateId: i.candidateId,
        rank: i.rank,
        contentPillar: i.contentPillar,
        relevanceScore:
          i.relevanceScore != null ? String(i.relevanceScore) : null,
        relevanceLabel: i.relevanceLabel,
        relevanceReason: i.relevanceReason,
        adaptabilityScore:
          i.adaptabilityScore != null ? String(i.adaptabilityScore) : null,
        finalScore: String(i.finalScore),
        shownAt: new Date(),
      }))
    )
  );
}

export async function replaceFeedItems(
  feedId: number,
  items: Array<{
    feedId: number;
    candidateId: number;
    rank: number;
    contentPillar: string | null;
    relevanceScore: number | null;
    relevanceLabel: string;
    relevanceReason: string;
    adaptabilityScore: number | null;
    finalScore: number;
  }>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await withDbLog(`replaceFeedItems.delete.feedId=${feedId}`, () =>
    db
      .delete(viralPostDailyFeedItems)
      .where(eq(viralPostDailyFeedItems.feedId, feedId))
  );
  await insertFeedItems(items);
}

export async function getFeedItemsWithCandidates(feedId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      item: viralPostDailyFeedItems,
      candidate: viralPostCandidates,
    })
    .from(viralPostDailyFeedItems)
    .innerJoin(
      viralPostCandidates,
      eq(viralPostDailyFeedItems.candidateId, viralPostCandidates.id)
    )
    .where(eq(viralPostDailyFeedItems.feedId, feedId))
    .orderBy(viralPostDailyFeedItems.rank);
}

export async function saveCandidate(
  userId: number,
  candidateId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(viralPostSaves)
    .values({ userId, candidateId })
    .onDuplicateKeyUpdate({ set: { savedAt: new Date() } });
}

export async function unsaveCandidate(
  userId: number,
  candidateId: number
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .delete(viralPostSaves)
    .where(
      and(
        eq(viralPostSaves.userId, userId),
        eq(viralPostSaves.candidateId, candidateId)
      )
    );
}

export async function getSavedCandidateIds(
  userId: number
): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ candidateId: viralPostSaves.candidateId })
    .from(viralPostSaves)
    .where(eq(viralPostSaves.userId, userId));
  return new Set(rows.map((r) => r.candidateId));
}

export async function getSavedCandidates(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      save: viralPostSaves,
      candidate: viralPostCandidates,
    })
    .from(viralPostSaves)
    .innerJoin(
      viralPostCandidates,
      eq(viralPostSaves.candidateId, viralPostCandidates.id)
    )
    .where(eq(viralPostSaves.userId, userId))
    .orderBy(desc(viralPostSaves.savedAt));
}

export async function recordFeedback(args: {
  userId: number;
  candidateId: number;
  feedbackType: ViralFeedbackType;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(viralPostFeedback).values({
    userId: args.userId,
    candidateId: args.candidateId,
    feedbackType: args.feedbackType,
  });
}

export async function hideCreator(args: {
  userId: number;
  platform: string;
  creatorKey: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db
    .insert(viralPostHiddenCreators)
    .values({
      userId: args.userId,
      platform: args.platform,
      creatorKey: args.creatorKey.toLowerCase().replace(/^@/, ""),
    })
    .onDuplicateKeyUpdate({ set: { createdAt: sql`createdAt` } });
}

export async function getHiddenCreatorKeys(
  userId: number,
  platform?: string
): Promise<Set<string>> {
  const db = await getDb();
  if (!db) return new Set();
  const rows = await db
    .select({ creatorKey: viralPostHiddenCreators.creatorKey })
    .from(viralPostHiddenCreators)
    .where(
      platform
        ? and(
            eq(viralPostHiddenCreators.userId, userId),
            eq(viralPostHiddenCreators.platform, platform)
          )
        : eq(viralPostHiddenCreators.userId, userId)
    );
  return new Set(rows.map((r) => r.creatorKey.toLowerCase()));
}

export async function getRecentlyDismissedCandidateIds(
  userId: number,
  days = 14
): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ candidateId: viralPostFeedback.candidateId })
    .from(viralPostFeedback)
    .where(
      and(
        eq(viralPostFeedback.userId, userId),
        inArray(viralPostFeedback.feedbackType, ["not_relevant", "dismissed"]),
        sql`${viralPostFeedback.createdAt} >= ${since}`
      )
    );
  return new Set(rows.map((r) => r.candidateId));
}

export async function getRecentlyShownCandidateIds(
  userId: number,
  days = 7
): Promise<Set<number>> {
  const db = await getDb();
  if (!db) return new Set();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const items = await db
    .select({ candidateId: viralPostDailyFeedItems.candidateId })
    .from(viralPostDailyFeedItems)
    .innerJoin(
      viralPostDailyFeeds,
      eq(viralPostDailyFeedItems.feedId, viralPostDailyFeeds.id)
    )
    .where(
      and(
        eq(viralPostDailyFeeds.userId, userId),
        sql`${viralPostDailyFeeds.generatedAt} >= ${since}`
      )
    );
  return new Set(items.map((i) => i.candidateId));
}

export async function getCandidateById(
  candidateId: number
): Promise<ViralPostCandidate | null> {
  const db = await getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(viralPostCandidates)
    .where(eq(viralPostCandidates.id, candidateId))
    .limit(1);
  return row ?? null;
}

export async function updateCandidateMedia(args: {
  sourceId: string;
  thumbnailUrl: string | null;
  mediaStatus: string;
  /** When set, scopes the update to that platform. Omit to match any platform by sourceId. */
  platform?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const whereClause = args.platform
    ? and(
        eq(viralPostCandidates.platform, args.platform),
        eq(viralPostCandidates.sourceId, args.sourceId)
      )
    : eq(viralPostCandidates.sourceId, args.sourceId);
  await withDbLog(`updateCandidateMedia.sourceId=${args.sourceId}`, () =>
    db
      .update(viralPostCandidates)
      .set({
        thumbnailUrl: args.thumbnailUrl,
        thumbnailMediaStatus: args.mediaStatus,
        refreshedAt: new Date(),
      })
      .where(whereClause)
  );
}

export async function countFeedsGeneratedToday(
  userId: number,
  localDate: string
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;
  const rows = await db
    .select({ id: viralPostDailyFeeds.id })
    .from(viralPostDailyFeeds)
    .where(
      and(
        eq(viralPostDailyFeeds.userId, userId),
        eq(viralPostDailyFeeds.localDate, localDate)
      )
    );
  return rows.length;
}
