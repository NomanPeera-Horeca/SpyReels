import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { isScrapeJobInFlight, type ResearchPlatform } from "@shared/scrapeProgressUi";

export type ActiveResearchJob = {
  platform: ResearchPlatform;
  jobId: number;
  handle: string;
  status: string;
  progressPercent: number;
  itemsFound: number;
  currentStep?: string | null;
  estimatedTotal?: number;
  updatedAt: string | Date;
};

export function useActiveResearchJobs(): {
  activeJobs: ActiveResearchJob[];
  isLoading: boolean;
} {
  const instagramQuery = trpc.scrape.list.useQuery(undefined, {
    refetchInterval: (q) => {
      const jobs = q.state.data;
      const running = jobs?.some(
        (j) => isScrapeJobInFlight(j.status) && !j.isDemo
      );
      return running ? 3000 : false;
    },
    refetchOnWindowFocus: true,
  });

  const tiktokQuery = trpc.tiktokScrape.list.useQuery(undefined, {
    refetchInterval: (q) => {
      const jobs = q.state.data;
      const running = jobs?.some((j) => isScrapeJobInFlight(j.status));
      return running ? 3000 : false;
    },
    refetchOnWindowFocus: true,
  });

  const activeJobs = useMemo(() => {
    const instagramJobs: ActiveResearchJob[] = (instagramQuery.data ?? [])
      .filter((j) => isScrapeJobInFlight(j.status) && !j.isDemo)
      .map((j) => ({
        platform: "instagram" as const,
        jobId: j.id,
        handle: j.handle,
        status: j.status,
        progressPercent: j.progressPercent,
        itemsFound: j.reelsFound,
        currentStep: j.currentStep,
        estimatedTotal: j.estimatedTotal,
        updatedAt: j.updatedAt,
      }));

    const tiktokJobs: ActiveResearchJob[] = (tiktokQuery.data ?? [])
      .filter((j) => isScrapeJobInFlight(j.status))
      .map((j) => ({
        platform: "tiktok" as const,
        jobId: j.id,
        handle: j.handle,
        status: j.status,
        progressPercent: j.progressPercent,
        itemsFound: j.videosFound,
        currentStep: j.currentStep,
        estimatedTotal: j.estimatedTotal,
        updatedAt: j.updatedAt,
      }));

    return [...instagramJobs, ...tiktokJobs].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [instagramQuery.data, tiktokQuery.data]);

  return {
    activeJobs,
    isLoading: instagramQuery.isLoading || tiktokQuery.isLoading,
  };
}
