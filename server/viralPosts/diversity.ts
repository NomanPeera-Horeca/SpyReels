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
 * Recommended floor for Today’s Picks. The selector itself remains generic and
 * backward-compatible; callers must opt into this threshold explicitly.
 */
export const DAILY_PICK_MIN_FINAL_SCORE = 0.45;

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

/**
 * Deterministic diversity selection for daily recommendations.
 * Same inputs always produce the same ranked output.
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
  const pillars = new Set<string>();
  const hashtags = new Set<string>();
  const platforms = new Set<string>();

  for (const c of sorted) {
    if (selected.length >= max) break;
    if (c.hidden) continue;
    if (c.recentlyDismissed) continue;
    if (c.recentlyShown) continue;
    if (usedSources.has(c.sourceId)) continue;

    const creatorCount = creatorCounts.get(c.creatorKey) ?? 0;
    if (creatorCount >= 2) continue;
    if (creatorCount >= 1 && selected.length >= min) continue;

    const dup = selected.some(
      (s) =>
        nearDuplicate(s.caption || s.hook, c.caption || c.hook) ||
        nearDuplicate(s.hook, c.hook)
    );
    if (dup) continue;

    if (
      selected.length >= min &&
      platforms.size === 1 &&
      c.platform &&
      platforms.has(c.platform)
    ) {
      const hasAltPlatform = sorted.some(
        (alt) =>
          alt.platform &&
          !platforms.has(alt.platform) &&
          !usedSources.has(alt.sourceId) &&
          !alt.hidden &&
          !alt.recentlyDismissed &&
          !alt.recentlyShown
      );
      if (hasAltPlatform) continue;
    }

    selected.push(c);
    usedSources.add(c.sourceId);
    creatorCounts.set(c.creatorKey, creatorCount + 1);
    if (c.contentPillar) pillars.add(c.contentPillar);
    if (c.hashtagKey) hashtags.add(c.hashtagKey);
    if (c.platform) platforms.add(c.platform);
  }

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
    }
  }

  if (selected.length === 0) {
    for (const c of sorted) {
      if (selected.length >= min) break;
      if (c.hidden || c.recentlyDismissed) continue;
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
    }
  }

  void pillars;
  void hashtags;

  return selected.slice(0, max);
}
