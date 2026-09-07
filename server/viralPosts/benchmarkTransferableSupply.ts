import { loadFeaturedTransferableCandidates } from "./featuredSupply";
import { canonicalCandidateKey } from "./personalization";

export type TransferableFeaturedBenchmarkExample = {
  platform: string;
  sourceId: string;
  sourceUrl: string;
  creatorHandle: string | null;
  hook: string | null;
  format: string | null;
  views: number | null;
  pillar: string;
};

export type TransferableFeaturedBenchmarkSupply = {
  totalUnique: number;
  matchesByPillar: Record<string, number>;
  examples: TransferableFeaturedBenchmarkExample[];
};

/**
 * Diagnostic-only view of zero-provider Featured supply available right now.
 * This does not insert/link candidates or alter the benchmark candidate universe;
 * it only distinguishes "catalog has supply" from "pool has been hydrated".
 */
export async function loadTransferableFeaturedBenchmarkSupply(args: {
  niche: string;
  pillars: string[];
  now?: Date;
  limitPerPillar?: number;
  exampleLimit?: number;
}): Promise<TransferableFeaturedBenchmarkSupply> {
  const now = args.now ?? new Date();
  const limitPerPillar = Math.max(1, Math.min(args.limitPerPillar ?? 12, 30));
  const exampleLimit = Math.max(0, Math.min(args.exampleLimit ?? 12, 30));
  const matchesByPillar: Record<string, number> = {};
  const unique = new Map<
    string,
    TransferableFeaturedBenchmarkExample
  >();

  for (const pillar of args.pillars) {
    try {
      const candidates = await loadFeaturedTransferableCandidates({
        pillar,
        niche: args.niche,
        limit: limitPerPillar,
        now,
      });
      const pillarKeys = new Set<string>();
      for (const candidate of candidates) {
        const key = canonicalCandidateKey(candidate);
        pillarKeys.add(key);
        if (!unique.has(key)) {
          unique.set(key, {
            platform: candidate.platform,
            sourceId: candidate.sourceId,
            sourceUrl: candidate.sourceUrl,
            creatorHandle: candidate.creatorHandle,
            hook: candidate.hook,
            format: candidate.format,
            views: candidate.views,
            pillar,
          });
        }
      }
      matchesByPillar[pillar] = pillarKeys.size;
    } catch (err) {
      console.warn("[viralPosts.benchmark] transferable_featured_diagnostic_failed", {
        pillar,
        error: err instanceof Error ? err.message : String(err),
      });
      matchesByPillar[pillar] = 0;
    }
  }

  return {
    totalUnique: unique.size,
    matchesByPillar,
    examples: [...unique.values()].slice(0, exampleLimit),
  };
}
