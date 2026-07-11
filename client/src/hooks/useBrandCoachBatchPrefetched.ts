import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useFeatureLock } from "@/components/UpgradeSidesheet";
import type { BrandCoachCachedScore } from "@/components/BrandCoachBadge";

const BRAND_COACH_BATCH_STALE_MS = 5 * 60 * 1000;

export function useBrandCoachBatchPrefetched(opts: {
  reelIds?: number[];
  featuredReelIds?: number[];
}) {
  const reelIds = opts.reelIds ?? [];
  const featuredReelIds = opts.featuredReelIds ?? [];
  const brandCoachLock = useFeatureLock("brandCoach");

  const batchQuery = trpc.brandCoach.getBatch.useQuery(
    { reelIds, featuredReelIds },
    {
      enabled:
        !brandCoachLock.loading &&
        !brandCoachLock.locked &&
        (reelIds.length > 0 || featuredReelIds.length > 0),
      staleTime: BRAND_COACH_BATCH_STALE_MS,
    }
  );

  const batchReady = batchQuery.isSuccess;

  const prefetchedForReel = useCallback(
    (reelId: number): BrandCoachCachedScore | null | undefined => {
      if (brandCoachLock.locked || brandCoachLock.loading) return undefined;
      if (!batchReady) return undefined;
      return batchQuery.data?.byReelId[reelId] ?? null;
    },
    [batchQuery.data, batchReady, brandCoachLock.loading, brandCoachLock.locked]
  );

  const prefetchedForFeatured = useCallback(
    (featuredReelId: number): BrandCoachCachedScore | null | undefined => {
      if (brandCoachLock.locked || brandCoachLock.loading) return undefined;
      if (!batchReady) return undefined;
      return batchQuery.data?.byFeaturedReelId[featuredReelId] ?? null;
    },
    [batchQuery.data, batchReady, brandCoachLock.loading, brandCoachLock.locked]
  );

  return { prefetchedForReel, prefetchedForFeatured };
}
