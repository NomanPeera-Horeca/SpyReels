/**
 * Ready-made TikTok and YouTube creators for Creator Research → Explore
 * creators (Figma page 18, "Explore creators · TikTok", approved 2026-11-24).
 *
 * Built only from videos already in the shared library (viral_post_candidates
 * linked to a niche's pools): no provider calls, no research used. A creator
 * shows when the library holds at least MIN_LIBRARY_VIDEOS of their videos.
 * Opening one lists those stored videos; "Get all their videos" on the page
 * starts a normal research instead.
 */
import { and, desc, eq, or, sql } from "drizzle-orm";
import type { ViralPost } from "@shared/viralPosts";
import { viralPostCandidates, viralPostPools, type ViralPostCandidate } from "../../drizzle/schema";
import { getDb } from "../db";
import { candidateToAdapted, toViralPost } from "./browseService";
import { DEFAULT_CONTENT_PILLARS } from "./constants";
import { isViralPostsLive, isViralPostsTiktokEnabled, isViralPostsYoutubeEnabled } from "./featureFlag";
import * as poolRepo from "./poolRepository";
import * as repo from "./repository";

export type LibraryPlatform = "tiktok" | "youtube";

export const MIN_LIBRARY_VIDEOS = 2;
const CREATOR_LIMIT = 12;
const POOL_CANDIDATE_LIMIT = 600;
const CREATOR_VIDEO_LIMIT = 24;

export type ExploreLibraryCreator = {
  /** Stable key: platform + lower-case handle. */
  key: string;
  platform: LibraryPlatform;
  handle: string;
  displayName: string | null;
  profilePicUrl: string | null;
  followerCount: number;
  /** Videos of theirs already in the library for this niche. */
  videoCount: number;
  bestViews: number;
};

export function platformEnabled(platform: LibraryPlatform): boolean {
  if (!isViralPostsLive) return false;
  return platform === "tiktok" ? isViralPostsTiktokEnabled : isViralPostsYoutubeEnabled;
}

/**
 * Library pool for an Explore niche name ("Restaurants & cafés", "Fitness").
 * Plain keywords (same pools as the content taxonomy). Unknown niches get no pool, so they
 * show no TikTok/YouTube creators rather than unrelated Business videos. Pure.
 */
export function libraryPoolForExploreNiche(name: string | null | undefined): { niche: string; pillars: string[] | null } | null {
  const text = (name ?? "").trim();
  if (!text) return null;
  const t = text.toLowerCase();
  if (/restaurant|caf[eé]|coffee|food|bar\b|bakery|kitchen|chef|hospitality|catering|menu/.test(t)) {
    return { niche: "Business & Entrepreneurship", pillars: [...DEFAULT_CONTENT_PILLARS] };
  }
  if (/fitness|gym|workout|yoga|pilates|personal train/.test(t)) return { niche: "Health & Fitness", pillars: null };
  if (/beauty|skin|makeup|hair|nail|salon|spa\b/.test(t)) return { niche: "Beauty", pillars: null };
  if (/real estate|realtor|property|mortgage/.test(t)) return { niche: "Real Estate", pillars: null };
  if (/finance|money|invest|budget|wealth/.test(t)) return { niche: "Personal Finance", pillars: null };
  return null;
}

/** Lower-case handle without "@", falling back to the creator id. Pure. */
export function creatorKeyOf(c: Pick<ViralPostCandidate, "creatorHandle" | "creatorId">): string {
  return (c.creatorHandle || c.creatorId || "").trim().replace(/^@/, "").toLowerCase();
}

/**
 * Group library videos by creator: creators with at least MIN_LIBRARY_VIDEOS,
 * most videos first, then followers. Pure; exported for tests.
 */
