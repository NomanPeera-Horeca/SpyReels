import type {
  ViralMediaStatus,
  ViralPost,
  ViralPostPlatform,
} from "@shared/viralPosts";
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

async function ensureBrowsePools(args: { niche: string; pillars: string[] }) {
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
    specs.push({
      niche: args.niche,
      pillar: VIRAL_SEED_POOL_PILLAR,
      platform: "tiktok",
    });
  }
  if (isViralPostsYoutubeEnabled) {
    specs.push({
      niche: args.niche,
      pillar: VIRAL_SEED_POOL_PILLAR,
      platform: "youtube",
    });
  }

  return poolRepo.ensurePools(specs);
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
  if (poolRows.length < EXPLORE_BROWSE_LIMIT) {
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
    if (selected.length >= EXPLORE_BROWSE_LIMIT) break;
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
