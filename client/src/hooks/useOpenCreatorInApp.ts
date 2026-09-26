import { useCallback, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { navigateAfterScrapeStart } from "@/lib/scrapeNavigation";
import {
  findOpenableCreatorJob,
  normalizeCreatorHandle,
  pathForCreatorResearchJob,
  type CreatorResearchPlatform,
} from "@/lib/openCreatorInApp";

/**
 * Open a creator inside SpyReels (Creator Radar / research), matching
 * Spy Viral Reels search → 30-day reel grid.
 */
export function useOpenCreatorInApp(from: string) {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const [busy, setBusy] = useState(false);

  const startInstagramScrape = trpc.scrape.start.useMutation();
  const startTikTokScrape = trpc.tiktokScrape.start.useMutation();
  const startYouTubeScrape = trpc.youtubeScrape.start.useMutation();

  const openCreator = useCallback(
    async (args: {
      handle: string | null | undefined;
      platform: CreatorResearchPlatform;
    }) => {
      const handle = normalizeCreatorHandle(args.handle);
      if (!handle) {
        toast.error("This reel has no creator handle to open.");
        return;
      }
      if (busy) return;
      setBusy(true);
      const toastId = toast.loading(`Opening @${handle} in SpyReels…`);
      try {
        if (args.platform === "instagram") {
          const jobs = await utils.scrape.list.fetch();
          const existing = findOpenableCreatorJob(jobs, handle);
          if (existing) {
            setLocation(
              pathForCreatorResearchJob(
                { id: existing.id, platform: "instagram" },
                from
              )
            );
            toast.success(`Opened @${handle}`, { id: toastId });
            return;
          }
          try {
            const data = await startInstagramScrape.mutateAsync({
              handle,
              timeframeDays: 30,
            });
            navigateAfterScrapeStart(data, setLocation, from);
            toast.success(`Researching @${handle}`, { id: toastId });
          } catch (err) {
            if (err instanceof TRPCClientError && err.data?.code === "CONFLICT") {
              const refreshed = await utils.scrape.list.fetch();
              const again = findOpenableCreatorJob(refreshed, handle);
              if (again) {
                setLocation(
                  pathForCreatorResearchJob(
                    { id: again.id, platform: "instagram" },
                    from
                  )
                );
                toast.success(`Opened @${handle}`, { id: toastId });
                return;
              }
              setLocation("/history");
              toast.message(err.message, { id: toastId });
              return;
            }
            throw err;
          }
          return;
        }

        if (args.platform === "tiktok") {
          const jobs = await utils.tiktokScrape.list.fetch();
          const existing = findOpenableCreatorJob(
            jobs.map((j) => ({ ...j, platform: "tiktok" as const })),
            handle
          );
          if (existing) {
            setLocation(
              pathForCreatorResearchJob(
                { id: existing.id, platform: "tiktok" },
                from
              )
            );
            toast.success(`Opened @${handle}`, { id: toastId });
            return;
          }
          const data = await startTikTokScrape.mutateAsync({
            handle,
            timeframe: "30",
          });
          setLocation(`/tiktok-scraping?jobId=${data.jobId}&from=${from}`);
          toast.success(`Researching @${handle}`, { id: toastId });
          return;
        }

        const ytJobs = await utils.youtubeScrape.list.fetch();
        const existingYt = findOpenableCreatorJob(
          ytJobs.map((j) => ({ ...j, platform: "youtube" as const })),
          handle
        );
        if (existingYt) {
          setLocation(
            pathForCreatorResearchJob(
              { id: existingYt.id, platform: "youtube" },
              from
            )
          );
          toast.success(`Opened @${handle}`, { id: toastId });
          return;
        }
        const data = await startYouTubeScrape.mutateAsync({
          handle,
          timeframe: "30",
        });
        setLocation(`/youtube-scraping?jobId=${data.jobId}&from=${from}`);
        toast.success(`Researching @${handle}`, { id: toastId });
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Could not open creator.",
          { id: toastId }
        );
      } finally {
        setBusy(false);
      }
    },
    [
      busy,
      from,
      setLocation,
      startInstagramScrape,
      startTikTokScrape,
      startYouTubeScrape,
      utils.scrape.list,
      utils.tiktokScrape.list,
      utils.youtubeScrape.list,
    ]
  );

  return { openCreator, creatorOpenBusy: busy };
}
