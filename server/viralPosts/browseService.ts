import type { FollowerViralBadge } from "@shared/viralTier";
import type {
  ViralMediaStatus,
  ViralPost,
  ViralPostPlatform,
} from "@shared/viralPosts";
import { isViralPostsV1Platform } from "@shared/viralPosts";
import { eq } from "drizzle-orm";
import {
  users,
  type ViralPostCandidate,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  adaptabilityScoreForCandidate,
  type AdaptedCandidate,
} from "./candidateAdapter";
import {
  buildPoolKey,
  DEFAULT_CONTENT_PILLARS,
  VIRAL_POOL_DEFAULTS,
  VIRAL_SEED_POOL_PILLAR,
} from "./constants";
import {
  isViralPostsInstagramEnabled,
  isViralPostsLive,
  isViralPostsTiktokEnabled,
  isViralPostsYoutubeEnabled,
} from "./featureFlag";
import { resolveThumbnailFallback } from "./mediaMirror";
import { classifyCandidatePillars } from "./pillarClassify";
import * as poolRepo from "./poolRepository";
import { schedulePoolRefresh } from "./poolRefresh";
import * as repo from "./repository";
import {
  rankIndexedHomeInventory,
  type IndexedHomeCreatorPick,
  type IndexedHomePost,
} from "./indexedHomeSelection";
import { scoreCandidate } from "./scoring";

const EXPLORE_BROWSE_LIMIT = 24;
const EXPLORE_POOL_LOAD_LIMIT = Math.max(
  VIRAL_POOL_DEFAULTS.assemblyCandidateLimit,
  EXPLORE_BROWSE_LIMIT * 4
);

function deriveHook(caption: string | null): string | null {
  if (!caption) return null;
  const cleaned = caption.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  return (cleaned.split(/[.!?\n]/)[0] || cleaned).trim().slice(0, 160) || null;
}

function inferNiche(businessDescription: string): string {
  const t = businessDescription.toLowerCase();
  if (/restaurant|cafe|food|kitchen|hospitality|menu|chef/.test(t)) {
    return "Business & Entrepreneurship";
  }
  if (/fitness|gym|workout|health/.test(t)) return "Health & Fitness";
  if (/beauty|skincare|makeup/.test(t)) return "Beauty";
  if (/real estate|realtor|housing/.test(t)) return "Real Estate";
  if (/finance|money|invest/.test(t)) return "Personal Finance";
  return "Business & Entrepreneurship";
}

function inferActivePillars(
  businessDescription: string,
  niche: string
): string[] {
  const t = businessDescription.toLowerCase();
  if (/restaurant|cafe|food|kitchen|hospitality|menu|chef/.test(t)) {
    return [...DEFAULT_CONTENT_PILLARS];
  }
  return [niche, `${niche} marketing`, `${niche} operations`].slice(0, 4);
}

async function loadUserBusinessDescription(userId: number): Promise<string> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const [user] = await db
    .select({ businessDescription: users.businessDescription })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const value = user?.businessDescription?.trim() || "";
  return value.length >= 20
    ? value
    : "Instagram Reels ideas for small business owners who want practical, remakeable content.";
}

type BrowsePlatforms = {
  instagram: boolean;
  tiktok: boolean;
  youtube: boolean;
};

function browsePoolSpecs(args: {
  niche: string;
  pillars: string[];
  includeSeedMix?: boolean;
  platforms?: BrowsePlatforms;
}) {
  const platforms = args.platforms ?? {
    instagram: isViralPostsInstagramEnabled,
    tiktok: isViralPostsTiktokEnabled,
    youtube: isViralPostsYoutubeEnabled,
  };
  const specs: Array<{
    niche: string;
    pillar: string;
    platform?: string;
  }> = [];

  if (platforms.instagram) {
    for (const pillar of args.pillars.slice(0, 6)) {
      specs.push({ niche: args.niche, pillar, platform: "instagram" });
    }
  }
  if (platforms.tiktok) {
    for (const pillar of args.pillars.slice(0, 6)) {
      specs.push({ niche: args.niche, pillar, platform: "tiktok" });
    }
    if (args.includeSeedMix !== false) {
      specs.push({
        niche: args.niche,
        pillar: VIRAL_SEED_POOL_PILLAR,
        platform: "tiktok",
      });
    }
  }
  if (platforms.youtube) {
    for (const pillar of args.pillars.slice(0, 6)) {
      specs.push({ niche: args.niche, pillar, platform: "youtube" });
    }
  }

  return specs;
}

