/**
 * Rising videos are checked again 1, 3, 7 and 14 days after they were posted
 * (shared/viralRule.ts, nextViralRecheckAt). Each check fetches the video's
 * current views (one provider call), saves them on the library row, and runs
 * the one viral rule again: a rising video becomes viral, stays rising until
 * the next check, or drops out. After the last check it is final.
 *
 * Runs in the queue worker, a few per tick; pauses while ScrapeCreators is
 * out of credits. Never throws.
 */
import { and, asc, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { viralPostCandidates, type ViralPostCandidate } from "../../drizzle/schema";
import { viralLibraryStatus } from "../../drizzle/viralLibrarySchema";
import { getDb } from "../db";
import { scrapeCreatorsOutOfCredits } from "../scrapeCreatorsMeter";
import { classifyLibraryRows, isLibraryReady } from "./library";

const CONCURRENCY = 4;

/** Current views of one video, or null when it cannot be read (deleted, private, error). */
async function currentViews(c: ViralPostCandidate): Promise<number | null> {
  if (c.platform === "youtube") {
    const { fetchYouTubeVideoDetails } = await import("../youtube");
    const d = await fetchYouTubeVideoDetails(c.sourceUrl || `https://www.youtube.com/shorts/${c.sourceId}`);
    return d && Number.isFinite(d.viewCount) && d.viewCount > 0 ? d.viewCount : null;
  }
  if (c.platform === "tiktok") {
    const { fetchTikTokVideoDetails } = await import("../tiktok");
    // One quick attempt: a missed check is retried at the next check day.
    const d = await fetchTikTokVideoDetails(c.sourceUrl, { mode: "interactive" });
    return d && Number.isFinite(d.viewCount) && d.viewCount > 0 ? d.viewCount : null;
  }
  if (c.platform === "instagram") {
    const { fetchReelByShortcodeResult } = await import("../instagram");
    const r = await fetchReelByShortcodeResult(c.sourceId, { preferUrl: c.sourceUrl, mode: "interactive" });
    return r.ok && Number.isFinite(r.data.viewCount) && r.data.viewCount > 0 ? r.data.viewCount : null;
  }
  return null;
}

/** Only ever move views up: a failed or odd read must not shrink a video. Pure; exported for tests. */
export function mergedViews(stored: number | null, fetched: number | null): number | null {
  if (fetched == null) return stored;
  if (stored == null) return fetched;
  return Math.max(stored, fetched);
}

export async function runRisingRecheck(args: { max?: number; now?: Date } = {}): Promise<{
  checked: number;
  becameViral: number;
  stillRising: number;
  dropped: number;
  unreadable: number;
  skipped?: "not_ready" | "out_of_credits" | "none_due";
}> {
  const out = { checked: 0, becameViral: 0, stillRising: 0, dropped: 0, unreadable: 0 };
  const db = await getDb();
  if (!db || !(await isLibraryReady(db))) return { ...out, skipped: "not_ready" };
  if (scrapeCreatorsOutOfCredits()) return { ...out, skipped: "out_of_credits" };
  const now = args.now ?? new Date();
  try {
    const due = await db
      .select({ candidate: viralPostCandidates })
      .from(viralLibraryStatus)
      .innerJoin(viralPostCandidates, eq(viralPostCandidates.id, viralLibraryStatus.candidateId))
      .where(
        and(
          eq(viralLibraryStatus.status, "rising"),
          isNotNull(viralLibraryStatus.nextCheckAt),
          lte(viralLibraryStatus.nextCheckAt, now)
        )
      )
      .orderBy(asc(viralLibraryStatus.nextCheckAt))
      .limit(Math.max(1, Math.min(200, args.max ?? 30)));
    if (due.length === 0) return { ...out, skipped: "none_due" };

    const fresh = new Map<string, { views: number | null; publishedAt: Date | null }>();
    const rows = due.map(d => d.candidate);
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      if (scrapeCreatorsOutOfCredits()) break;
      await Promise.all(
        rows.slice(i, i + CONCURRENCY).map(async c => {
          let views: number | null = null;
          try {
            views = await currentViews(c);
          } catch {
            views = null;
          }
          if (views == null) out.unreadable += 1;
          const merged = mergedViews(c.views ?? null, views);
          fresh.set(`${c.platform}:${c.sourceId}`, { views: merged, publishedAt: c.publishedAt ?? null });
          if (views != null && merged !== c.views) {
            await db.update(viralPostCandidates).set({ views: merged }).where(eq(viralPostCandidates.id, c.id));
          }
        })
      );
    }
    // Only judge rows we actually tried (an out-of-credits stop leaves the rest due).
    const tried = rows.filter(c => fresh.has(`${c.platform}:${c.sourceId}`));
    if (tried.length === 0) return { ...out, skipped: "out_of_credits" };
    const result = await classifyLibraryRows({ rows: tried, source: "recheck", fresh, now });
    out.checked = tried.length;
    out.becameViral = result.byStatus.viral ?? 0;
    out.stillRising = result.byStatus.rising ?? 0;
    out.dropped = (result.byStatus.not_viral ?? 0) + (result.byStatus.unknown ?? 0);

    // A rising video past its last check day is final: make sure it is not left due forever.
    const ids = tried.map(c => c.id);
    await db
      .update(viralLibraryStatus)
      .set({ nextCheckAt: null })
      .where(
        and(
          inArray(viralLibraryStatus.candidateId, ids),
          eq(viralLibraryStatus.status, "rising"),
          lte(viralLibraryStatus.nextCheckAt, now)
        )
      );
    console.info("[viralLibrary] rising_recheck_done", out);
    return out;
  } catch (err) {
    console.warn("[viralLibrary] rising_recheck_failed", { error: err instanceof Error ? err.message : String(err) });
    return out;
  }
}
