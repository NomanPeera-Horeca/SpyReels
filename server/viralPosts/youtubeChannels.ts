/**
 * YouTube Shorts found by search carry no channel: the provider's search
 * results have no channel field, so they were stored under the placeholder
 * creator "youtube". Without the real channel the viral rule cannot judge
 * them (no usual views, no subscribers), Home shows at most one of them, and
 * pre-research would pick the official @youtube channel.
 *
 * This looks the channel up with one video-details call per Short, only for
 * Shorts that could ever be viral (at least VIRAL_RULE.minViews views):
 * - resolveShortChannels: new pool results, after the topic check;
 * - repairYouTubeLibraryCreators: Shorts already in the library (worker).
 * - measureYouTubeBaselines: Shorts whose channel is known but whose usual
 *   views are not (worker).
 * All stop while ScrapeCreators is out of credits.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { VIRAL_RULE } from "@shared/viralRule";
import { viralPostCandidates } from "../../drizzle/schema";
import { getDb } from "../db";
import { scrapeCreatorsOutOfCredits } from "../scrapeCreatorsMeter";
import { fetchYouTubeVideoDetails } from "../youtube";
import type { AdaptedCandidate } from "./candidateAdapter";
import { usualViewsFromRecent } from "@shared/viralRule";
import { viralCreatorBaselines, viralProcessingSpend } from "../../drizzle/viralLibrarySchema";
import { classifyLibraryRows, isLibraryReady, libraryHandle, reclassifyCreatorUnknowns } from "./library";

/** What the YouTube adapters store when the channel is unknown. */
export const YOUTUBE_PLACEHOLDER_HANDLE = "youtube";
const LOOKUP_CONCURRENCY = 4;

/** Channel fields of a candidate whose channel is unknown, null otherwise. Pure; exported for tests. */
export function needsChannelLookup(c: { platform?: string | null; creatorHandle: string | null; views: number | null }): boolean {
  if (c.platform && c.platform !== "youtube") return false;
  const handle = (c.creatorHandle ?? "").trim().replace(/^@+/, "").toLowerCase();
  if (handle && handle !== YOUTUBE_PLACEHOLDER_HANDLE) return false;
  return typeof c.views === "number" && c.views >= VIRAL_RULE.minViews;
}

/** Candidate creator fields for a channel. Pure; exported for tests. */
export function channelFields(owner: { username: string; fullName: string }): {
  creatorId: string;
  creatorHandle: string;
  creatorName: string;
} | null {
  const handle = owner.username.trim().replace(/^@+/, "");
  if (!handle || handle.toLowerCase() === YOUTUBE_PLACEHOLDER_HANDLE) return null;
  return { creatorId: handle, creatorHandle: `@${handle}`, creatorName: owner.fullName.trim() || handle };
}

async function lookupChannel(sourceUrl: string): Promise<ReturnType<typeof channelFields>> {
  const details = await fetchYouTubeVideoDetails(sourceUrl);
  return details ? channelFields({ username: details.ownerUsername, fullName: details.ownerFullName }) : null;
}

async function inBatches<T>(items: T[], run: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += LOOKUP_CONCURRENCY) {
    if (scrapeCreatorsOutOfCredits()) return;
    await Promise.all(items.slice(i, i + LOOKUP_CONCURRENCY).map(run));
  }
}

/**
 * Fill in the real channel of pool candidates that could be viral. Returns
 * the candidates (updated in place) and how many provider calls were made.
 */
export async function resolveShortChannels(
  candidates: AdaptedCandidate[]
): Promise<{ candidates: AdaptedCandidate[]; calls: number }> {
  const todo = candidates.filter(needsChannelLookup);
  let calls = 0;
  await inBatches(todo, async c => {
    calls += 1;
    try {
      const fields = await lookupChannel(c.sourceUrl);
      if (fields) Object.assign(c, fields);
    } catch {
      // keep the placeholder; the library repair can try again later
    }
  });
  return { candidates, calls };
}

/**
 * Fix Shorts already in the library: look up the channel of up to `max`
 * placeholder rows (most viewed first) and re-judge them. Rows that could
 * never be viral, or whose channel cannot be found, lose the placeholder so
 * they stop counting as one creator. Never throws.
 */
