/**
 * "My creators": every creator this workspace researched on Instagram, TikTok
 * or YouTube (formerly the Creator Radar page). One list per platform+handle,
 * the session with the most videos wins. Shared by Creator Radar (/history)
 * and the combined Creator Research page.
 */
import { useMemo } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import { listHasRunningScrapeJob } from "@/lib/activeScrapeJob";
import { isScrapeJobInFlight } from "@shared/scrapeProgressUi";

type InstagramScrapeJobRow = inferRouterOutputs<AppRouter>["scrape"]["list"][number];
type TikTokScrapeJobRow = inferRouterOutputs<AppRouter>["tiktokScrape"]["list"][number];
type YouTubeScrapeJobRow = inferRouterOutputs<AppRouter>["youtubeScrape"]["list"][number];
export type MyCreatorJob =
  | (InstagramScrapeJobRow & { platform: "instagram" })
  | (TikTokScrapeJobRow & { platform: "tiktok" })
  | (YouTubeScrapeJobRow & { platform: "youtube"; followerCount: number });

export type MyCreatorsSort = "updated" | "reels" | "followers" | "engagement";

export function jobVideoCount(job: Pick<MyCreatorJob, "platform"> & { totalReels?: number; totalVideos?: number }): number {
  return (job.platform === "instagram" ? job.totalReels : job.totalVideos) ?? 0;
}

