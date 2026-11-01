/**
 * The one SpyReels viral rule, used by every surface (Home, Viral Posts,
 * Creator Radar, emails). Agreed with the founder on 2026-11-01.
 *
 * Main rule (all platforms): a video is viral when it has at least 5x the
 * creator's usual views AND at least 10,000 views. "Usual views" is the
 * median of the creator's ~12 most recent videos (at least 3 needed).
 *
 * Fallback, only while the creator's usual views are unknown: views versus
 * followers (subscribers on YouTube). TikTok and YouTube show videos to
 * non-followers far more than Instagram, so they need a higher multiple.
 *   Instagram >= 3x followers, TikTok >= 5x, YouTube >= 5x, and >= 10,000 views.
 *
 * Rising: a video under 7 days old that is not viral yet but already has at
 * least 40% of the required multiple and 2,000+ views (e.g. 2x usual views
 * after a day). Rising videos are re-checked on day 1, 3, 7 and 14.
 *
 * These are starting values. Tune them from real library data, not by eye.
 */

export type ViralRulePlatform = "instagram" | "tiktok" | "youtube";
export type ViralStatus = "viral" | "rising" | "not_viral" | "unknown";
export type ViralBasis = "usual_views" | "followers";

export const VIRAL_RULE = {
  minViews: 10_000,
  usualViewsMultiple: 5,
  followerMultiple: { instagram: 3, tiktok: 5, youtube: 5 } as Record<ViralRulePlatform, number>,
  usualViewsSampleSize: 12,
  usualViewsMinSample: 3,
  risingMaxAgeHours: 7 * 24,
  risingMinViews: 2_000,
  risingShareOfMultiple: 0.4,
  /** Hours after publish when a rising video is measured again. */
  recheckAtHours: [24, 72, 168, 336] as readonly number[],
} as const;

export type ViralVerdict = {
  status: ViralStatus;
  basis: ViralBasis | null;
  /** views / baseline, rounded down to 2 decimals. Null when there is no baseline. */
  multiple: number | null;
};

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function normalizeViralPlatform(platform: string | null | undefined): ViralRulePlatform | null {
  const p = (platform ?? "").trim().toLowerCase();
  return p === "instagram" || p === "tiktok" || p === "youtube" ? p : null;
}

/**
 * Median views of the creator's most recent videos. Null when fewer than 3
 * videos with views are known, so a thin sample never sets the bar.
 */
export function usualViewsFromRecent(
  videos: ReadonlyArray<{ views: number | null | undefined; postedAt?: Date | null }>
): { usualViews: number; sampleSize: number } | null {
  const recent = videos
    .filter(v => positive(v.views) != null)
    .slice()
    .sort((a, b) => (b.postedAt?.getTime() ?? 0) - (a.postedAt?.getTime() ?? 0))
    .slice(0, VIRAL_RULE.usualViewsSampleSize)
    .map(v => v.views as number)
    .sort((a, b) => a - b);
  if (recent.length < VIRAL_RULE.usualViewsMinSample) return null;
  const mid = Math.floor(recent.length / 2);
  const median =
    recent.length % 2 === 1 ? recent[mid]! : (recent[mid - 1]! + recent[mid]!) / 2;
  return median > 0 ? { usualViews: Math.round(median), sampleSize: recent.length } : null;
}

export function classifyVirality(input: {
  platform: string;
  views: number | null | undefined;
  followers?: number | null;
  usualViews?: number | null;
  publishedAt?: Date | null;
  now?: Date;
}): ViralVerdict {
  const platform = normalizeViralPlatform(input.platform);
  const views = positive(input.views);
  if (!platform || views == null) return { status: "unknown", basis: null, multiple: null };

  const usual = positive(input.usualViews);
  const followers = positive(input.followers);
  let basis: ViralBasis;
  let baseline: number;
  let required: number;
  if (usual != null) {
    basis = "usual_views";
    baseline = usual;
    required = VIRAL_RULE.usualViewsMultiple;
  } else if (followers != null) {
    basis = "followers";
    baseline = followers;
    required = VIRAL_RULE.followerMultiple[platform];
  } else {
    return { status: "unknown", basis: null, multiple: null };
  }

  const multiple = Math.floor((views / baseline) * 100) / 100;
  if (views >= VIRAL_RULE.minViews && multiple >= required) {
    return { status: "viral", basis, multiple };
  }

  const now = input.now ?? new Date();
  const ageHours = input.publishedAt
    ? (now.getTime() - input.publishedAt.getTime()) / 3_600_000
    : null;
  const young = ageHours != null && ageHours >= 0 && ageHours < VIRAL_RULE.risingMaxAgeHours;
  if (
    young &&
    views >= VIRAL_RULE.risingMinViews &&
    multiple >= required * VIRAL_RULE.risingShareOfMultiple
  ) {
    return { status: "rising", basis, multiple };
  }
  return { status: "not_viral", basis, multiple };
}

/**
 * When a rising video should be measured again: the next of day 1/3/7/14
 * after publish that is still ahead. Null for every other status, or once
 * day 14 has passed (it did not take off).
 */
export function nextViralRecheckAt(args: {
  status: ViralStatus;
  publishedAt: Date | null | undefined;
  now?: Date;
}): Date | null {
  if (args.status !== "rising" || !args.publishedAt) return null;
  const now = (args.now ?? new Date()).getTime();
  const published = args.publishedAt.getTime();
  for (const hours of VIRAL_RULE.recheckAtHours) {
    const at = published + hours * 3_600_000;
    if (at > now) return new Date(at);
  }
  return null;
}