export async function repairYouTubeLibraryCreators(args: { max?: number } = {}): Promise<{
  looked: number;
  fixed: number;
  skipped?: "not_ready" | "out_of_credits" | "none";
}> {
  const out = { looked: 0, fixed: 0 };
  const db = await getDb();
  if (!db || !(await isLibraryReady(db))) return { ...out, skipped: "not_ready" };
  if (scrapeCreatorsOutOfCredits()) return { ...out, skipped: "out_of_credits" };
  try {
    const placeholder = and(
      eq(viralPostCandidates.platform, "youtube"),
      inArray(viralPostCandidates.creatorHandle, [`@${YOUTUBE_PLACEHOLDER_HANDLE}`, YOUTUBE_PLACEHOLDER_HANDLE])
    );
    // Shorts below the viral minimum can never be viral: no lookup, just
    // drop the shared placeholder.
    await db
      .update(viralPostCandidates)
      .set({ creatorHandle: null, creatorId: null, creatorName: "YouTube creator" })
      .where(and(placeholder, sql`COALESCE(${viralPostCandidates.views}, 0) < ${VIRAL_RULE.minViews}`));

    const rows = await db
      .select()
      .from(viralPostCandidates)
      .where(and(placeholder, gte(viralPostCandidates.views, VIRAL_RULE.minViews)))
      .orderBy(desc(viralPostCandidates.views))
      .limit(Math.max(1, Math.min(200, args.max ?? 40)));
    if (rows.length === 0) return { ...out, skipped: "none" };

    const fixed: number[] = [];
    await inBatches(rows, async row => {
      out.looked += 1;
      let fields: ReturnType<typeof channelFields> = null;
      try {
        fields = await lookupChannel(row.sourceUrl);
      } catch {
        fields = null;
      }
      if (scrapeCreatorsOutOfCredits()) return; // not the video's fault: try again later
      await db
        .update(viralPostCandidates)
        .set(fields ?? { creatorHandle: null, creatorId: null, creatorName: "YouTube creator" })
        .where(eq(viralPostCandidates.id, row.id));
      if (fields) fixed.push(row.id);
    });
    out.fixed = fixed.length;
    if (fixed.length > 0) {
      const updated = await db.select().from(viralPostCandidates).where(inArray(viralPostCandidates.id, fixed));
      await classifyLibraryRows({ rows: updated, source: "youtube_channel" });
    }
    console.info("[viralLibrary] youtube_channels_repaired", out);
    return out;
  } catch (err) {
    console.warn("[viralLibrary] youtube_channel_repair_failed", { error: err instanceof Error ? err.message : String(err) });
    return out;
  }
}

/* ---------- "can't judge" YouTube Shorts ---------- */

export function youtubeBaselinesPerDay(): number {
  const n = Number(process.env.YOUTUBE_BASELINE_CHANNELS_PER_DAY);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200;
}

/** Spend-table key counting channels measured today (10 chars). Pure; exported for tests. */
export function youtubeBaselineDayKey(d = new Date()): string {
  return `yb${d.toISOString().slice(0, 10).replace(/-/g, "")}`;
}

/**
 * YouTube Shorts stay "unknown" (can't judge) when we do not know their
 * channel's usual views. Two steps, never throws:
 * 1. Settle the ones that can never qualify: under 10,000 views and either
 *    older than 7 days, under 2,000 views, or without a publish date. They
 *    become not viral (they can be neither viral nor rising). No calls.
 * 2. For channels of the rest (10,000+ views, or young and 2,000+), read the
 *    channel's newest Shorts once (1 call), store its usual views, and
 *    re-judge all its unknown videos. Channels with the most-viewed unknown
 *    videos first; YOUTUBE_BASELINE_CHANNELS_PER_DAY (default 200, about
 *    $0.40 a day) caps the calls. A channel whose Shorts cannot be read, or
 *    has fewer than 3, gets a 0 baseline so it is not retried.
 */
