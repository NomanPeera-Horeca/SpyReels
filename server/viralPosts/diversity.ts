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
 * Strong Today picks remain at the tightened quality bar introduced for feed
 * quality. The important reliability change is that this is no longer a single
 * cliff that can turn a healthy candidate universe into an empty product.
 */
export const DAILY_PICK_STRONG_MIN_FINAL_SCORE = 0.55;

/**
 * Controlled rescue floor for a thin daily feed. Candidates in this band may
 * fill only the minimum feed size and never displace strong picks. This keeps
 * the old permissive 0.45 behavior available only as a bounded fallback.
 */
export const DAILY_PICK_FALLBACK_MIN_FINAL_SCORE = 0.45;

/** Backward-compatible name used by older callers. */
export const DAILY_PICK_MIN_FINAL_SCORE = DAILY_PICK_STRONG_MIN_FINAL_SCORE;

/**
 * Platform variety is a tie-breaker, not a quota. We only defer an otherwise
 * eligible same-platform candidate when another platform is close enough in
 * score that choosing variety does not materially lower recommendation quality.
 */
export const PLATFORM_DIVERSITY_MAX_SCORE_GAP = 0.025;

export type DailyPickScoreDistribution = {
  p50: number | null;
  p75: number | null;
  p90: number | null;
  max: number | null;
};

export type TieredDailyFeedSelection = {
  selected: DiversityCandidate[];
  strongSelectedCount: number;
  fallbackSelectedCount: number;
  strongEligibleCount: number;
  fallbackEligibleCount: number;
  finiteScoreCount: number;
  scoreDistribution: DailyPickScoreDistribution;
};

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

function isCandidateSuppressed(candidate: DiversityCandidate): boolean {
  return candidate.hidden || candidate.recentlyDismissed || candidate.recentlyShown;
}

function isNearDuplicateOfSelected(
  candidate: DiversityCandidate,
  selected: DiversityCandidate[]
): boolean {
  return selected.some(
    (existing) =>
      nearDuplicate(
        existing.caption || existing.hook,
        candidate.caption || candidate.hook
      ) || nearDuplicate(existing.hook, candidate.hook)
  );
}

function isCloseEligibleAltPlatform(args: {
  current: DiversityCandidate;
  candidate: DiversityCandidate;
  selected: DiversityCandidate[];
  usedSources: Set<string>;
  creatorCounts: Map<string, number>;
  platforms: Set<string>;
  maxPerCreator?: number;
}): boolean {
  const { current, candidate, selected, usedSources, creatorCounts, platforms } = args;
  if (!candidate.platform || platforms.has(candidate.platform)) return false;
  if (candidate.finalScore < current.finalScore - PLATFORM_DIVERSITY_MAX_SCORE_GAP) {
    return false;
  }
  if (isCandidateSuppressed(candidate)) return false;
  if (usedSources.has(candidate.sourceId)) return false;
  if ((creatorCounts.get(candidate.creatorKey) ?? 0) >= (args.maxPerCreator ?? 1)) {
    return false;
  }
  return !isNearDuplicateOfSelected(candidate, selected);
}

function percentile(sortedAscending: number[], ratio: number): number | null {
  if (sortedAscending.length === 0) return null;
  const index = Math.min(
    sortedAscending.length - 1,
    Math.max(0, Math.ceil(sortedAscending.length * ratio) - 1)
  );
  return sortedAscending[index] ?? null;
}

export function summarizeDailyPickScores(
  candidates: DiversityCandidate[]
): DailyPickScoreDistribution {
  const scores = candidates
    .map((candidate) => candidate.finalScore)
    .filter((score) => Number.isFinite(score))
    .sort((a, b) => a - b);
  return {
    p50: percentile(scores, 0.5),
    p75: percentile(scores, 0.75),
    p90: percentile(scores, 0.9),
    max: scores.length > 0 ? scores[scores.length - 1]! : null,
  };
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
    if (isCandidateSuppressed(c)) continue;
    if (usedSources.has(c.sourceId)) continue;

    const creatorCount = creatorCounts.get(c.creatorKey) ?? 0;
    if (creatorCount >= 1) continue;
    if (isNearDuplicateOfSelected(c, selected)) continue;

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
      if (isCandidateSuppressed(c)) continue;
      if (usedSources.has(c.sourceId)) continue;
      const creatorCount = creatorCounts.get(c.creatorKey) ?? 0;
      if (creatorCount >= 2) continue;
      if (isNearDuplicateOfSelected(c, selected)) continue;
      selected.push(c);
      usedSources.add(c.sourceId);
      creatorCounts.set(c.creatorKey, creatorCount + 1);
      if (c.platform) platforms.add(c.platform);
    }
  }

  return selected.slice(0, max);
}