/** "2 hours ago", "yesterday", "6 days ago". Pure; exported for tests. */
export function updatedAgo(d: Date | string, now = new Date()): string {
  const diffMins = Math.floor((now.getTime() - new Date(d).getTime()) / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins} min ago`;
  const hours = Math.floor(diffMins / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** Plain words for a failed research. Pure; exported for tests. */
export function failedLabel(failureReason: string | null | undefined): string {
  switch (failureReason) {
    case "handle_not_found":
      return "Couldn't find this account";
    case "account_private":
      return "This account is private";
    case "instagram_rate_limited":
      return "Instagram is busy. Try again soon";
    case "account_too_large":
      return "Account too large to analyze";
    default:
      return "Research didn't finish";
  }
}

/** One row per platform+handle (the session with more videos wins), sorted. Pure; exported for tests. */
export function mergeMyCreators(jobs: MyCreatorJob[], sortBy: MyCreatorsSort = "updated"): MyCreatorJob[] {
  const byKey = new Map<string, MyCreatorJob>();
  for (const job of jobs) {
    const key = `${job.platform}:${job.handle.toLowerCase()}`;
    const existing = byKey.get(key);
    if (!existing || jobVideoCount(job) > jobVideoCount(existing)) byKey.set(key, job);
  }
  const list = Array.from(byKey.values());
  const engagement = (j: MyCreatorJob) => j.reelStats?.avgEngagementPct ?? 0;
  switch (sortBy) {
    case "reels":
      return list.sort((a, b) => jobVideoCount(b) - jobVideoCount(a));
    case "followers":
      return list.sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0));
    case "engagement":
      return list.sort((a, b) => engagement(b) - engagement(a));
    default:
      return list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }
}

export function useMyCreators(sortBy: MyCreatorsSort = "updated") {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const jobsQuery = trpc.scrape.list.useQuery(undefined, {
    refetchInterval: q => (listHasRunningScrapeJob(q.state.data) ? 3000 : false),
    refetchOnWindowFocus: true,
  });
  const tiktokJobsQuery = trpc.tiktokScrape.list.useQuery(undefined, {
    refetchInterval: q => (q.state.data?.some(job => isScrapeJobInFlight(job.status)) ? 3000 : false),
    refetchOnWindowFocus: true,
  });
  const youtubeJobsQuery = trpc.youtubeScrape.list.useQuery(undefined, {
    refetchInterval: q => (q.state.data?.some(job => isScrapeJobInFlight(job.status)) ? 3000 : false),
    refetchOnWindowFocus: true,
  });

  const jobs = useMemo(
    () =>
      mergeMyCreators(
        [
          ...(jobsQuery.data ?? []).map(job => ({ ...job, platform: "instagram" as const })),
          ...(tiktokJobsQuery.data ?? []).map(job => ({ ...job, platform: "tiktok" as const })),
          ...(youtubeJobsQuery.data ?? []).map(job => ({ ...job, platform: "youtube" as const, followerCount: job.subscriberCount })),
        ],
        sortBy
      ),
    [jobsQuery.data, tiktokJobsQuery.data, youtubeJobsQuery.data, sortBy]
  );

  const loading = jobsQuery.isLoading || tiktokJobsQuery.isLoading || youtubeJobsQuery.isLoading;
  const loaded = Boolean(jobsQuery.data && tiktokJobsQuery.data && youtubeJobsQuery.data);

  const refreshError = (error: { message: string }) => toast.error("Refresh failed", { description: error.message });
  const resyncMutation = trpc.scrape.resync.useMutation({ onError: refreshError });
  const resyncTikTokMutation = trpc.tiktokScrape.resync.useMutation({ onError: refreshError });
  const resyncYouTubeMutation = trpc.youtubeScrape.resync.useMutation({ onError: refreshError });

  const refreshPending = resyncMutation.isPending || resyncTikTokMutation.isPending || resyncYouTubeMutation.isPending;
  const isRefreshing = (job: MyCreatorJob) => {
    if (job.platform === "instagram") return resyncMutation.isPending && resyncMutation.variables?.jobId === job.id;
    if (job.platform === "tiktok") return resyncTikTokMutation.isPending && resyncTikTokMutation.variables?.jobId === job.id;
    return resyncYouTubeMutation.isPending && resyncYouTubeMutation.variables?.jobId === job.id;
  };

  const refresh = (job: MyCreatorJob) => {
    const onSuccess = () => {
      if (job.platform === "instagram") {
        void utils.scrape.list.invalidate();
        void utils.scrape.status.invalidate({ jobId: job.id });
        void utils.reels.list.invalidate({ jobId: job.id });
      } else if (job.platform === "tiktok") {
        void utils.tiktokScrape.list.invalidate();
        void utils.tiktokScrape.progress.invalidate({ jobId: job.id });
        void utils.tiktokScrape.videos.invalidate({ jobId: job.id });
      } else {
        void utils.youtubeScrape.list.invalidate();
        void utils.youtubeScrape.progress.invalidate({ jobId: job.id });
        void utils.youtubeScrape.videos.invalidate({ jobId: job.id });
      }
      toast.success(job.status === "failed" ? "Retry started" : "Refreshing creator", {
        description: "Your existing results stay available until fresh data is ready.",
      });
    };
    if (job.platform === "instagram") resyncMutation.mutate({ jobId: job.id }, { onSuccess });
    else if (job.platform === "tiktok") resyncTikTokMutation.mutate({ jobId: job.id }, { onSuccess });
    else resyncYouTubeMutation.mutate({ jobId: job.id }, { onSuccess });
  };

  const removed = (list: () => Promise<void>) => ({
    onSuccess: () => {
      toast.success("Removed from My creators");
      void list();
    },
    onError: (error: { message: string }) => toast.error("Couldn't remove", { description: error.message }),
  });
  const deleteMutation = trpc.scrape.delete.useMutation(removed(() => utils.scrape.list.invalidate()));
  const deleteTikTokMutation = trpc.tiktokScrape.delete.useMutation(removed(() => utils.tiktokScrape.list.invalidate()));
  const deleteYouTubeMutation = trpc.youtubeScrape.delete.useMutation(removed(() => utils.youtubeScrape.list.invalidate()));
  const removing = deleteMutation.isPending || deleteTikTokMutation.isPending || deleteYouTubeMutation.isPending;

  /** Deletes the research session and its stored videos. Callers confirm first. */
  const remove = (job: MyCreatorJob) => {
    if (job.platform === "instagram") deleteMutation.mutate({ jobId: job.id });
    else if (job.platform === "tiktok") deleteTikTokMutation.mutate({ jobId: job.id });
    else deleteYouTubeMutation.mutate({ jobId: job.id });
  };

  const canOpen = (job: MyCreatorJob) => job.status === "completed" || job.status === "running";
  const open = (job: MyCreatorJob, from: "history" | "research" = "history") => {
    if (!canOpen(job)) return;
    if (job.platform === "instagram") setLocation(`/dashboard?jobId=${job.id}&from=${from}`);
    else setLocation(`/research?platform=${job.platform}&jobId=${job.id}&from=${from}`);
  };

  return {
    jobs,
    loading,
    loaded,
    queries: { jobsQuery, tiktokJobsQuery, youtubeJobsQuery },
    refresh,
    refreshPending,
    isRefreshing,
    remove,
    removing,
    open,
    canOpen,
  };
}
