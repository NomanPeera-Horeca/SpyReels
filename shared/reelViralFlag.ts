/**
 * Viral flag: reel views > 5× creator median views AND views > 10,000.
 * Same rule as scripts/compute-reel-metrics.ts (keep in sync).
 */

export const VIRAL_MIN_VIEWS = 10_000;
export const VIRAL_MEDIAN_MULTIPLIER = 5;

export function medianViewCount(viewCounts: number[]): number {
  if (viewCounts.length === 0) return 0;
  const sorted = [...viewCounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function isViralByViewCount(viewCount: number, medianViews: number): boolean {
  if (!Number.isFinite(viewCount) || viewCount <= VIRAL_MIN_VIEWS) return false;
  if (!Number.isFinite(medianViews) || medianViews <= 0) {
    return viewCount > VIRAL_MIN_VIEWS;
  }
  return viewCount > VIRAL_MEDIAN_MULTIPLIER * medianViews;
}

export function normalizeCreatorKey(
  ownerUsername: string | null | undefined,
  jobHandle: string | null | undefined
): string {
  const fromOwner = ownerUsername?.replace(/^@/, "").trim().toLowerCase();
  if (fromOwner) return fromOwner;
  return jobHandle?.replace(/^@/, "").trim().toLowerCase() ?? "";
}
