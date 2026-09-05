import { and, asc, desc, eq, gte, or } from "drizzle-orm";
import { featuredAccounts, featuredReels } from "../../drizzle/schema";
import { getDb } from "../db";
import { deriveHook, inferFormatFromCopy, type AdaptedCandidate } from "./candidateAdapter";
import { classifyCandidatePillars } from "./pillarClassify";
import {
  ageHoursFromPublished,
  classifyTrendStatus,
  computeEngagementRate,
  computeReachMultiplier,
  computeViewsPerHour,
} from "./scoring";
import { VIRAL_POOL_DEFAULTS } from "./constants";

export type FeaturedSupplyRow = {
  featuredReelId: number;
  reelShortcode: string;
  caption: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  postedAt: Date;
  rank: number | null;
  transcript: string | null;
  remakeabilityScore: number | null;
  suggestedAction: string | null;
  classificationReason: string | null;
  viralFlag: boolean;
  productionFormat: string | null;
  contentType: string | null;
  hookPattern: string | null;
  handle: string;
  displayName: string | null;
  followerCount: number;
  profilePicUrl: string | null;
};

const FEASIBLE_PRODUCTION_FORMATS = new Set([
  "talking_head",
  "b_roll_voiceover",
  "text_on_screen",
  "screen_recording",
  "montage",
]);

function finitePositive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

function isProductionFeasible(row: FeaturedSupplyRow): boolean {
  if (!row.productionFormat) {
    return (row.remakeabilityScore ?? 0) >= 75 || row.suggestedAction === "make_version";
  }
  return FEASIBLE_PRODUCTION_FORMATS.has(row.productionFormat);
}

function isProvenEnough(row: FeaturedSupplyRow): boolean {
  if (row.viralFlag) return true;
  const followers = finitePositive(row.followerCount);
  const views = finitePositive(row.viewCount);
  const reach = computeReachMultiplier(views, followers);
  return (reach != null && reach >= 2) || (views ?? 0) >= 100_000;
}

/**
 * Pure selector used by tests and the DB-backed loader below. It deliberately
 * mixes pillar-related rows with a smaller set of universal, high-remakeability
 * formats so Viral Posts can widen beyond exact-niche content without letting
 * spectacle-heavy or weak catalog rows flood the pool.
 */
export function selectFeaturedTransferableRows(args: {
  rows: FeaturedSupplyRow[];
  pillar: string;
  limit: number;
}): FeaturedSupplyRow[] {
  const related: FeaturedSupplyRow[] = [];
  const universal: FeaturedSupplyRow[] = [];

  for (const row of args.rows) {
    if (!row.reelShortcode?.trim()) continue;
    if (!isProductionFeasible(row) || !isProvenEnough(row)) continue;

    const hook = deriveHook(row.caption || "");
    const classification = classifyCandidatePillars({
      caption: row.caption,
      hook,
      activePillars: [args.pillar],
      fallbackNiche: args.pillar,
    });
    const remakeability = row.remakeabilityScore ?? 0;
    const isRelated = classification.confidence >= 0.45;
    const isUniversal =
      !isRelated &&
      (remakeability >= 75 || row.suggestedAction === "make_version");

    if (isRelated && (remakeability >= 60 || row.suggestedAction === "make_version")) {
      related.push(row);
    } else if (isUniversal) {
      universal.push(row);
    }
  }

  const relatedTarget = Math.ceil(args.limit * 0.67);
  const universalTarget = Math.max(0, args.limit - relatedTarget);
  const selected: FeaturedSupplyRow[] = [];
  const creatorCounts = new Map<string, number>();
  const add = (row: FeaturedSupplyRow) => {
    if (selected.length >= args.limit) return false;
    const key = row.handle.toLowerCase().replace(/^@/, "");
    const count = creatorCounts.get(key) ?? 0;
    if (count >= 2) return false;
    creatorCounts.set(key, count + 1);
    selected.push(row);
    return true;
  };

  for (const row of related) {
    if (selected.length >= relatedTarget) break;
    add(row);
  }
  let universalAdded = 0;
  for (const row of universal) {
    if (universalAdded >= universalTarget || selected.length >= args.limit) break;
    if (add(row)) universalAdded += 1;
  }
  for (const row of [...related.slice(relatedTarget), ...universal.slice(universalTarget)]) {
    if (selected.length >= args.limit) break;
    add(row);
  }

  return selected;
}

