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
} from "./featureFlag";
import { resolveThumbnailFallback } from "./mediaMirror";
import { classifyCandidatePillars } from "./pillarClassify";
import * as poolRepo from "./poolRepository";
import { schedulePoolRefresh } from "./poolRefresh";
import * as repo from "./repository";
import { selectIndexedHomePosts } from "./indexedHomeSelection";
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

function browsePoolSpecs(args: {
  niche: string;
  pillars: string[];
  includeSeedMix?: boolean;
}) {
  const specs: Array<{
    niche: string;
    pillar: string;
    platform?: string;
  }> = [];

  if (isViralPostsInstagramEnabled) {
    for (const pillar of args.pillars.slice(0, 6)) {
      specs.push({ niche: args.niche, pillar, platform: "instagram" });
    }
  }
  if (isViralPostsTiktokEnabled) {
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
  // Viral Posts V1: no YouTube pool ensure (historical rows may remain).

  return specs;
}

/**
 * Confirmed pillar titles are looked up under the existing Viral Posts niche
 * string. Goal text is not an input. When none of those pools exist, the
 * caller uses the inferred pillar specs, including the TikTok seed-mix pool.
 */
export function indexedHomePoolSpecChoices(args: {
  nicheText: string;
  confirmedPillars: string[];
}): {
  niche: string;
  confirmedSpecs: Array<{ niche: string; pillar: string; platform?: string }>;
  fallbackSpecs: Array<{ niche: string; pillar: string; platform?: string }>;
} {
  const niche = inferNiche(args.nicheText);
  const confirmed = [
    ...new Set(args.confirmedPillars.map(pillar => pillar.trim()).filter(Boolean)),
  ].slice(0, 6);
  return {
    niche,
    confirmedSpecs:
      confirmed.length > 0
        ? browsePoolSpecs({ niche, pillars: confirmed, includeSeedMix: false })
        : [],
    fallbackSpecs: browsePoolSpecs({
      niche,
      pillars: inferActivePillars(args.nicheText, niche),
      includeSeedMix: true,
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

/**
 * Home v2 "Videos for you". Reads pools that already exist. Confirmed pillar
 * titles are used only when one of those pools is present. Goal and audience
 * affect rank through the existing topic boost and are not part of the niche
 * text. Never inserts a pool and never schedules a refresh.
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
}): Promise<{ items: ViralPost[]; niche: string; poolRefreshStarted: false }> {
  if (!isViralPostsLive) return { items: [], niche: "", poolRefreshStarted: false };
  const explicit = args.description?.trim() ?? "";
  const text = explicit.length > 0 ? explicit : await loadUserBusinessDescription(args.userId);
  const plan = indexedHomePoolSpecChoices({
    nicheText: text,
    confirmedPillars: args.pillars ?? [],
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
  if (pools.length === 0) return { items: [], niche: plan.niche, poolRefreshStarted: false };
  const items = await assembleIndexedHome({
    userId: args.userId,
    pools,
    niche: plan.niche,
    goalText: args.goalText ?? null,
    audienceText: args.audienceText ?? null,
    limit: args.limit,
  });
  return { items, niche: plan.niche, poolRefreshStarted: false };
}

async function assembleIndexedHome(args: {
  userId: number;
  pools: Awaited<ReturnType<typeof poolRepo.findExistingPools>>;
  niche: string;
  goalText: string | null;
  audienceText: string | null;
  limit: number;
}): Promise<ViralPost[]> {
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

  const selected = selectIndexedHomePosts({
    posts: visible.map(row => ({
      id: row.candidate.id,
      platform: row.candidate.platform,
      sourceId: row.candidate.sourceId,
      creatorId: row.candidate.creatorId,
      creatorHandle: row.candidate.creatorHandle,
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
  });

  return selected.map(({ row }) => {
    const adapted = candidateToAdapted(
      row.candidate,
      row.primaryPillar,
      niche,
      row.pillarReason
    );
    return toViralPost(row.candidate, adapted, saved.has(row.candidate.id));
  });
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
