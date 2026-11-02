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
 * Both stop while ScrapeCreators is out of credits.
 */
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { VIRAL_RULE } from "@shared/viralRule";
import { viralPostCandidates } from "../../drizzle/schema";
import { getDb } from "../db";
import { scrapeCreatorsOutOfCredits } from "../scrapeCreatorsMeter";
import { fetchYouTubeVideoDetails } from "../youtube";
import type { AdaptedCandidate } from "./candidateAdapter";
import { classifyLibraryRows, isLibraryReady } from "./library";

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
