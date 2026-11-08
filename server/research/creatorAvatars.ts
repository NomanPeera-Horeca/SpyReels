/**
 * Creator photos for Home's "Creators going viral".
 *
 * Library videos carry the creator photo the search API returned, which is
 * often missing (TikTok search) or a platform link that expires after a few
 * days. Research jobs (including the background pre-research of the creators
 * Home shows) save a lasting copy of the creator's photo, so prefer that one
 * and fall back to the library photo. Never throws: on any error the
 * creators are returned unchanged.
 */
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { scrapeJobs, tiktokScrapeJobs, youtubeScrapeJobs } from "../../drizzle/schema";
import { getDb } from "../db";
import { prefetchHandle } from "./prefetch";

type CreatorLike = { platform: string; handle: string; profilePicUrl: string | null };

/** Newest saved photo per handle wins. Pure; exported for tests. */
export function pickAvatars(rows: Array<{ handle: string; profilePicUrl: string | null }>): Map<string, string> {
  const out = new Map<string, string>();
  for (const r of rows) {
    const url = (r.profilePicUrl ?? "").trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const key = r.handle.toLowerCase();
    if (!out.has(key)) out.set(key, url);
  }
  return out;
}

export async function withResearchAvatars<T extends CreatorLike>(creators: T[]): Promise<T[]> {
  if (creators.length === 0) return creators;
  try {
    const db = await getDb();
    if (!db) return creators;
    const handlesFor = (platform: string) => [
      ...new Set(
        creators.filter(c => c.platform === platform).map(c => prefetchHandle(platform, c.handle)).filter(Boolean)
      ),
    ];
    const ig = handlesFor("instagram");
    const tt = handlesFor("tiktok");
    const yt = handlesFor("youtube");
    const [igRows, ttRows, ytRows] = await Promise.all([
      ig.length
        ? db
            .select({ handle: scrapeJobs.handle, profilePicUrl: scrapeJobs.profilePicUrl })
            .from(scrapeJobs)
            .where(and(inArray(scrapeJobs.handle, ig), isNotNull(scrapeJobs.profilePicUrl), ne(scrapeJobs.profilePicUrl, "")))
            .orderBy(desc(scrapeJobs.updatedAt))
            .limit(200)
        : [],
      tt.length
        ? db
            .select({ handle: tiktokScrapeJobs.handle, profilePicUrl: tiktokScrapeJobs.profilePicUrl })
            .from(tiktokScrapeJobs)
            .where(
              and(
                inArray(tiktokScrapeJobs.handle, tt),
                isNotNull(tiktokScrapeJobs.profilePicUrl),
                ne(tiktokScrapeJobs.profilePicUrl, "")
              )
            )
            .orderBy(desc(tiktokScrapeJobs.updatedAt))
            .limit(200)
        : [],
      yt.length
        ? db
            .select({ handle: youtubeScrapeJobs.handle, profilePicUrl: youtubeScrapeJobs.profilePicUrl })
            .from(youtubeScrapeJobs)
            .where(
              and(
                inArray(youtubeScrapeJobs.handle, yt),
                isNotNull(youtubeScrapeJobs.profilePicUrl),
                ne(youtubeScrapeJobs.profilePicUrl, "")
              )
            )
            .orderBy(desc(youtubeScrapeJobs.updatedAt))
            .limit(200)
        : [],
    ]);
    const byPlatform: Record<string, Map<string, string>> = {
      instagram: pickAvatars(igRows),
      tiktok: pickAvatars(ttRows),
      youtube: pickAvatars(ytRows),
    };
    return creators.map(c => {
      const saved = byPlatform[c.platform]?.get(prefetchHandle(c.platform, c.handle).toLowerCase());
      return saved ? { ...c, profilePicUrl: saved } : c;
    });
  } catch (err) {
    console.warn("[home] creator_avatars_failed", { error: err instanceof Error ? err.message : String(err) });
    return creators;
  }
}
