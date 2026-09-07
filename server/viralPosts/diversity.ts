import type { ViralTrendStatus } from "@shared/viralPosts";
import { VIRAL_DAILY_FEED_MAX, VIRAL_DAILY_FEED_MIN } from "@shared/viralPosts";

export type DiversityCandidate = {
  candidateId: number;
  sourceId: string;
  creatorKey: string;
  caption: string;
  hook: string;
  contentPillar: string | null;
  format: string | null;
  finalScore: number;
  trendStatus: ViralTrendStatus;
  hidden: boolean;
  recentlyDismissed: boolean;
  recentlyShown: boolean;
  hashtagKey: string | null;
  platform?: string | null;
};

/**
 * Today's Picks should prefer a shorter credible feed over filling the page
 * with weak matches. 0.45 was permissive enough that low-view, merely relevant
 * posts could survive scoring; 0.55 keeps stronger candidates while still
 * allowing a genuinely accelerating small-account post to compete through the
 * scoring model's velocity/reach signals.
 */
export const DAILY_PICK_MIN_FINAL_SCORE = 0.55;

/**
 * Platform variety is a tie-breaker, not a quota. We only defer an otherwise
 * eligible same-platform candidate when another platform is close enough in
 * score that choosing variety does not materially lower recommendation quality.
 */
export const PLATFORM_DIVERSITY_MAX_SCORE_GAP = 0.025;

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nearDuplicate(a: string, b: string): boolean {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 48 && nb.includes(na.slice(0, 48))) return true;
  if (nb.length >= 48 && na.includes(nb.slice(0, 48))) return true;
  return false;
}

function isCloseEligibleAltPlatform(args: {
  current: DiversityCandidate;
  candidate: DiversityCandidate;
  selected: DiversityCandidate[];
  usedSources: Set<string>;
  creatorCounts: Map<string, number>;
  platforms: Set<string>;
}): boolean {
  const { current, candidate, selected, usedSources, creatorCounts, platforms } = args;
  if (!candidate.platform || platforms.has(candidate.platform)) return false;
  if (candidate.finalScore < current.finalScore - PLATFORM_DIVERSITY_MAX_SCORE_GAP) {
    return false;
  }
  if (candidate.hidden || candidate.recentlyDismissed || candidate.recentlyShown) {
    return false;
  }
  if (usedSources.has(candidate.sourceId)) return false;
  if ((creatorCounts.get(candidate.creatorKey) ?? 0) >= 1) return false;
  return !selected.some(
    (existing) =>
      nearDuplicate(existing.caption || existing.hook, candidate.caption || candidate.hook) ||
      nearDuplicate(existing.hook, candidate.hook)
  );
}

/**
 * Deterministic diversity selection for daily recommendations.
 * Same inputs always produce the same ranked output.
 *
 * Pass 1 is intentionally strict: one post per creator. If that cannot reach
 * the minimum feed size, pass 2 may use one additional post from a creator.
 * This prevents a single account from owning the first screen while still
 * letting a thin cold-start pool return something useful.
 *
 * `minFinalScore` is optional. When supplied, every fill pass respects the
 * quality floor so callers can prefer a shorter high-quality feed over quota
 * padding without changing default behavior for other uses.
 */
export function selectDiverseFeed(
  candidates: DiversityCandidate[],
  opts?: { min?: number; max?: number; minFinalScore?: number }
): DiversityCandidate[] {
  const min = opts?.min ?? VIRAL_DAILY_FEED_MIN;
  const max = opts?.max ?? VIRAL_DAILY_FEED_MAX;
  const minFinalScore = opts?.minFinalScore ?? 0;

  const sorted = candidates
    .filter(
      (candidate) =>
        Number.isFinite(candidate.finalScore) &&
        candidate.finalScore >= minFinalScore
    )
    .sort((a, b) => {
      if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
      return a.sourceId.localeCompare(b.sourceId);
    });

  const selected: DiversityCandidate[] = [];
  const usedSources = new Set<string>();
  const creatorCounts = new Map<string, number>();
  const platforms = new Set<string>();

  for (const c of sorted) {
    if (selected.length >= max) break;
    if (c.hidden || c.recentlyDismissed || c.recentlyShown) continue;
    if (usedSources.has(c.sourceId)) continue;

    const creatorCount = creatorCounts.get(c.creatorKey) ?? 0;
    if (creatorCount >= 1) continue;

    const dup = selected.some(
      (s) =>
        nearDuplicate(s.caption || s.hook, c.caption || c.hook) ||
        nearDuplicate(s.hook, c.hook)
    );
    if (dup) continue;

    if (
      selected.length >= 1 &&
      platforms.size === 1 &&
      c.platform &&
      platforms.has(c.platform)
    ) {
      const hasCloseAltPlatform = sorted.some((alt) =>
        isCloseEligibleAltPlatform({
          current: c,
          candidate: alt,
          selected,
          usedSources,
          creatorCounts,
          platforms,
        })
      );
      if (hasCloseAltPlatform) continue;
    }

    selected.push(c);
    usedSources.add(c.sourceId);
    creatorCounts.set(c.creatorKey, creatorCount + 1);
    if (c.platform) platforms.add(c.platform);
  }

  // Cold-start escape hatch: use at most one second post per creator, but never
  // cross the quality floor or resurrect hidden/dismissed/recently-shown posts.
  if (selected.length < min) {
    for (const c of sorted) {
      if (selected.length >= min) break;
      if (c.hidden || c.recentlyDismissed || c.recentlyShown) continue;
      if (usedSources.has(c.sourceId)) continue;
      const creatorCount = creatorCounts.get(c.creatorKey) ?? 0;
      if (creatorCount >= 2) continue;
      const dup = selected.some((s) =>
        nearDuplicate(s.caption || s.hook, c.caption || c.hook)
      );
      if (dup) continue;
      selected.push(c);
      usedSources.add(c.sourceId);
      creatorCounts.set(c.creatorKey, creatorCount + 1);
      if (c.platform) platforms.add(c.platform);
    }
  }

  return selected.slice(0, max);
}