export async function measureYouTubeBaselines(args: { maxChannels?: number } = {}): Promise<{
  settled: number;
  measured: number;
  judged: number;
  failed: number;
  skipped?: "not_ready" | "out_of_credits" | "daily_cap" | "none";
}> {
  const out = { settled: 0, measured: 0, judged: 0, failed: 0 };
  const db = await getDb();
  if (!db || !(await isLibraryReady(db))) return { ...out, skipped: "not_ready" };
  try {
    const [settle] = (await db.execute(sql`
      UPDATE viral_library_status s JOIN viral_post_candidates c ON c.id = s.candidateId
      SET s.status = 'not_viral', s.source = 'youtube_settle', s.checkedAt = NOW(), s.nextCheckAt = NULL
      WHERE s.status = 'unknown' AND s.platform = 'youtube' AND COALESCE(c.views, 0) < ${VIRAL_RULE.minViews}
        AND (c.publishedAt IS NULL OR c.publishedAt < (NOW() - INTERVAL 7 DAY) OR COALESCE(c.views, 0) < ${VIRAL_RULE.risingMinViews})
    `)) as unknown as [{ affectedRows?: number }];
    out.settled = settle?.affectedRows ?? 0;

    if (scrapeCreatorsOutOfCredits()) return { ...out, skipped: "out_of_credits" };
    const dayKey = youtubeBaselineDayKey();
    const [today] = await db.select().from(viralProcessingSpend).where(eq(viralProcessingSpend.day, dayKey)).limit(1);
    const room = Math.min(args.maxChannels ?? 10, youtubeBaselinesPerDay() - (today?.videos ?? 0));
    if (room <= 0) return { ...out, skipped: "daily_cap" };

    const [channels] = (await db.execute(sql`
      SELECT LOWER(TRIM(LEADING '@' FROM c.creatorHandle)) AS handle, MAX(c.views) AS topViews
      FROM viral_library_status s JOIN viral_post_candidates c ON c.id = s.candidateId
      WHERE s.status = 'unknown' AND s.platform = 'youtube'
        AND c.creatorHandle IS NOT NULL AND c.creatorHandle <> ''
        AND LOWER(TRIM(LEADING '@' FROM c.creatorHandle)) <> ${YOUTUBE_PLACEHOLDER_HANDLE}
        AND NOT EXISTS (
          SELECT 1 FROM viral_creator_baselines b
          WHERE b.platform = 'youtube' AND b.handle = LOWER(TRIM(LEADING '@' FROM c.creatorHandle))
        )
      GROUP BY LOWER(TRIM(LEADING '@' FROM c.creatorHandle))
      ORDER BY topViews DESC
      LIMIT ${room}
    `)) as unknown as [Array<{ handle: string }>];
    if (!channels?.length) return { ...out, skipped: "none" };

    const { fetchChannelRecentShortViews } = await import("../youtube");
    const now = new Date();
    let calls = 0;
    for (const ch of channels) {
      if (scrapeCreatorsOutOfCredits()) break;
      const handle = libraryHandle(ch.handle);
      if (!handle) continue;
      calls += 1;
      let shorts: Array<{ views: number; postedAt: Date }> | null = null;
      try {
        shorts = await fetchChannelRecentShortViews(handle);
      } catch {
        shorts = null;
      }
      if (scrapeCreatorsOutOfCredits()) break; // not the channel's fault: try again later
      const usual = shorts ? usualViewsFromRecent(shorts) : null;
      await db
        .insert(viralCreatorBaselines)
        .values({
          platform: "youtube",
          handle,
          usualViews: usual?.usualViews ?? 0,
          sampleSize: usual?.sampleSize ?? 0,
          followers: null,
          source: usual ? "youtube_shorts" : "youtube_none",
          measuredAt: now,
        })
        .onDuplicateKeyUpdate({ set: { measuredAt: now } });
      if (usual) {
        out.measured += 1;
        await reclassifyCreatorUnknowns(db, "youtube", handle, now);
      } else {
        out.failed += 1;
      }
    }
    if (calls > 0) {
      await db
        .insert(viralProcessingSpend)
        .values({ day: dayKey, usd: (calls * 0.002).toFixed(4), videos: calls })
        .onDuplicateKeyUpdate({ set: { usd: sql`usd + ${calls * 0.002}`, videos: sql`videos + ${calls}` } });
    }
    const [judged] = (await db.execute(sql`
      SELECT COUNT(*) AS n FROM viral_library_status WHERE platform = 'youtube' AND source = 'baseline' AND checkedAt >= ${now}
    `)) as unknown as [Array<{ n: number }>];
    out.judged = Number(judged?.[0]?.n ?? 0);
    console.info("[viralLibrary] youtube_baselines", out);
    return out;
  } catch (err) {
    console.warn("[viralLibrary] youtube_baselines_failed", { error: err instanceof Error ? err.message : String(err) });
    return out;
  }
}