const INDEXED_CONTENT_STRATEGY = /restaurant|cafe|food|kitchen|hospitality|menu|chef/;

function isBareBusinessCatalogLabel(text: string): boolean {
  const label = text.trim().toLowerCase();
  return label === "business & entrepreneurship" || label === "business and entrepreneurship";
}

/**
 * The six indexed content pillars are restaurant supply stored under
 * Business & Entrepreneurship. Use them only when the confirmed niche and
 * strategy actually match that supply. The catalog label alone does not.
 * Explore still uses inferActivePillars and is not affected.
 */
export function strategyUsesIndexedContentPillars(args: {
  nicheText: string;
  confirmedPillars: string[];
  goalText?: string | null;
  audienceText?: string | null;
}): boolean {
  const indexed = new Set(DEFAULT_CONTENT_PILLARS.map(pillar => pillar.toLowerCase()));
  const pillars = args.confirmedPillars.map(pillar => pillar.trim()).filter(Boolean);
  if (pillars.some(pillar => indexed.has(pillar.toLowerCase()))) return true;
  const strategy = [args.goalText ?? "", args.audienceText ?? "", ...pillars]
    .join("\n")
    .toLowerCase();
  if (INDEXED_CONTENT_STRATEGY.test(strategy)) return true;
  if (isBareBusinessCatalogLabel(args.nicheText)) return false;
  return INDEXED_CONTENT_STRATEGY.test(args.nicheText.toLowerCase());
}

/**
 * Other existing pools in the same niche, limited to pillars that match the
 * strategy. Chosen pools and unrelated pillars stay out.
 */
export function relevantIndexedNichePools<T extends { poolKey: string; pillar: string }>(
  chosenKeys: ReadonlySet<string>,
  existing: T[],
  relevantPillars: readonly string[]
): T[] {
  const allowed = new Set(relevantPillars.map(pillar => pillar.trim().toLowerCase()));
  if (allowed.size === 0) return [];
  return existing.filter(pool => {
    if (chosenKeys.has(pool.poolKey)) return false;
    return allowed.has(pool.pillar.trim().toLowerCase());
  });
}

/**
 * Both Home sections share one selection. Widen only when that selection has
 * no eligible videos and no qualifying creators.
 */
export function indexedHomePoolsWhenSelectionIsEmpty<
  T extends { poolKey: string; pillar: string },
>(args: {
  chosen: T[];
  nichePools: T[];
  relevantPillars: readonly string[];
  eligibleVideos: number;
  qualifyingCreators: number;
}): T[] {
  if (args.eligibleVideos > 0 || args.qualifyingCreators > 0) return args.chosen;
  const extra = relevantIndexedNichePools(
    new Set(args.chosen.map(pool => pool.poolKey)),
    args.nichePools,
    args.relevantPillars
  );
  return extra.length > 0 ? extra : args.chosen;
}

/**
 * Confirmed pillar titles are looked up under the existing Viral Posts niche
 * string. Goal and audience do not change that niche. They can select the six
 * indexed content pillars when the strategy matches. When none of the chosen
 * pools exist, the caller uses the fallback specs, including the TikTok seed-mix pool.
 */