function adaptFeaturedRow(args: {
  row: FeaturedSupplyRow;
  pillar: string;
  niche: string;
  now: Date;
}): AdaptedCandidate {
  const { row, pillar, niche, now } = args;
  const caption = row.caption || "";
  const hook = deriveHook(caption);
  const format = inferFormatFromCopy({ caption, hook });
  const publishedAt = row.postedAt;
  const followers = finitePositive(row.followerCount);
  const views = finitePositive(row.viewCount);
  const likes = row.likeCount >= 0 ? row.likeCount : null;
  const comments = row.commentCount >= 0 ? row.commentCount : null;
  const ageHours = ageHoursFromPublished(publishedAt, now);
  const reachMultiplier = computeReachMultiplier(views, followers);
  const engagementRate = computeEngagementRate({
    views,
    likes,
    comments,
    shares: null,
    saves: null,
  });
  const viewsPerHour = computeViewsPerHour(views, ageHours);
  const trendStatus = classifyTrendStatus({
    reachMultiplier,
    viewsPerHour,
    ageHours,
    views,
  });
  const classification = classifyCandidatePillars({
    caption,
    hook,
    activePillars: [pillar],
    fallbackNiche: pillar,
  });
  const related = classification.confidence >= 0.45;
  const handle = row.handle.replace(/^@/, "").trim();

  return {
    platform: "instagram",
    sourceId: row.reelShortcode,
    sourceUrl: `https://www.instagram.com/reel/${row.reelShortcode}/`,
    creatorId: handle || null,
    creatorName: row.displayName?.trim() || handle || "Instagram creator",
    creatorHandle: handle ? `@${handle}` : null,
    creatorAvatarUrl: row.profilePicUrl,
    creatorFollowers: followers,
    thumbnailUrl: row.thumbnailUrl,
    videoUrl: row.videoUrl,
    caption: caption || null,
    transcript: row.transcript,
    hashtags: [],
    publishedAt,
    views,
    likes,
    comments,
    shares: null,
    saves: null,
    reachMultiplier,
    engagementRate,
    viewsPerHour,
    trendStatus,
    relevanceHint: related ? 72 : 48,
    contentPillar: pillar,
    relevanceLabel: related ? `Related to ${pillar}` : `Transferable format for ${pillar}`,
    relevanceReason: related
      ? `Featured catalog match: ${classification.reason}`
      : `High-remakeability proven format from an adjacent creator, selected for adaptation to ${niche}.`,
    hook,
    format,
    hashtagKey: null,
    rawProviderPayload: {
      source: "featured_catalog",
      featuredReelId: row.featuredReelId,
      remakeabilityScore: row.remakeabilityScore,
      suggestedAction: row.suggestedAction,
      productionFormat: row.productionFormat,
      contentType: row.contentType,
      hookPattern: row.hookPattern,
      classificationConfidence: classification.confidence,
    },
  };
}

/**
 * Reuse the existing global Featured catalog as zero-provider-call supply for
 * one Viral Posts Instagram pillar. The catalog stays the source of truth;
 * returned rows are adapted into the existing canonical Viral candidate store.
 */
export async function loadFeaturedTransferableCandidates(args: {
  pillar: string;
  niche: string;
  limit?: number;
  now?: Date;
}): Promise<AdaptedCandidate[]> {
  const db = await getDb();
  if (!db) return [];
  const now = args.now ?? new Date();
  const limit = Math.max(1, Math.min(args.limit ?? 12, 30));
  const cutoff = new Date(
    now.getTime() - VIRAL_POOL_DEFAULTS.assemblyCandidateMaxAgeHours * 60 * 60 * 1000
  );

  const rows: FeaturedSupplyRow[] = await db
    .select({
      featuredReelId: featuredReels.id,
      reelShortcode: featuredReels.reelShortcode,
      caption: featuredReels.caption,
      viewCount: featuredReels.viewCount,
      likeCount: featuredReels.likeCount,
      commentCount: featuredReels.commentCount,
      thumbnailUrl: featuredReels.thumbnailUrl,
      videoUrl: featuredReels.videoUrl,
      postedAt: featuredReels.postedAt,
      rank: featuredReels.rank,
      transcript: featuredReels.transcript,
      remakeabilityScore: featuredReels.remakeabilityScore,
      suggestedAction: featuredReels.suggestedAction,
      classificationReason: featuredReels.classificationReason,
      viralFlag: featuredReels.viralFlag,
      productionFormat: featuredReels.productionFormat,
      contentType: featuredReels.contentType,
      hookPattern: featuredReels.hookPattern,
      handle: featuredAccounts.handle,
      displayName: featuredAccounts.displayName,
      followerCount: featuredAccounts.followerCount,
      profilePicUrl: featuredAccounts.profilePicUrl,
    })
    .from(featuredReels)
    .innerJoin(featuredAccounts, eq(featuredReels.featuredAccountId, featuredAccounts.id))
    .where(
      and(
        eq(featuredAccounts.isActive, true),
        gte(featuredReels.postedAt, cutoff),
        or(
          eq(featuredReels.viralFlag, true),
          eq(featuredReels.suggestedAction, "make_version"),
          gte(featuredReels.remakeabilityScore, 60)
        )
      )
    )
    .orderBy(
      desc(featuredReels.viralFlag),
      desc(featuredReels.remakeabilityScore),
      asc(featuredReels.rank),
      desc(featuredReels.viewCount)
    )
    .limit(Math.max(limit * 6, 60));

  return selectFeaturedTransferableRows({ rows, pillar: args.pillar, limit }).map((row) =>
    adaptFeaturedRow({ row, pillar: args.pillar, niche: args.niche, now })
  );
}
