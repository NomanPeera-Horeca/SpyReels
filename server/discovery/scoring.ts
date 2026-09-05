export type ViralTier = "Trending" | "Healthy" | "Strong" | "Viral" | "Explosive";

export interface ParsedReel {
  shortcode: string;
  caption: string;
  views: number;
  likes: number;
  comments: number;
  videoUrl: string;
  thumbnailUrl: string;
  postedAt: Date | null;
  owner: {
    username: string;
    fullName: string;
    followers: number;
    isVerified: boolean;
    isPrivate: boolean;
    biography: string;
    profilePicUrl: string;
  };
}

export interface ScoredReel extends ParsedReel {
  viralScore: number;
  viralTier: ViralTier;
  reachMultiplier: number;
  engagementRate: number;
  reelUrl: string;
  tier: 1 | 2;
}

export const MIN_VIEWS = 5_000;
export const MIN_REACH_MULTIPLIER = 3;
export const MIN_VIRAL_SCORE = 1;
export const TIER2_MIN_VIEWS = 1_000;
export const TIER2_MIN_REACH_MULTIPLIER = 1.5;

export function viralTierForScore(score: number): ViralTier {
  if (score >= 500) return "Explosive";
  if (score >= 100) return "Viral";
  if (score >= 25) return "Strong";
  if (score >= 5) return "Healthy";
  return "Trending";
}

export type ViralMetricsInput = {
  views: number;
  likes: number;
  comments: number;
  followers: number;
  isPrivate?: boolean;
};

export type ViralMetricsScore = {
  viralScore: number;
  viralTier: ViralTier;
  reachMultiplier: number;
  engagementRate: number;
  tier: 1 | 2;
};

export function computeViralScoreFromMetrics(input: ViralMetricsInput): number {
  const reachMultiplier = input.views / input.followers;
  const engagementRate = (input.likes + input.comments) / input.views;
  return reachMultiplier * engagementRate * 100;
}

export function computeViralScore(reel: ParsedReel): number {
  return computeViralScoreFromMetrics({
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    followers: reel.owner.followers,
  });
}

export function passesPrivacyAndFollowersFromMetrics(input: ViralMetricsInput): boolean {
  return input.isPrivate !== true && input.followers > 0 && input.views > 0;
}

export function passesPrivacyAndFollowers(reel: ParsedReel): boolean {
  return passesPrivacyAndFollowersFromMetrics({
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    followers: reel.owner.followers,
    isPrivate: reel.owner.isPrivate,
  });
}

export function passesTier1ThresholdsFromMetrics(input: ViralMetricsInput): boolean {
  const reach = input.views / input.followers;
  return (
    reach >= MIN_REACH_MULTIPLIER &&
    input.views >= MIN_VIEWS &&
    computeViralScoreFromMetrics(input) >= MIN_VIRAL_SCORE
  );
}

export function passesTier1Thresholds(reel: ParsedReel): boolean {
  return passesTier1ThresholdsFromMetrics({
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    followers: reel.owner.followers,
  });
}

export function passesTier2ThresholdsFromMetrics(input: ViralMetricsInput): boolean {
  const reach = input.views / input.followers;
  return reach >= TIER2_MIN_REACH_MULTIPLIER && input.views >= TIER2_MIN_VIEWS;
}

export function passesTier2Thresholds(reel: ParsedReel): boolean {
  return passesTier2ThresholdsFromMetrics({
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    followers: reel.owner.followers,
  });
}

export function classifyTierFromMetrics(input: ViralMetricsInput): 1 | 2 | null {
  if (!passesPrivacyAndFollowersFromMetrics(input)) return null;
  if (passesTier1ThresholdsFromMetrics(input)) return 1;
  if (passesTier2ThresholdsFromMetrics(input)) return 2;
  return null;
}

export function classifyTier(reel: ParsedReel): 1 | 2 | null {
  return classifyTierFromMetrics({
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    followers: reel.owner.followers,
    isPrivate: reel.owner.isPrivate,
  });
}

export function scoreViralMetrics(input: ViralMetricsInput): ViralMetricsScore | null {
  const tier = classifyTierFromMetrics(input);
  if (tier === null) return null;
  const reachMultiplier = input.views / input.followers;
  const engagementRate = (input.likes + input.comments) / input.views;
  const viralScore = reachMultiplier * engagementRate * 100;
  return {
    tier,
    reachMultiplier,
    engagementRate,
    viralScore,
    viralTier: viralTierForScore(viralScore),
  };
}

export function scoreReel(reel: ParsedReel): ScoredReel | null {
  const scored = scoreViralMetrics({
    views: reel.views,
    likes: reel.likes,
    comments: reel.comments,
    followers: reel.owner.followers,
    isPrivate: reel.owner.isPrivate,
  });
  if (!scored) return null;

  return {
    ...reel,
    ...scored,
    reelUrl: `https://www.instagram.com/reel/${reel.shortcode}/`,
  };
}

/**
 * Hashtag-only searches often omit follower counts. Without this path,
 * every reel fails privacy/follower gating and Explore/pool refresh return empty.
 * Prefer strict scoreReel when followers are known.
 */
export function scoreReelRelaxed(reel: ParsedReel): ScoredReel | null {
  if (reel.owner.isPrivate) return null;
  if (reel.owner.followers > 0) {
    return scoreReel(reel);
  }
  if (!Number.isFinite(reel.views) || reel.views < TIER2_MIN_VIEWS) {
    return null;
  }
  const engagementRate =
    reel.views > 0 ? (reel.likes + reel.comments) / reel.views : 0;
  const viralScore = Math.max(
    1,
    (reel.views / 1_000) * Math.max(engagementRate, 0.01) * 10
  );
  return {
    ...reel,
    tier: reel.views >= MIN_VIEWS ? 1 : 2,
    reachMultiplier: 0,
    engagementRate,
    viralScore,
    viralTier: viralTierForScore(viralScore),
    reelUrl: `https://www.instagram.com/reel/${reel.shortcode}/`,
  };
}