export function indexedHomePoolSpecChoices(args: {
  nicheText: string;
  confirmedPillars: string[];
  goalText?: string | null;
  audienceText?: string | null;
  platforms?: BrowsePlatforms;
}): {
  niche: string;
  confirmedSpecs: Array<{ niche: string; pillar: string; platform?: string }>;
  fallbackSpecs: Array<{ niche: string; pillar: string; platform?: string }>;
} {
  const niche = inferNiche(args.nicheText);
  const confirmed = [
    ...new Set(args.confirmedPillars.map(pillar => pillar.trim()).filter(Boolean)),
  ].slice(0, 6);
  const fallbackPillars = strategyUsesIndexedContentPillars(args)
    ? [...DEFAULT_CONTENT_PILLARS]
    : inferActivePillars(args.nicheText, niche);
  return {
    niche,
    confirmedSpecs:
      confirmed.length > 0
        ? browsePoolSpecs({
            niche,
            pillars: confirmed,
            includeSeedMix: false,
            platforms: args.platforms,
          })
        : [],
    fallbackSpecs: browsePoolSpecs({
      niche,
      pillars: fallbackPillars,
      includeSeedMix: true,
      platforms: args.platforms,
    }),
  };
}

export function chooseIndexedHomeSpecs<
  T extends { niche: string; pillar: string; platform?: string },
>(args: {
  confirmedSpecs: T[];
  fallbackSpecs: T[];
  existingKeys: ReadonlySet<string>;
}): { specs: T[]; source: "confirmed" | "inferred" } {
  const confirmed = args.confirmedSpecs.filter(spec =>
    args.existingKeys.has(
      buildPoolKey({ platform: spec.platform, niche: spec.niche, pillar: spec.pillar })
    )
  );
  if (confirmed.length > 0) return { specs: confirmed, source: "confirmed" };
  return {
    source: "inferred",
    specs: args.fallbackSpecs.filter(spec =>
      args.existingKeys.has(
        buildPoolKey({ platform: spec.platform, niche: spec.niche, pillar: spec.pillar })
      )
    ),
  };
}

async function ensureBrowsePools(args: { niche: string; pillars: string[] }) {
  return poolRepo.ensurePools(browsePoolSpecs(args));
}

function candidateToAdapted(
  candidate: ViralPostCandidate,
  primaryPillar: string,
  niche: string,
  pillarReason: string | null
): AdaptedCandidate {
  const classification = classifyCandidatePillars({
    caption: candidate.caption,
    hashtags: candidate.hashtags ?? [],
    activePillars: [primaryPillar],
    fallbackNiche: primaryPillar,
  });
  const platform =
    candidate.platform === "tiktok" || candidate.platform === "youtube"
      ? candidate.platform
      : "instagram";

  return {
    platform,
    sourceId: candidate.sourceId,
    sourceUrl: candidate.sourceUrl,
    creatorId: candidate.creatorId,
    creatorName: candidate.creatorName,
    creatorHandle: candidate.creatorHandle,
    creatorAvatarUrl: candidate.creatorAvatarUrl,
    creatorFollowers: candidate.creatorFollowers,
    thumbnailUrl: candidate.thumbnailUrl,
    videoUrl: candidate.videoUrl,
    caption: candidate.caption,
    transcript: candidate.transcript,
    hashtags: candidate.hashtags ?? [],
    publishedAt: candidate.publishedAt,
    views: candidate.views,
    likes: candidate.likes,
    comments: candidate.comments,
    shares: candidate.shares,
    saves: candidate.saves,
    reachMultiplier:
      candidate.reachMultiplier != null ? Number(candidate.reachMultiplier) : null,
    engagementRate:
      candidate.engagementRate != null ? Number(candidate.engagementRate) : null,
    viewsPerHour:
      candidate.viewsPerHour != null ? Number(candidate.viewsPerHour) : null,
    trendStatus:
      (candidate.trendStatus as AdaptedCandidate["trendStatus"]) || "unknown",
    relevanceHint: 70,
    contentPillar: classification.primaryPillar || primaryPillar,
    relevanceLabel: `Matches ${primaryPillar}`,
    relevanceReason:
      pillarReason || `Selected from shared ${niche} / ${primaryPillar} pool`,
    hook: deriveHook(candidate.caption),
    format: null,
    hashtagKey: (candidate.hashtags ?? [])[0] || null,
    rawProviderPayload: {},
  };
}

