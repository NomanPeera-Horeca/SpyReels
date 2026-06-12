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

export function computeViralScore(reel: ParsedReel): number {
  const reachMultiplier = reel.views / reel.owner.followers;
  const engagementRate = (reel.likes + reel.comments) / reel.views;
  return reachMultiplier * engagementRate * 100;
}

export function passesPrivacyAndFollowers(reel: ParsedReel): boolean {
  return !reel.owner.isPrivate && reel.owner.followers > 0;
}

export function passesTier1Thresholds(reel: ParsedReel): boolean {
  const reach = reel.views / reel.owner.followers;
  return (
    reach >= MIN_REACH_MULTIPLIER &&
    reel.views >= MIN_VIEWS &&
    computeViralScore(reel) >= MIN_VIRAL_SCORE
  );
}

export function passesTier2Thresholds(reel: ParsedReel): boolean {
  const reach = reel.views / reel.owner.followers;
  return reach >= TIER2_MIN_REACH_MULTIPLIER && reel.views >= TIER2_MIN_VIEWS;
}

export function classifyTier(reel: ParsedReel): 1 | 2 | null {
  if (!passesPrivacyAndFollowers(reel)) return null;
  if (passesTier1Thresholds(reel)) return 1;
  if (passesTier2Thresholds(reel)) return 2;
  return null;
}

export function scoreReel(reel: ParsedReel): ScoredReel | null {
  const tier = classifyTier(reel);
  if (tier === null) return null;

  const reachMultiplier = reel.views / reel.owner.followers;
  const engagementRate = (reel.likes + reel.comments) / reel.views;
  const viralScore = reachMultiplier * engagementRate * 100;

  return {
    ...reel,
    tier,
    reachMultiplier,
    engagementRate,
    viralScore,
    viralTier: viralTierForScore(viralScore),
    reelUrl: `https://www.instagram.com/reel/${reel.shortcode}/`,
  };
}
