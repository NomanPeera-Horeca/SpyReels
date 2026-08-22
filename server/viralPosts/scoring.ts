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

/**
 * Engagement with optional share/save weighting.
 * When shares/saves are unavailable, they are omitted (not treated as zero).
 */
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
  const denom = Math.max(ageHours, 1);
  return views / denom;
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

/**
 * Transparent trend labels. Prefer unknown when data is insufficient.
 */
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

  // Saturated: older, still huge absolute views, slower velocity
  if (ageHours! >= 72 && views! >= 500_000 && viewsPerHour! < 2_000) {
    return "saturated";
  }

  // Breaking out: young + strong velocity and/or extreme reach
  if (
    ageHours! <= 24 &&
    ((viewsPerHour! >= 8_000 && views! >= 20_000) ||
      (reachMultiplier != null && reachMultiplier >= 15 && views! >= 10_000))
  ) {
    return "breaking-out";
  }

  // Rising fast: recent + solid velocity
  if (ageHours! <= 48 && viewsPerHour! >= 3_000 && views! >= 8_000) {
    return "rising-fast";
  }

  // Proven: older but still performing with healthy reach
  if (
    ageHours! >= 48 &&
    views! >= 80_000 &&
    (reachMultiplier == null || reachMultiplier >= 3)
  ) {
    return "proven-format";
  }

  if (reachMultiplier != null && reachMultiplier >= 5 && views! >= 5_000) {
    return "rising-fast";
  }

  return "unknown";
}

export function scoreCandidate(
  input: ScoredCandidateInput,
  pool: ScoredCandidateInput[],
  now = new Date()
): ScoredMetrics {
  const ageHours = ageHoursFromPublished(input.publishedAt, now);
  const reachMultiplier = computeReachMultiplier(
    input.views,
    input.creatorFollowers
  );
  const engagementRate = computeEngagementRate(input);
  const viewsPerHour = computeViewsPerHour(input.views, ageHours);
  const freshnessScore = freshnessScoreFromAge(ageHours);

  const poolReach = pool.map((p) =>
    computeReachMultiplier(p.views, p.creatorFollowers)
  );
  const poolEng = pool.map((p) => computeEngagementRate(p));
  const poolVel = pool.map((p) =>
    computeViewsPerHour(p.views, ageHoursFromPublished(p.publishedAt, now))
  );

  const nVel = normalizeInPool(viewsPerHour, poolVel);
  const nReach = normalizeInPool(reachMultiplier, poolReach);
  const nEng = normalizeInPool(engagementRate, poolEng);
  const nFresh = clamp01(freshnessScore);
  const nRel = clamp01(input.relevanceScore / 100);
  const nAdapt = clamp01(input.adaptabilityScore / 100);

  const hasFollowers = input.creatorFollowers != null && input.creatorFollowers > 0;
  // Redistribute reach weight when followers unavailable
  const wVel = 0.3;
  const wReach = hasFollowers ? 0.2 : 0;
  const wEng = 0.15;
  const wFresh = 0.15;
  const wRel = 0.15 + (hasFollowers ? 0 : 0.1);
  const wAdapt = 0.05 + (hasFollowers ? 0 : 0.1);

  const finalScore =
    wVel * nVel +
    wReach * nReach +
    wEng * nEng +
    wFresh * nFresh +
    wRel * nRel +
    wAdapt * nAdapt;

  return {
    reachMultiplier,
    engagementRate,
    viewsPerHour,
    ageHours,
    freshnessScore,
    finalScore,
    trendStatus: classifyTrendStatus({
      reachMultiplier,
      viewsPerHour,
      ageHours,
      views: input.views,
    }),
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
