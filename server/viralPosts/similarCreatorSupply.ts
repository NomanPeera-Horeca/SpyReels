import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  ne,
  sql,
} from "drizzle-orm";
import {
  featuredAccountNiches,
  featuredAccounts,
  featuredReels,
  niches,
} from "../../drizzle/schema";
import { getDb } from "../db";

export type SimilarFeaturedCreator = {
  id: number;
  handle: string;
  displayName: string;
  followerCount: number;
  profilePicUrl: string | null;
  nicheSlug: string;
  nicheName: string;
};

export type SimilarFeaturedReelSupply = {
  featuredReelId: number;
  featuredAccountId: number;
  sourceId: string;
  sourceUrl: string;
  creatorHandle: string;
  creatorName: string;
  creatorAvatarUrl: string | null;
  creatorFollowers: number;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  caption: string | null;
  publishedAt: Date;
  views: number;
  likes: number;
  comments: number;
  nicheSlug: string;
  nicheName: string;
  viralFlag: boolean;
  remakeabilityScore: number | null;
  suggestedAction: string | null;
  rank: number | null;
};

export type SimilarCreatorSupplyResult = {
  nicheSlugs: string[];
  creators: SimilarFeaturedCreator[];
  reels: SimilarFeaturedReelSupply[];
};

const MAX_SEED_NICHES = 5;
const MAX_SIMILAR_CREATORS = 8;
const MAX_REELS_PER_CREATOR = 2;
const MAX_SIMILAR_REELS = 12;
const MAX_REELS_READ_PER_CREATOR = 8;

function normalizeHandle(value: string | null | undefined): string | null {
  const normalized = (value || "").replace(/^@/, "").trim().toLowerCase();
  return normalized || null;
}

function orderedUnique(values: Array<string | null | undefined>, max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = (raw || "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
    if (out.length >= max) break;
  }
  return out;
}

export function selectRelatedFeaturedCreators(
  rows: SimilarFeaturedCreator[],
  args: { excludeHandles?: Iterable<string>; limit?: number } = {}
): SimilarFeaturedCreator[] {
  const limit = Math.min(Math.max(args.limit ?? MAX_SIMILAR_CREATORS, 0), 20);
  if (limit === 0) return [];

  const excluded = new Set(
    [...(args.excludeHandles ?? [])]
      .map((handle) => normalizeHandle(handle))
      .filter((handle): handle is string => Boolean(handle))
  );
  const grouped = new Map<string, SimilarFeaturedCreator[]>();
  const seenHandles = new Set<string>();

  for (const row of rows) {
    const handle = normalizeHandle(row.handle);
    if (!handle || excluded.has(handle) || seenHandles.has(handle)) continue;
    seenHandles.add(handle);
    const list = grouped.get(row.nicheSlug) ?? [];
    list.push(row);
    grouped.set(row.nicheSlug, list);
  }

  const nicheOrder = [...grouped.keys()];
  const out: SimilarFeaturedCreator[] = [];
  let round = 0;
  while (out.length < limit) {
    let added = false;
    for (const slug of nicheOrder) {
      const row = grouped.get(slug)?.[round];
      if (!row) continue;
      out.push(row);
      added = true;
      if (out.length >= limit) break;
    }
    if (!added) break;
    round += 1;
  }
  return out;
}

function featuredReelQualityScore(row: SimilarFeaturedReelSupply): number {
  let score = 0;
  if (row.suggestedAction === "make_version") score += 40;
  if (row.viralFlag) score += 25;
  score += Math.min(40, Math.max(0, row.remakeabilityScore ?? 50) * 0.4);
  const rank = row.rank != null && row.rank > 0 ? row.rank : 30;
  score += Math.max(0, 16 - Math.min(rank, 16));
  score += Math.min(10, Math.log10(Math.max(1, row.views)));
  return score;
}

function featuredReelEligible(row: SimilarFeaturedReelSupply): boolean {
  if (row.suggestedAction === "view_only") return false;
  if (row.remakeabilityScore != null && row.remakeabilityScore < 45) return false;
  return true;
}

