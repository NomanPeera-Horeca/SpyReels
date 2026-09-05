import type { ViralTrendStatus } from "@shared/viralPosts";

export type MetricAvailability = {
  hasFollowers: boolean;
  hasViews: boolean;
  hasLikes: boolean;
  hasComments: boolean;
  hasShares: boolean;
  hasSaves: boolean;
  hasPublishedAt: boolean;
};

export type ScoredCandidateInput = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  creatorFollowers: number | null;
  publishedAt: Date | null;
  relevanceScore: number;
  adaptabilityScore: number;
};

export type ScoreWeights = {
  velocity: number;
  reach: number;
  engagement: number;
  freshness: number;
  relevance: number;
  adaptability: number;
};

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  velocity: 0.3,
  reach: 0.2,
  engagement: 0.15,
  freshness: 0.15,
  relevance: 0.15,
  adaptability: 0.05,
};

export const TODAY_PICKS_SCORE_WEIGHTS: ScoreWeights = {
  velocity: 0.18,
  reach: 0.12,
  engagement: 0.12,
  freshness: 0.1,
  relevance: 0.28,
  adaptability: 0.2,
};

export type ScoredMetrics = {
  reachMultiplier: number | null;
  engagementRate: number | null;
  viewsPerHour: number | null;
  ageHours: number | null;
  freshnessScore: number;
  finalScore: number;
  trendStatus: ViralTrendStatus;
  availability: MetricAvailability;
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function normalizeInPool(value: number | null, pool: Array<number | null>): number {
  const nums = pool.filter((v): v is number => v != null && Number.isFinite(v));
  if (value == null || !Number.isFinite(value) || nums.length === 0) return 0;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max <= min) return nums.length === 1 ? 1 : 0.5;
  return clamp01((value - min) / (max - min));
}

export function ageHoursFromPublished(
  publishedAt: Date | null,
  now = new Date()
): number | null {
  if (!publishedAt || Number.isNaN(publishedAt.getTime())) return null;
  const hours = (now.getTime() - publishedAt.getTime()) / (60 * 60 * 1000);
  if (!Number.isFinite(hours) || hours < 0) return null;
  return hours;
}

export function computeReachMultiplier(
  views: number | null,
  followers: number | null
): number | null {
  if (views == null || !Number.isFinite(views) || views < 0) return null;
  if (followers == null || !Number.isFinite(followers) || followers <= 0) {
    return null;
  }
  return views / followers;
}

export function computeEngagementRate(input: {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
}): number | null {
  const { views, likes, comments, shares, saves } = input;
  if (views == null || !Number.isFinite(views) || views <= 0) return null;
  let eng = 0;
  let hasAny = false;
  if (likes != null && Number.isFinite(likes)) {
    eng += likes;
    hasAny = true;
  }
  if (comments != null && Number.isFinite(comments)) {
    eng += comments;
    hasAny = true;
  }
  if (shares != null && Number.isFinite(shares)) {
    eng += 2 * shares;
    hasAny = true;
  }
  if (saves != null && Number.isFinite(saves)) {
    eng += 2 * saves;
    hasAny = true;
  }
  if (!hasAny) return null;
  return eng / views;
}

export function computeViewsPerHour(
  views: number | null,
  ageHours: number | null
): number | null {
  if (views == null || !Number.isFinite(views) || views < 0) return null;
  if (ageHours == null || !Number.isFinite(ageHours)) return null;
  return views / Math.max(ageHours, 1);
}

export function freshnessScoreFromAge(ageHours: number | null): number {
  if (ageHours == null) return 0.35;
  if (ageHours <= 12) return 1;
  if (ageHours <= 24) return 0.85;
  if (ageHours <= 72) return 0.65;
  if (ageHours <= 168) return 0.45;
  if (ageHours <= 720) return 0.25;
  return 0.1;
}

export function classifyTrendStatus(input: {
  reachMultiplier: number | null;
  viewsPerHour: number | null;
  ageHours: number | null;
  views: number | null;
}): ViralTrendStatus {
  const { reachMultiplier, viewsPerHour, ageHours, views } = input;
  const hasCore =
    views != null &&
    Number.isFinite(views) &&
    ageHours != null &&
    Number.isFinite(ageHours) &&
    viewsPerHour != null &&
    Number.isFinite(viewsPerHour);
  if (!hasCore) return "unknown";
  if (ageHours! >= 72 && views! >= 500_000 && viewsPerHour! < 2_000) return "saturated";
  if (
    ageHours! <= 24 &&
    ((viewsPerHour! >= 8_000 && views! >= 20_000) ||
      (reachMultiplier != null && reachMultiplier >= 15 && views! >= 10_000))
  ) return "breaking-out";
  if (ageHours! <= 48 && viewsPerHour! >= 3_000 && views! >= 8_000) return "rising-fast";
  if (
    ageHours! >= 48 &&
    views! >= 80_000 &&
    (reachMultiplier == null || reachMultiplier >= 3)
  ) return "proven-format";
  if (reachMultiplier != null && reachMultiplier >= 5 && views! >= 5_000) return "rising-fast";
  return "unknown";
}

export function scoreCandidate(
  input: ScoredCandidateInput,
  pool: ScoredCandidateInput[],
  now = new Date(),
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS
): ScoredMetrics {
  const ageHours = ageHoursFromPublished(input.publishedAt, now);
  const reachMultiplier = computeReachMultiplier(input.views, input.creatorFollowers);
  const engagementRate = computeEngagementRate(input);
  const viewsPerHour = computeViewsPerHour(input.views, ageHours);
  const freshnessScore = freshnessScoreFromAge(ageHours);
  const poolReach = pool.map((p) => computeReachMultiplier(p.views, p.creatorFollowers));
  const poolEng = pool.map((p) => computeEngagementRate(p));
  const poolVel = pool.map((p) => computeViewsPerHour(p.views, ageHoursFromPublished(p.publishedAt, now)));
  const nVel = normalizeInPool(viewsPerHour, poolVel);
  const nReach = normalizeInPool(reachMultiplier, poolReach);
  const nEng = normalizeInPool(engagementRate, poolEng);
  const nFresh = clamp01(freshnessScore);
  const nRel = clamp01(input.relevanceScore / 100);
  const nAdapt = clamp01(input.adaptabilityScore / 100);
  const hasFollowers = input.creatorFollowers != null && input.creatorFollowers > 0;
  const missingReachWeight = hasFollowers ? 0 : weights.reach;
  const wReach = hasFollowers ? weights.reach : 0;
  const wRel = weights.relevance + missingReachWeight * 0.5;
  const wAdapt = weights.adaptability + missingReachWeight * 0.5;
  const finalScore =
    weights.velocity * nVel +
    wReach * nReach +
    weights.engagement * nEng +
    weights.freshness * nFresh +
    wRel * nRel +
    wAdapt * nAdapt;

  return {
    reachMultiplier,
    engagementRate,
    viewsPerHour,
    ageHours,
    freshnessScore,
    finalScore,
    trendStatus: classifyTrendStatus({ reachMultiplier, viewsPerHour, ageHours, views: input.views }),
    availability: {
      hasFollowers,
      hasViews: input.views != null,
      hasLikes: input.likes != null,
      hasComments: input.comments != null,
      hasShares: input.shares != null,
      hasSaves: input.saves != null,
      hasPublishedAt: input.publishedAt != null,
    },
  };
}
