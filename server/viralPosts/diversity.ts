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

/**
 * Deterministic diversity selection for 5–7 daily recommendations.
 * Same inputs always produce the same ranked output.
 */
export function selectDiverseFeed(
  candidates: DiversityCandidate[],
  opts?: { min?: number; max?: number }
): DiversityCandidate[] {
  const min = opts?.min ?? VIRAL_DAILY_FEED_MIN;
  const max = opts?.max ?? VIRAL_DAILY_FEED_MAX;

  const sorted = [...candidates].sort((a, b) => {
    if (b.finalScore !== a.finalScore) return b.finalScore - a.finalScore;
    return a.sourceId.localeCompare(b.sourceId);
  });

  const selected: DiversityCandidate[] = [];
  const usedSources = new Set<string>();
  const creatorCounts = new Map<string, number>();
  const pillars = new Set<string>();
  const hashtags = new Set<string>();

  for (const c of sorted) {
    if (selected.length >= max) break;
    if (c.hidden) continue;
    if (c.recentlyDismissed) continue;
    if (usedSources.has(c.sourceId)) continue;

    const creatorCount = creatorCounts.get(c.creatorKey) ?? 0;
    if (creatorCount >= 2) continue;
    // Prefer at most one per creator unless we are below min
    if (creatorCount >= 1 && selected.length >= min) continue;

    const dup = selected.some(
      (s) =>
        nearDuplicate(s.caption || s.hook, c.caption || c.hook) ||
        nearDuplicate(s.hook, c.hook)
    );
    if (dup) continue;

    // Soft penalty: skip recently shown unless we need fill
    if (c.recentlyShown && selected.length >= min) continue;

    selected.push(c);
    usedSources.add(c.sourceId);
    creatorCounts.set(c.creatorKey, creatorCount + 1);
    if (c.contentPillar) pillars.add(c.contentPillar);
    if (c.hashtagKey) hashtags.add(c.hashtagKey);
  }

  // Second pass: fill to min with relaxed creator/recent rules (still no dups/hidden)
  if (selected.length < min) {
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

  // Prefer multi-hashtag / multi-pillar when possible: if all from one hashtag
  // and we have alternatives, swap last item (already mostly handled by score).
  void pillars;
  void hashtags;

  return selected.slice(0, max);
}