export function selectBestSimilarFeaturedReels(
  rows: SimilarFeaturedReelSupply[],
  creatorOrder: SimilarFeaturedCreator[],
  args: { maxPerCreator?: number; limit?: number } = {}
): SimilarFeaturedReelSupply[] {
  const maxPerCreator = Math.min(
    Math.max(args.maxPerCreator ?? MAX_REELS_PER_CREATOR, 1),
    4
  );
  const limit = Math.min(Math.max(args.limit ?? MAX_SIMILAR_REELS, 0), 30);
  if (limit === 0) return [];

  const byCreator = new Map<number, SimilarFeaturedReelSupply[]>();
  for (const row of rows) {
    if (!featuredReelEligible(row)) continue;
    const list = byCreator.get(row.featuredAccountId) ?? [];
    list.push(row);
    byCreator.set(row.featuredAccountId, list);
  }
  for (const list of byCreator.values()) {
    list.sort((a, b) => {
      const scoreDelta = featuredReelQualityScore(b) - featuredReelQualityScore(a);
      if (scoreDelta !== 0) return scoreDelta;
      if ((a.rank ?? 999) !== (b.rank ?? 999)) {
        return (a.rank ?? 999) - (b.rank ?? 999);
      }
      return b.views - a.views;
    });
  }

  const out: SimilarFeaturedReelSupply[] = [];
  for (let round = 0; round < maxPerCreator && out.length < limit; round += 1) {
    for (const creator of creatorOrder) {
      const reel = byCreator.get(creator.id)?.[round];
      if (!reel) continue;
      out.push(reel);
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function resolveSeedNicheSlugs(args: {
  nicheSlugs: string[];
  nicheNames: string[];
  seedHandles: string[];
}): Promise<string[]> {
  const db = await getDb();
  if (!db) return orderedUnique(args.nicheSlugs, MAX_SEED_NICHES);

  const slugs: string[] = orderedUnique(args.nicheSlugs, MAX_SEED_NICHES);
  if (slugs.length >= MAX_SEED_NICHES) return slugs;

  const nicheNames = orderedUnique(args.nicheNames, MAX_SEED_NICHES);
  if (nicheNames.length > 0) {
    const rows = await db
      .select({ slug: niches.slug })
      .from(niches)
      .where(inArray(niches.name, nicheNames))
      .orderBy(asc(niches.sortOrder));
    slugs.push(...rows.map((row) => row.slug));
  }

  if (slugs.length < MAX_SEED_NICHES) {
    const handles = orderedUnique(
      args.seedHandles.map((handle) => normalizeHandle(handle)),
      20
    );
    if (handles.length > 0) {
      const rows = await db
        .select({
          slug: niches.slug,
          isPrimary: featuredAccountNiches.isPrimary,
          sortOrder: niches.sortOrder,
        })
        .from(featuredAccounts)
        .innerJoin(
          featuredAccountNiches,
          eq(featuredAccountNiches.accountId, featuredAccounts.id)
        )
        .innerJoin(niches, eq(niches.id, featuredAccountNiches.nicheId))
        .where(
          and(
            inArray(featuredAccounts.handle, handles),
            eq(featuredAccounts.isActive, true)
          )
        )
        .orderBy(desc(featuredAccountNiches.isPrimary), asc(niches.sortOrder));
      slugs.push(...rows.map((row) => row.slug));
    }
  }

  return orderedUnique(slugs, MAX_SEED_NICHES);
}

async function loadRelatedCreators(args: {
  nicheSlugs: string[];
  excludeHandles: string[];
}): Promise<SimilarFeaturedCreator[]> {
  const db = await getDb();
  if (!db || args.nicheSlugs.length === 0) return [];

  // Same eligibility invariant used by the existing Featured
  // `relatedCreators` surface: matching catalog niche, active account,
  // and at least one stored reel whose transcription has not failed.
  const rows = await db
    .select({
      id: featuredAccounts.id,
      handle: featuredAccounts.handle,
      displayName: featuredAccounts.displayName,
      followerCount: featuredAccounts.followerCount,
      profilePicUrl: featuredAccounts.profilePicUrl,
      nicheSlug: niches.slug,
      nicheName: niches.name,
      isPrimary: featuredAccountNiches.isPrimary,
      reelsAvailable: sql<number>`COUNT(${featuredReels.id})`,
    })
    .from(niches)
    .innerJoin(
      featuredAccountNiches,
      eq(featuredAccountNiches.nicheId, niches.id)
    )
    .innerJoin(
      featuredAccounts,
      eq(featuredAccounts.id, featuredAccountNiches.accountId)
    )
    .leftJoin(
      featuredReels,
      and(
        eq(featuredReels.featuredAccountId, featuredAccounts.id),
        ne(featuredReels.transcriptionStatus, "failed")
      )
    )
    .where(
      and(
        inArray(niches.slug, args.nicheSlugs),
        eq(featuredAccounts.isActive, true)
      )
    )
    .groupBy(
      featuredAccounts.id,
      featuredAccounts.handle,
      featuredAccounts.displayName,
      featuredAccounts.followerCount,
      featuredAccounts.profilePicUrl,
      niches.slug,
      niches.name,
      featuredAccountNiches.isPrimary,
      niches.sortOrder
    )
    .having(sql`COUNT(${featuredReels.id}) > 0`)
    .orderBy(
      desc(featuredAccountNiches.isPrimary),
      asc(niches.sortOrder),
      desc(featuredAccounts.followerCount)
    )
    .limit(80);

  return selectRelatedFeaturedCreators(
    rows.map((row) => ({
      id: row.id,
      handle: row.handle,
      displayName: row.displayName ?? "",
      followerCount: row.followerCount,
      profilePicUrl: row.profilePicUrl ?? null,
      nicheSlug: row.nicheSlug,
      nicheName: row.nicheName,
    })),
    {
      excludeHandles: args.excludeHandles,
      limit: MAX_SIMILAR_CREATORS,
    }
  );
}

async function loadCreatorReels(args: {
  creators: SimilarFeaturedCreator[];
  minPublishedAt: Date;
}): Promise<SimilarFeaturedReelSupply[]> {
  const db = await getDb();
  if (!db || args.creators.length === 0) return [];

  const creatorIds = args.creators.map((creator) => creator.id);
  const creatorById = new Map(args.creators.map((creator) => [creator.id, creator]));
  const rows = await db
    .select({
      featuredReelId: featuredReels.id,
      featuredAccountId: featuredReels.featuredAccountId,
      reelShortcode: featuredReels.reelShortcode,
      caption: featuredReels.caption,
      viewCount: featuredReels.viewCount,
      likeCount: featuredReels.likeCount,
      commentCount: featuredReels.commentCount,
      thumbnailUrl: featuredReels.thumbnailUrl,
      videoUrl: featuredReels.videoUrl,
      postedAt: featuredReels.postedAt,
      rank: featuredReels.rank,
      viralFlag: featuredReels.viralFlag,
      remakeabilityScore: featuredReels.remakeabilityScore,
      suggestedAction: featuredReels.suggestedAction,
    })
    .from(featuredReels)
    .where(
      and(
        inArray(featuredReels.featuredAccountId, creatorIds),
        ne(featuredReels.transcriptionStatus, "failed"),
        gte(featuredReels.postedAt, args.minPublishedAt)
      )
    )
    .orderBy(asc(featuredReels.featuredAccountId), asc(featuredReels.rank))
    .limit(args.creators.length * MAX_REELS_READ_PER_CREATOR);

  return rows.flatMap((row) => {
    const creator = creatorById.get(row.featuredAccountId);
    if (!creator) return [];
    return [
      {
        featuredReelId: row.featuredReelId,
        featuredAccountId: row.featuredAccountId,
        sourceId: row.reelShortcode,
        sourceUrl: `https://www.instagram.com/reel/${row.reelShortcode}/`,
        creatorHandle: creator.handle,
        creatorName: creator.displayName,
        creatorAvatarUrl: creator.profilePicUrl,
        creatorFollowers: creator.followerCount,
        thumbnailUrl: row.thumbnailUrl ?? null,
        videoUrl: row.videoUrl ?? null,
        caption: row.caption ?? null,
        publishedAt: row.postedAt,
        views: row.viewCount,
        likes: row.likeCount,
        comments: row.commentCount,
        nicheSlug: creator.nicheSlug,
        nicheName: creator.nicheName,
        viralFlag: row.viralFlag ?? false,
        remakeabilityScore: row.remakeabilityScore ?? null,
        suggestedAction: row.suggestedAction ?? null,
        rank: row.rank ?? null,
      },
    ];
  });
}

/**
 * Zero-provider expansion for Today’s Picks. Uses only the existing Featured
 * catalog and cached user/Radar niche signals supplied by the caller.
 */
export async function loadSimilarCreatorSupply(args: {
  nicheSlugs?: string[] | null;
  nicheNames?: string[] | null;
  seedHandles?: string[] | null;
  excludeHandles?: string[] | null;
  maxAgeHours: number;
  now?: Date;
}): Promise<SimilarCreatorSupplyResult> {
  const now = args.now ?? new Date();
  const nicheSlugs = await resolveSeedNicheSlugs({
    nicheSlugs: args.nicheSlugs ?? [],
    nicheNames: args.nicheNames ?? [],
    seedHandles: args.seedHandles ?? [],
  });
  if (nicheSlugs.length === 0) {
    return { nicheSlugs: [], creators: [], reels: [] };
  }

  const creators = await loadRelatedCreators({
    nicheSlugs,
    excludeHandles: args.excludeHandles ?? [],
  });
  if (creators.length === 0) {
    return { nicheSlugs, creators: [], reels: [] };
  }

  const minPublishedAt = new Date(
    now.getTime() - Math.max(1, args.maxAgeHours) * 60 * 60 * 1000
  );
  const rows = await loadCreatorReels({ creators, minPublishedAt });
  const reels = selectBestSimilarFeaturedReels(rows, creators, {
    maxPerCreator: MAX_REELS_PER_CREATOR,
    limit: MAX_SIMILAR_REELS,
  });
  return { nicheSlugs, creators, reels };
}