function decimalToNumber(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toViralPost(
  candidate: ViralPostCandidate,
  adapted: AdaptedCandidate,
  saved: boolean
): ViralPost {
  const status =
    (candidate.thumbnailMediaStatus as ViralMediaStatus) || "pending";
  const media =
    status === "mirrored" && candidate.thumbnailUrl
      ? { thumbnailUrl: candidate.thumbnailUrl, mediaStatus: "mirrored" as const }
      : resolveThumbnailFallback({
          mirroredUrl: null,
          sourceThumbnailUrl:
            candidate.sourceThumbnailUrl ?? candidate.thumbnailUrl,
        });
  const platform = (candidate.platform as ViralPostPlatform) || "instagram";
  const ageHours =
    candidate.publishedAt != null
      ? (Date.now() - candidate.publishedAt.getTime()) / (60 * 60 * 1000)
      : null;

  return {
    id: String(candidate.id),
    sourceId: candidate.sourceId,
    platform,
    creatorId: candidate.creatorId,
    creatorName: candidate.creatorName,
    creatorHandle: candidate.creatorHandle,
    creatorAvatarUrl: candidate.creatorAvatarUrl,
    creatorFollowers: candidate.creatorFollowers,
    sourceUrl: candidate.sourceUrl,
    thumbnailUrl: media.thumbnailUrl,
    videoUrl: platform === "youtube" ? null : candidate.videoUrl,
    reelId:
      platform !== "youtube" &&
      candidate.mirroredReelId != null &&
      candidate.mirroredReelId > 0
        ? candidate.mirroredReelId
        : null,
    mediaStatus: media.mediaStatus,
    caption: candidate.caption,
    transcript: candidate.transcript,
    hook: adapted.hook ?? deriveHook(candidate.caption),
    hashtags: candidate.hashtags ?? [],
    publishedAt: candidate.publishedAt?.toISOString() ?? null,
    ageHours: ageHours != null && ageHours >= 0 ? ageHours : null,
    views: candidate.views,
    likes: candidate.likes,
    comments: candidate.comments,
    shares: candidate.shares,
    saves: candidate.saves,
    reachMultiplier: decimalToNumber(candidate.reachMultiplier),
    engagementRate: decimalToNumber(candidate.engagementRate),
    viewsPerHour: decimalToNumber(candidate.viewsPerHour),
    trendStatus:
      (candidate.trendStatus as ViralPost["trendStatus"]) || "unknown",
    contentPillar: adapted.contentPillar,
    relevanceLabel: adapted.relevanceLabel,
    relevanceReason: adapted.relevanceReason,
    hookMechanism: null,
    format: adapted.format,
    adaptabilityReason: null,
    saved,
    dismissed: false,
    remade: false,
    shownAt: null,
  };
}

/**
 * Browse-first Explore: reads the user's existing shared niche pools only.
 * It never waits on live discovery. If a pool is thin, a refresh is scheduled
 * in the background while the best available indexed posts are returned now.
 */
export async function browseViralPosts(userId: number): Promise<{
  items: ViralPost[];
  niche: string;
  poolRefreshStarted: boolean;
}> {
  if (!isViralPostsLive) {
    return { items: [], niche: "", poolRefreshStarted: false };
  }

  const businessDescription = await loadUserBusinessDescription(userId);
  const niche = inferNiche(businessDescription);
  const pillars = inferActivePillars(businessDescription, niche);
  const pools = await ensureBrowsePools({ niche, pillars });
  return assembleBrowse({ userId, pools, niche, allowRefresh: true, limit: EXPLORE_BROWSE_LIMIT });
}

export type IndexedHomeCreator = {
  id: number;
  handle: string;
  displayName: string | null;
  profilePicUrl: string | null;
  followerCount: number;
  platform: "instagram" | "tiktok" | "youtube";
  badge: FollowerViralBadge;
  bestPost: ViralPost;
};

/**
 * Home v2 videos and creators. Both come from pools that already exist.
 * Confirmed pillar titles are used only when one of those pools is present.
 * Goal and audience affect video rank through the existing topic boost and
 * do not change the niche string. They can select the six indexed content
 * pillars when the strategy matches. Creators are grouped from the full
 * qualified set, not from the short video row. Never inserts a pool, never
 * schedules a refresh, and never calls a provider or a model.
 */
export async function browseIndexedViralPosts(args: {
  userId: number;
  /** Confirmed niche label. Null uses the legacy profile text, not goal or audience. */
  description: string | null;
  /** Confirmed pillar titles. Used only when a pool for that pillar already exists. */
  pillars?: string[];
  /** Ranking boost only. Must not be concatenated into the niche text. */
  goalText?: string | null;
  audienceText?: string | null;
  limit: number;
  /** Home row size. Supplied by the gated Home router. */
  creatorLimit: number;
  /** Home creator window in days. Supplied by the gated Home router. */
  recentDays: number;
}): Promise<{
  items: ViralPost[];
  creators: IndexedHomeCreator[];
  niche: string;
  poolRefreshStarted: false;
}> {
  if (!isViralPostsLive) return { items: [], creators: [], niche: "", poolRefreshStarted: false };
  const explicit = args.description?.trim() ?? "";
  const text = explicit.length > 0 ? explicit : await loadUserBusinessDescription(args.userId);
  const plan = indexedHomePoolSpecChoices({
    nicheText: text,
    confirmedPillars: args.pillars ?? [],
    goalText: args.goalText,
    audienceText: args.audienceText,
  });
  const existing = await poolRepo.findExistingPools([
    ...plan.confirmedSpecs,
    ...plan.fallbackSpecs,
  ]);
  const choice = chooseIndexedHomeSpecs({
    confirmedSpecs: plan.confirmedSpecs,
    fallbackSpecs: plan.fallbackSpecs,
    existingKeys: new Set(existing.map(pool => pool.poolKey)),
  });
  const pools = choice.specs.flatMap(spec => {
    const key = buildPoolKey({
      platform: spec.platform,
      niche: spec.niche,
      pillar: spec.pillar,
    });
    const pool = existing.find(row => row.poolKey === key);
    return pool ? [pool] : [];
  });
  const assembled =
    pools.length === 0
      ? { items: [], creators: [] }
      : await assembleIndexedHome({
          userId: args.userId,
          pools,
          niche: plan.niche,
          goalText: args.goalText ?? null,
          audienceText: args.audienceText ?? null,
          limit: args.limit,
          creatorLimit: args.creatorLimit,
          recentDays: args.recentDays,
        });
  if (assembled.items.length > 0 || assembled.creators.length > 0) {
    return { ...assembled, niche: plan.niche, poolRefreshStarted: false };
  }
  const relevantPillars = strategyUsesIndexedContentPillars({
    nicheText: text,
    confirmedPillars: args.pillars ?? [],
    goalText: args.goalText,
    audienceText: args.audienceText,
  })
    ? [...DEFAULT_CONTENT_PILLARS]
    : [];
  if (relevantPillars.length === 0) {
    return { ...assembled, niche: plan.niche, poolRefreshStarted: false };
  }
  const platforms = [
    isViralPostsInstagramEnabled ? "instagram" : "",
    isViralPostsTiktokEnabled ? "tiktok" : "",
    isViralPostsYoutubeEnabled ? "youtube" : "",
  ].filter(platform => platform.length > 0);
  const nichePools = await poolRepo.listPoolsForNiche(plan.niche, platforms);
  const next = indexedHomePoolsWhenSelectionIsEmpty({
    chosen: pools,
    nichePools,
    relevantPillars,
    eligibleVideos: 0,
    qualifyingCreators: 0,
  });
  const chosenKeys = new Set(pools.map(pool => pool.poolKey));
  const sameSelection =
    next.length === pools.length && next.every(pool => chosenKeys.has(pool.poolKey));
  if (sameSelection || next.length === 0) {
    return { ...assembled, niche: plan.niche, poolRefreshStarted: false };
  }
  const widened = await assembleIndexedHome({
    userId: args.userId,
    pools: next,
    niche: plan.niche,
    goalText: args.goalText ?? null,
    audienceText: args.audienceText ?? null,
    limit: args.limit,
    creatorLimit: args.creatorLimit,
    recentDays: args.recentDays,
  });
  return { ...widened, niche: plan.niche, poolRefreshStarted: false };
}

type IndexedPoolRow = {
  candidate: ViralPostCandidate;
  primaryPillar: string;
  pillarConfidence: number;
  pillarReason: string | null;
};

async function assembleIndexedHome(args: {
  userId: number;
  pools: Awaited<ReturnType<typeof poolRepo.findExistingPools>>;
  niche: string;
  goalText: string | null;
  audienceText: string | null;
  limit: number;
  creatorLimit: number;
  recentDays: number;
}): Promise<{ items: ViralPost[]; creators: IndexedHomeCreator[] }> {
  const { userId, pools, niche } = args;
  const [poolRows, hidden, dismissed, saved] = await Promise.all([
    poolRepo.loadPoolCandidatesForAssembly({
      poolIds: pools.map(p => p.id),
      limit: EXPLORE_POOL_LOAD_LIMIT,
    }),
    repo.getHiddenCreatorKeys(userId),
    repo.getRecentlyDismissedCandidateIds(userId),
    repo.getSavedCandidateIds(userId),
  ]);

  const visible = poolRows.filter(row => {
    if (!isViralPostsV1Platform(row.candidate.platform)) return false;
    if (dismissed.has(row.candidate.id)) return false;
    const creatorKey = (row.candidate.creatorId || row.candidate.creatorHandle || "")
      .toLowerCase()
      .replace(/^@/, "");
    return !creatorKey || !hidden.has(creatorKey);
  });

  const ranked = rankIndexedHomeInventory({
    posts: visible.map(row => ({
      id: row.candidate.id,
      platform: row.candidate.platform,
      sourceId: row.candidate.sourceId,
      creatorId: row.candidate.creatorId,
      creatorHandle: row.candidate.creatorHandle,
      creatorName: row.candidate.creatorName,
      creatorAvatarUrl: row.candidate.creatorAvatarUrl,
      caption: row.candidate.caption,
      hashtags: row.candidate.hashtags ?? [],
      views: row.candidate.views,
      likes: row.candidate.likes,
      comments: row.candidate.comments,
      shares: row.candidate.shares,
      saves: row.candidate.saves,
      creatorFollowers: row.candidate.creatorFollowers,
      publishedAt: row.candidate.publishedAt,
      primaryPillar: row.primaryPillar,
      pillarConfidence: row.pillarConfidence,
      row,
    })),
    goalText: args.goalText,
    audienceText: args.audienceText,
    limit: args.limit,
    creatorLimit: args.creatorLimit,
    recentDays: args.recentDays,
  });

  const toPost = (row: IndexedPoolRow) => {
    const adapted = candidateToAdapted(
      row.candidate,
      row.primaryPillar,
      niche,
      row.pillarReason
    );
    return toViralPost(row.candidate, adapted, saved.has(row.candidate.id));
  };

  return {
    items: ranked.display.map(({ row }) => toPost(row)),
    creators: ranked.creators.map(pick => indexedCreatorFromPick(pick, toPost)),
  };
}

function indexedCreatorFromPick(
  pick: IndexedHomeCreatorPick<IndexedHomePost & { row: IndexedPoolRow }>,
  toPost: (row: IndexedPoolRow) => ViralPost
): IndexedHomeCreator {
  const candidate = pick.post.row.candidate;
  const platform =
    candidate.platform === "tiktok" || candidate.platform === "youtube"
      ? candidate.platform
      : "instagram";
  const handle = (candidate.creatorHandle || candidate.creatorId || "")
    .trim()
    .replace(/^@/, "");
  const name = candidate.creatorName.trim();
  return {
    id: candidate.id,
    handle,
    displayName: name || null,
    profilePicUrl: candidate.creatorAvatarUrl || null,
    followerCount: candidate.creatorFollowers ?? 0,
    platform,
    badge: pick.badge,
    bestPost: toPost(pick.post.row),
  };
}

async function assembleBrowse(args: {
  userId: number;
  pools: Awaited<ReturnType<typeof poolRepo.ensurePools>>;
  niche: string;
  allowRefresh: boolean;
  limit: number;
}): Promise<{ items: ViralPost[]; niche: string; poolRefreshStarted: boolean }> {
  const { userId, pools, niche } = args;
  const [poolRows, hidden, dismissed, saved] = await Promise.all([
    poolRepo.loadPoolCandidatesForAssembly({
      poolIds: pools.map((p) => p.id),
      limit: EXPLORE_POOL_LOAD_LIMIT,
    }),
    repo.getHiddenCreatorKeys(userId),
    repo.getRecentlyDismissedCandidateIds(userId),
    repo.getSavedCandidateIds(userId),
  ]);

  let poolRefreshStarted = false;
  if (args.allowRefresh && poolRows.length < EXPLORE_BROWSE_LIMIT) {
    for (const pool of pools.slice(0, 3)) {
      schedulePoolRefresh(pool.id, false);
      poolRefreshStarted = true;
    }
  }

  const rows = poolRows
    .map((row) => ({
      row,
      adapted: candidateToAdapted(
        row.candidate,
        row.primaryPillar,
        niche,
        row.pillarReason
      ),
    }))
    .filter(({ row }) => {
      if (!isViralPostsV1Platform(row.candidate.platform)) return false;
      if (dismissed.has(row.candidate.id)) return false;
      const creatorKey = (
        row.candidate.creatorId ||
        row.candidate.creatorHandle ||
        ""
      )
        .toLowerCase()
        .replace(/^@/, "");
      return !creatorKey || !hidden.has(creatorKey);
    });

  const scoreInputs = rows.map(({ adapted }) => ({
    views: adapted.views,
    likes: adapted.likes,
    comments: adapted.comments,
    shares: adapted.shares,
    saves: adapted.saves,
    creatorFollowers: adapted.creatorFollowers,
    publishedAt: adapted.publishedAt,
    relevanceScore: adapted.relevanceHint,
    adaptabilityScore: adaptabilityScoreForCandidate(adapted),
  }));

  const ranked = rows
    .map((entry, index) => ({
      ...entry,
      score: scoreCandidate(scoreInputs[index]!, scoreInputs).finalScore,
    }))
    .sort((a, b) => b.score - a.score);

  // Explore should feel broad, not like 10 cards from one creator.
  const creatorCounts = new Map<string, number>();
  const selected: typeof ranked = [];
  for (const entry of ranked) {
    if (selected.length >= args.limit) break;
    const creatorKey = (
      entry.row.candidate.creatorId ||
      entry.row.candidate.creatorHandle ||
      `candidate:${entry.row.candidate.id}`
    )
      .toLowerCase()
      .replace(/^@/, "");
    const count = creatorCounts.get(creatorKey) ?? 0;
    if (count >= 2) continue;
    creatorCounts.set(creatorKey, count + 1);
    selected.push(entry);
  }

  return {
    items: selected.map(({ row, adapted }) =>
      toViralPost(row.candidate, adapted, saved.has(row.candidate.id))
    ),
    niche,
    poolRefreshStarted,
  };
}