export function groupLibraryCreators(
  candidates: Array<
    Pick<
      ViralPostCandidate,
      "id" | "platform" | "creatorHandle" | "creatorId" | "creatorName" | "creatorAvatarUrl" | "creatorFollowers" | "views"
    >
  >,
  platform: LibraryPlatform,
  limit = CREATOR_LIMIT
): ExploreLibraryCreator[] {
  const by = new Map<string, { c: (typeof candidates)[number]; ids: Set<number>; best: number; followers: number }>();
  for (const c of candidates) {
    if (c.platform !== platform) continue;
    const key = creatorKeyOf(c);
    if (!key) continue;
    const entry = by.get(key) ?? { c, ids: new Set<number>(), best: 0, followers: 0 };
    entry.ids.add(c.id);
    entry.best = Math.max(entry.best, c.views ?? 0);
    entry.followers = Math.max(entry.followers, c.creatorFollowers ?? 0);
    if (!entry.c.creatorAvatarUrl && c.creatorAvatarUrl) entry.c = c;
    by.set(key, entry);
  }
  return Array.from(by.entries())
    .filter(([, e]) => e.ids.size >= MIN_LIBRARY_VIDEOS)
    .sort((a, b) => b[1].ids.size - a[1].ids.size || b[1].followers - a[1].followers || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([key, e]) => ({
      key: `${platform}:${key}`,
      platform,
      handle: (e.c.creatorHandle || e.c.creatorId || key).trim().replace(/^@/, ""),
      displayName: e.c.creatorName?.trim() || null,
      profilePicUrl: e.c.creatorAvatarUrl || null,
      followerCount: e.followers,
      videoCount: e.ids.size,
      bestViews: e.best,
    }));
}

async function poolIdsFor(platform: LibraryPlatform, nicheName: string | null): Promise<number[]> {
  if (nicheName === null) {
    const db = await getDb();
    if (!db) return [];
    const rows = await db.select({ id: viralPostPools.id }).from(viralPostPools).where(eq(viralPostPools.platform, platform));
    return rows.map(r => r.id);
  }
  const target = libraryPoolForExploreNiche(nicheName);
  if (!target) return [];
  const pools = await poolRepo.listPoolsForNiche(target.niche, [platform]);
  const pillars = target.pillars ? new Set(target.pillars.map(p => p.toLowerCase())) : null;
  return pools.filter(p => !pillars || pillars.has(p.pillar.toLowerCase())).map(p => p.id);
}

/** TikTok or YouTube creators for an Explore niche (null = all niches). */
export async function exploreLibraryCreators(args: {
  platform: LibraryPlatform;
  nicheName: string | null;
}): Promise<ExploreLibraryCreator[]> {
  if (!platformEnabled(args.platform)) return [];
  const poolIds = await poolIdsFor(args.platform, args.nicheName);
  if (poolIds.length === 0) return [];
  const rows = await poolRepo.loadPoolCandidatesForAssembly({ poolIds, limit: POOL_CANDIDATE_LIMIT });
  return groupLibraryCreators(
    rows.map(r => r.candidate),
    args.platform
  );
}

/** One creator's videos already in the library, most viewed first. */
export async function libraryCreatorVideos(args: {
  userId: number;
  platform: LibraryPlatform;
  handle: string;
}): Promise<ViralPost[]> {
  if (!platformEnabled(args.platform)) return [];
  const handle = args.handle.trim().replace(/^@/, "").toLowerCase();
  if (!handle) return [];
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(viralPostCandidates)
    .where(
      and(
        eq(viralPostCandidates.platform, args.platform),
        or(
          sql`LOWER(TRIM(LEADING '@' FROM ${viralPostCandidates.creatorHandle})) = ${handle}`,
          eq(viralPostCandidates.creatorId, args.handle.trim())
        )
      )
    )
    .orderBy(desc(viralPostCandidates.views))
    .limit(CREATOR_VIDEO_LIMIT);
  if (rows.length === 0) return [];
  const saved = await repo.getSavedCandidateIds(args.userId);
  return rows.map(c => toViralPost(c, candidateToAdapted(c, "General", "", null), saved.has(c.id)));
}

export const LIBRARY_PLATFORMS = ["tiktok", "youtube"] as const;