function fillFallbackTier(args: {
  selected: DiversityCandidate[];
  candidates: DiversityCandidate[];
  target: number;
  maxPerCreator: number;
}): void {
  const { selected, target, maxPerCreator } = args;
  if (selected.length >= target) return;

  const fallback = [...args.candidates].sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.sourceId.localeCompare(b.sourceId);
  });
  const usedSources = new Set(selected.map((candidate) => candidate.sourceId));
  const creatorCounts = new Map<string, number>();
  const platforms = new Set<string>();
  for (const candidate of selected) {
    creatorCounts.set(
      candidate.creatorKey,
      (creatorCounts.get(candidate.creatorKey) ?? 0) + 1
    );
    if (candidate.platform) platforms.add(candidate.platform);
  }

  for (const candidate of fallback) {
    if (selected.length >= target) break;
    if (isCandidateSuppressed(candidate)) continue;
    if (usedSources.has(candidate.sourceId)) continue;
    if ((creatorCounts.get(candidate.creatorKey) ?? 0) >= maxPerCreator) continue;
    if (isNearDuplicateOfSelected(candidate, selected)) continue;

    if (
      selected.length >= 1 &&
      platforms.size === 1 &&
      candidate.platform &&
      platforms.has(candidate.platform)
    ) {
      const hasCloseAltPlatform = fallback.some((alt) =>
        isCloseEligibleAltPlatform({
          current: candidate,
          candidate: alt,
          selected,
          usedSources,
          creatorCounts,
          platforms,
          maxPerCreator,
        })
      );
      if (hasCloseAltPlatform) continue;
    }

    selected.push(candidate);
    usedSources.add(candidate.sourceId);
    creatorCounts.set(
      candidate.creatorKey,
      (creatorCounts.get(candidate.creatorKey) ?? 0) + 1
    );
    if (candidate.platform) platforms.add(candidate.platform);
  }
}

/**
 * Today-specific reliability policy.
 *
 * 1. Select strong candidates at the normal quality bar and allow them to fill
 *    the full 5-7 feed.
 * 2. Only when fewer than the minimum survive, fill the missing slots from a
 *    bounded fallback band.
 * 3. Fallback candidates may fill to the minimum only. They never push a strong
 *    recommendation out of the feed or pad the feed to the maximum.
 * 4. Suppression, duplicate and creator-diversity rules remain in force in both
 *    tiers.
 */
export function selectTieredDailyFeed(
  candidates: DiversityCandidate[],
  opts?: {
    min?: number;
    max?: number;
    strongMinFinalScore?: number;
    fallbackMinFinalScore?: number;
  }
): TieredDailyFeedSelection {
  const min = opts?.min ?? VIRAL_DAILY_FEED_MIN;
  const max = opts?.max ?? VIRAL_DAILY_FEED_MAX;
  const strongMinFinalScore =
    opts?.strongMinFinalScore ?? DAILY_PICK_STRONG_MIN_FINAL_SCORE;
  const fallbackMinFinalScore =
    opts?.fallbackMinFinalScore ?? DAILY_PICK_FALLBACK_MIN_FINAL_SCORE;

  if (fallbackMinFinalScore > strongMinFinalScore) {
    throw new Error("fallbackMinFinalScore must be <= strongMinFinalScore");
  }

  const finiteCandidates = candidates.filter((candidate) =>
    Number.isFinite(candidate.finalScore)
  );
  const unsuppressed = finiteCandidates.filter(
    (candidate) => !isCandidateSuppressed(candidate)
  );
  const strongEligibleCount = unsuppressed.filter(
    (candidate) => candidate.finalScore >= strongMinFinalScore
  ).length;
  const fallbackEligibleCount = unsuppressed.filter(
    (candidate) => candidate.finalScore >= fallbackMinFinalScore
  ).length;

  const selected = selectDiverseFeed(candidates, {
    min,
    max,
    minFinalScore: strongMinFinalScore,
  });

  if (selected.length < min) {
    const fallbackBand = finiteCandidates.filter(
      (candidate) =>
        candidate.finalScore >= fallbackMinFinalScore &&
        candidate.finalScore < strongMinFinalScore
    );

    // Prefer one post per creator across the whole feed. If the feed is still
    // thin, allow at most one second post from a creator as the final escape hatch.
    fillFallbackTier({
      selected,
      candidates: fallbackBand,
      target: min,
      maxPerCreator: 1,
    });
    fillFallbackTier({
      selected,
      candidates: fallbackBand,
      target: min,
      maxPerCreator: 2,
    });
  }

  const finalSelected = selected.slice(0, max);
  const strongSelectedCount = finalSelected.filter(
    (candidate) => candidate.finalScore >= strongMinFinalScore
  ).length;

  return {
    selected: finalSelected,
    strongSelectedCount,
    fallbackSelectedCount: finalSelected.length - strongSelectedCount,
    strongEligibleCount,
    fallbackEligibleCount,
    finiteScoreCount: finiteCandidates.length,
    scoreDistribution: summarizeDailyPickScores(finiteCandidates),
  };
}
