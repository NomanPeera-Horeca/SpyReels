import { useMemo, useState } from "react";
import type { inferRouterOutputs } from "@trpc/server";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocation } from "wouter";
import { AppLink } from "@/components/AppLink";
import {
  Radar,
  Film,
  ArrowRight,
  Loader2,
  Clock,
  Calendar,
  RefreshCw,
  Trash2,
  Users,
  Eye,
  Heart,
  MessageCircle,
  TrendingUp,
  LayoutGrid,
  List,
  Sparkles,
  Instagram,
  Music2,
} from "lucide-react";
import { toast } from "sonner";
import { formatNumber } from "@/components/InlineWorkflow";
import Tooltip from "@/components/Tooltip";
import { seeCreatorsViralReelsCta } from "@/lib/creatorCtaCopy";
import { ScrapeJobProgressUI } from "@/components/ScrapeJobProgressUI";
import { listHasRunningScrapeJob } from "@/lib/activeScrapeJob";
import { runningJobProgressSnapshot } from "@/hooks/useScrapeCompletionNotifier";
import { isScrapeJobInFlight } from "@shared/scrapeProgressUi";

type InstagramScrapeJobRow = inferRouterOutputs<AppRouter>["scrape"]["list"][number];
type TikTokScrapeJobRow = inferRouterOutputs<AppRouter>["tiktokScrape"]["list"][number];
type HistoryJobRow =
  | (InstagramScrapeJobRow & { platform: "instagram" })
  | (TikTokScrapeJobRow & { platform: "tiktok" });

function jobVideoCount(job: HistoryJobRow): number {
  return job.platform === "instagram" ? job.totalReels : job.totalVideos;
}

function jobNiche(job: HistoryJobRow): string | null {
  return job.platform === "instagram"
    ? readableNiche(job.classifiedNicheSlug)
    : null;
}

function formatDate(d: Date | string): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function timeAgo(d: Date | string): string {
  const date = new Date(d);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "1 day ago";
  return `${diffDays} days ago`;
}

function isSyncedWithin24h(d: Date | string): boolean {
  const date = new Date(d);
  const now = new Date();
  return now.getTime() - date.getTime() < 24 * 60 * 60 * 1000;
}

function jobStatusLabel(job: { status: string; failureReason?: string | null }): string {
  if (job.status !== "failed") return job.status;
  switch (job.failureReason) {
    case "handle_not_found":
      return "Handle not found";
    case "account_private":
      return "Account is private";
    case "instagram_rate_limited":
      return "Instagram rate-limited, try again soon";
    case "account_too_large":
      return "Account too large to analyze";
    case "unknown":
    default:
      return "Failed";
  }
}

function readableNiche(slug: string | null | undefined): string | null {
  if (!slug?.trim()) return null;
  return slug
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

type SortKey = "updated" | "reels" | "followers" | "engagement";
type LayoutMode = "gallery" | "rows";

export default function History() {
  const [, setLocation] = useLocation();
  const jobsQuery = trpc.scrape.list.useQuery(undefined, {
    refetchInterval: (q) => (listHasRunningScrapeJob(q.state.data) ? 3000 : false),
    refetchOnWindowFocus: true,
  });
  const tiktokJobsQuery = trpc.tiktokScrape.list.useQuery(undefined, {
    refetchInterval: (q) =>
      q.state.data?.some((job) => isScrapeJobInFlight(job.status)) ? 3000 : false,
    refetchOnWindowFocus: true,
  });
  const utils = trpc.useUtils();

  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [layout, setLayout] = useState<LayoutMode>("gallery");

  const deduplicatedJobs = useMemo(() => {
    const combined: HistoryJobRow[] = [
      ...(jobsQuery.data ?? []).map((job) => ({
        ...job,
        platform: "instagram" as const,
      })),
      ...(tiktokJobsQuery.data ?? []).map((job) => ({
        ...job,
        platform: "tiktok" as const,
      })),
    ];
    const handleMap = new Map<string, HistoryJobRow>();
    for (const job of combined) {
      const key = `${job.platform}:${job.handle.toLowerCase()}`;
      const existing = handleMap.get(key);
      if (!existing) {
        handleMap.set(key, job);
      } else if (jobVideoCount(job) > jobVideoCount(existing)) {
        handleMap.set(key, job);
      }
    }
    return Array.from(handleMap.values());
  }, [jobsQuery.data, tiktokJobsQuery.data]);

  const sortedJobs = useMemo(() => {
    const list = [...deduplicatedJobs];
    const engagement = (j: HistoryJobRow) => j.reelStats?.avgEngagementPct ?? 0;
    switch (sortBy) {
      case "reels":
        return list.sort((a, b) => jobVideoCount(b) - jobVideoCount(a));
      case "followers":
        return list.sort((a, b) => (b.followerCount || 0) - (a.followerCount || 0));
      case "engagement":
        return list.sort((a, b) => engagement(b) - engagement(a));
      case "updated":
      default:
        return list.sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
    }
  }, [deduplicatedJobs, sortBy]);

  const summary = useMemo(() => {
    let reels = 0;
    let followers = 0;
    let views = 0;
    for (const j of sortedJobs) {
      reels += jobVideoCount(j);
      followers += j.followerCount || 0;
      views += j.reelStats?.totalViews ?? 0;
    }
    return { accounts: sortedJobs.length, reels, followers, views };
  }, [sortedJobs]);

  const resyncMutation = trpc.scrape.resync.useMutation({
    onError: (error) => {
      toast.error("Refresh failed", { description: error.message });
    },
  });

  const handleResync = (e: React.MouseEvent, jobId: number) => {
    e.stopPropagation();
    resyncMutation.mutate(
      { jobId },
      {
        onSuccess: (data) => {
          utils.scrape.list.invalidate();
          void utils.scrape.status.invalidate({ jobId });
          void utils.reels.list.invalidate({ jobId });
          toast.success("Pulling fresh reels", {
            description: `Fetching posts since your last sync (last ${data.daysSinceSync} day${data.daysSinceSync > 1 ? "s" : ""}). New data only (not a full historical backfill).`,
          });
        },
      }
    );
  };

  const handleFailedRetry = (e: React.MouseEvent, jobId: number) => {
    e.stopPropagation();
    resyncMutation.mutate(
      { jobId },
      {
        onSuccess: () => {
          utils.scrape.list.invalidate();
          void utils.scrape.status.invalidate({ jobId });
          void utils.reels.list.invalidate({ jobId });
          toast.success("Retry started", {
            description: "We’re reconnecting and running the pipeline again.",
          });
        },
      }
    );
  };

  const deleteMutation = trpc.scrape.delete.useMutation({
    onSuccess: () => {
      toast.success("Removed from Creator Radar");
      utils.scrape.list.invalidate();
    },
    onError: (error) => {
      toast.error("Couldn’t remove", { description: error.message });
    },
  });
  const deleteTikTokMutation = trpc.tiktokScrape.delete.useMutation({
    onSuccess: () => {
      toast.success("Removed from Creator Radar");
      utils.tiktokScrape.list.invalidate();
    },
    onError: (error) => {
      toast.error("Couldn’t remove", { description: error.message });
    },
  });

  const handleDelete = (
    e: React.MouseEvent,
    jobId: number,
    handle: string,
    platform: HistoryJobRow["platform"]
  ) => {
    e.stopPropagation();
    if (
      confirm(
        `Remove @${handle} from Creator Radar? This deletes the videos stored for that research session.`
      )
    ) {
      if (platform === "instagram") {
        deleteMutation.mutate({ jobId });
      } else {
        deleteTikTokMutation.mutate({ jobId });
      }
    }
  };

  const openJob = (job: HistoryJobRow) => {
    if (job.status === "completed" || job.status === "running") {
      setLocation(
        job.platform === "instagram"
          ? `/dashboard?jobId=${job.id}&from=history`
          : `/research?platform=tiktok&jobId=${job.id}&from=history`
      );
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-2 pb-10 pt-2 sm:px-0">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
            Creator Radar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Creators you have researched
            {sortedJobs.length > 0 ? (
              <span className="hidden sm:inline">
                {" "}
                ·{" "}
                <span className="text-foreground/85">
                  {summary.accounts} tracked, {formatNumber(summary.reels)} reels
                </span>
              </span>
            ) : null}
          </p>
        </div>
        <Button asChild className="min-h-10 w-full shrink-0 sm:w-auto">
          <AppLink href="/research">
            New research
            <ArrowRight className="ml-2 h-4 w-4" />
          </AppLink>
        </Button>
      </div>

      {/* Toolbar */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sort</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="min-h-9 h-10 w-full max-w-[220px] border-border/60 bg-card text-xs sm:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Recently updated</SelectItem>
              <SelectItem value="reels">Most reels in session</SelectItem>
              <SelectItem value="followers">Largest audience</SelectItem>
              <SelectItem value="engagement">Highest avg reel engagement</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex rounded-lg border border-border/60 bg-muted/20 p-0.5">
          <Button
            type="button"
            variant={layout === "gallery" ? "secondary" : "ghost"}
            size="sm"
            className="min-h-9 px-3 text-xs"
            onClick={() => setLayout("gallery")}
          >
            <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
            Cards
          </Button>
          <Button
            type="button"
            variant={layout === "rows" ? "secondary" : "ghost"}
            size="sm"
            className="min-h-9 px-3 text-xs"
            onClick={() => setLayout("rows")}
          >
            <List className="mr-1.5 h-3.5 w-3.5" />
            Rows
          </Button>
        </div>
      </div>

      {(jobsQuery.isLoading || tiktokJobsQuery.isLoading) && (
        <div
          className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
          role="status"
          aria-label="Loading creators"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[17rem] flex-col overflow-hidden rounded-2xl border border-border/50 bg-card"
              aria-hidden
            >
              <div className="flex items-start gap-4 border-b border-border/40 bg-muted/15 p-4">
                <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-muted" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-40 animate-pulse rounded bg-muted/80" />
                </div>
              </div>
              <div className="flex-1 space-y-3 p-4">
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-10 animate-pulse rounded-lg bg-muted/70" />
                  <div className="h-10 animate-pulse rounded-lg bg-muted/70" />
                </div>
                <div className="h-9 w-full animate-pulse rounded-md bg-muted" />
              </div>
            </div>
          ))}
        </div>
      )}

      {jobsQuery.data &&
        tiktokJobsQuery.data &&
        jobsQuery.data.length === 0 &&
        tiktokJobsQuery.data.length === 0 && (
        <Card className="border-border/50 bg-card">
          <CardContent className="flex flex-col items-center justify-center gap-5 py-16">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-500/10">
              <Radar className="h-7 w-7 text-violet-400" />
            </div>
            <div className="text-center">
              <p className="text-base font-medium text-foreground">No creators tracked yet</p>
              <p className="mt-1 max-w-md text-sm text-muted-foreground">
                Start from Spy Viral Reels. Each completed Instagram or TikTok
                session lands here with metrics from that research window.
              </p>
            </div>
            <Button asChild variant="outline">
              <AppLink href="/research">Open Spy Viral Reels</AppLink>
            </Button>
          </CardContent>
        </Card>
      )}

      {sortedJobs.length > 0 && layout === "gallery" && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sortedJobs.map((job) => {
            const syncedRecently = isSyncedWithin24h(job.updatedAt);
            const stats = job.reelStats;
            const niche = jobNiche(job);
            const canOpenRadar = job.status === "completed" || job.status === "running";
            return (
              <div
                key={`${job.platform}-${job.id}`}
                role={canOpenRadar ? "button" : undefined}
                tabIndex={canOpenRadar ? 0 : undefined}
                onClick={() => {
                  if (canOpenRadar) openJob(job);
                }}
                onKeyDown={(e) => {
                  if (canOpenRadar && e.key === "Enter") openJob(job);
                }}
                className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-card text-left transition-all hover:border-primary/35 hover:shadow-lg hover:shadow-primary/5 ${
                  job.status === "failed"
                    ? "border-destructive/30 opacity-95"
                    : "border-border/50"
                } ${canOpenRadar ? "cursor-pointer" : "cursor-default"}`}
              >
                <div className="flex items-start gap-4 border-b border-border/40 bg-muted/15 p-4">
                  <div className="relative shrink-0">
                    <div
                      className={`h-14 w-14 rounded-2xl bg-muted overflow-hidden ring-2 ring-offset-2 ring-offset-background ${
                        syncedRecently && job.status === "completed" ? "ring-emerald-500/50" : "ring-border/50"
                      }`}
                    >
                      <img
                        src={
                          job.profilePicUrl ||
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(job.handle)}&background=6366f1&color=fff&size=112&bold=true&format=svg`
                        }
                        alt=""
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(job.handle)}&background=6366f1&color=fff&size=112&bold=true&format=svg`;
                        }}
                      />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-semibold text-foreground">@{job.handle}</span>
                      <Badge variant="outline" className="gap-1 text-[10px] capitalize">
                        {job.platform === "instagram" ? (
                          <Instagram className="h-2.5 w-2.5" />
                        ) : (
                          <Music2 className="h-2.5 w-2.5" />
                        )}
                        {job.platform}
                      </Badge>
                      <Badge
                        variant={
                          job.status === "completed"
                            ? "secondary"
                            : job.status === "failed"
                              ? "destructive"
                              : "outline"
                        }
                        className="text-[10px]"
                      >
                        {job.status === "running" && (
                          <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                        )}
                        {job.status === "failed"
                          ? jobStatusLabel(job)
                          : job.status === "running"
                            ? `${job.progressPercent}%`
                            : job.status}
                      </Badge>
                      {syncedRecently && job.status === "completed" ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">
                          Fresh
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Sync {timeAgo(job.updatedAt)}
                      </span>
                      <span className="hidden items-center gap-1 sm:flex">
                        <Calendar className="h-3 w-3" /> {formatDate(job.createdAt)}
                      </span>
                    </div>
                  </div>
                  {canOpenRadar ? (
                    <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-70" />
                  ) : null}
                </div>

                {niche && (
                  <div className="flex items-center gap-1 border-b border-border/30 px-4 py-2 text-[11px] text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-violet-400" />
                    <span>{niche}</span>
                  </div>
                )}

                {isScrapeJobInFlight(job.status) ? (
                  <div className="px-4 pt-3">
                    <ScrapeJobProgressUI
                      snapshot={
                        job.platform === "instagram"
                          ? runningJobProgressSnapshot(job)
                          : {
                              jobId: job.id,
                              handle: job.handle,
                              status: job.status,
                              progressPercent: job.progressPercent,
                              reelsFound: job.videosFound,
                              currentStep: job.currentStep,
                              estimatedTotal: job.estimatedTotal,
                            }
                      }
                      variant="card"
                    />
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
                  <Tooltip content="Followers captured on last profile fetch">
                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <Users className="h-3 w-3" /> Followers
                      </div>
                      <p className="mt-1 font-semibold tabular-nums text-foreground">
                        {formatNumber(job.followerCount || 0)}
                      </p>
                    </div>
                  </Tooltip>
                  <Tooltip
                    content={
                      job.platform === "instagram"
                        ? `Reels in your ${job.timeframeDays}-day scan window at scrape time`
                        : "TikTok videos collected in this research session"
                    }
                  >
                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <Film className="h-3 w-3" /> Videos
                      </div>
                      <p className="mt-1 font-semibold tabular-nums text-foreground">
                        {jobVideoCount(job)}
                      </p>
                    </div>
                  </Tooltip>
                  <Tooltip content="Instagram view counts summed for reels in this session (when available).">
                    <div className="hidden rounded-lg bg-muted/30 px-3 py-2 sm:block">
                      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <Eye className="h-3 w-3" /> Views
                      </div>
                      <p className="mt-1 font-semibold tabular-nums text-foreground">
                        {stats?.totalViews != null && stats.totalViews > 0 ? formatNumber(stats.totalViews) : "-"}
                      </p>
                    </div>
                  </Tooltip>
                  <Tooltip content="Totals across reels in this session">
                    <div className="hidden rounded-lg bg-muted/30 px-3 py-2 sm:block">
                      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <Heart className="h-3 w-3" /> Likes
                      </div>
                      <p className="mt-1 font-semibold tabular-nums text-foreground">
                        {stats?.totalLikes != null && stats.totalLikes > 0 ? formatNumber(stats.totalLikes) : "-"}
                      </p>
                    </div>
                  </Tooltip>
                  <Tooltip content="Totals across reels in this session">
                    <div className="hidden rounded-lg bg-muted/30 px-3 py-2 sm:block">
                      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        <MessageCircle className="h-3 w-3" /> Comments
                      </div>
                      <p className="mt-1 font-semibold tabular-nums text-foreground">
                        {stats?.totalComments != null && stats.totalComments > 0
                          ? formatNumber(stats.totalComments)
                          : "-"}
                      </p>
                    </div>
                  </Tooltip>
                  <Tooltip
                    content={
                      job.platform === "instagram"
                        ? "Mean of per-reel (likes + comments) divided by followers at session time"
                        : "Mean of per-video (likes + comments + shares) divided by followers at session time"
                    }
                  >
                    <div className="rounded-lg bg-muted/30 px-3 py-2">
                      <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-emerald-300/90">
                        <TrendingUp className="h-3 w-3" /> Avg ER
                      </div>
                      <p className="mt-1 font-semibold tabular-nums text-emerald-400">
                        {stats?.avgEngagementPct != null ? `${stats.avgEngagementPct.toFixed(2)}%` : "-"}
                      </p>
                    </div>
                  </Tooltip>
                </div>

                <div className="border-t border-border/40 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="hidden text-[10px] text-muted-foreground sm:block">
                      {stats?.totalViews != null && stats.totalViews > 0
                        ? `${formatNumber(stats.totalViews)} total views in session`
                        : job.platform === "instagram"
                          ? `Scan window · ${job.timeframeDays}d window`
                          : "TikTok research session"}
                    </p>
                    {canOpenRadar ? (
                      <span className="inline-flex min-h-10 items-center rounded-lg border border-primary/30 bg-primary/10 px-3 text-xs font-medium text-primary">
                        {seeCreatorsViralReelsCta(null, job.handle, { includeArrow: true })}
                      </span>
                    ) : null}
                  </div>
                  <div
                    className="mt-2 flex items-center justify-end gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {job.platform === "instagram" && job.status === "failed" && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9 gap-1 text-xs"
                        onClick={(e) => handleFailedRetry(e, job.id)}
                        disabled={resyncMutation.isPending}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${resyncMutation.isPending && resyncMutation.variables?.jobId === job.id ? "animate-spin" : ""}`}
                        />
                        Retry
                      </Button>
                    )}
                    {job.platform === "instagram" &&
                      job.status === "completed" &&
                      !syncedRecently && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="min-h-9 gap-1 text-xs"
                        onClick={(e) => handleResync(e, job.id)}
                        disabled={resyncMutation.isPending}
                      >
                        <RefreshCw
                          className={`h-3.5 w-3.5 ${resyncMutation.isPending && resyncMutation.variables?.jobId === job.id ? "animate-spin" : ""}`}
                        />
                        Refresh
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 w-10 p-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) =>
                        handleDelete(e, job.id, job.handle, job.platform)
                      }
                      disabled={
                        deleteMutation.isPending || deleteTikTokMutation.isPending
                      }
                      title="Remove from Creator Radar"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sortedJobs.length > 0 && layout === "rows" && (
        <div className="space-y-2">
          {sortedJobs.map((job) => {
            const syncedRecently = isSyncedWithin24h(job.updatedAt);
            const stats = job.reelStats;
            const niche = jobNiche(job);
            const canOpenRadar = job.status === "completed" || job.status === "running";
            return (
              <div
                key={`${job.platform}-${job.id}`}
                className={`flex flex-col gap-3 rounded-xl border border-border/50 bg-card p-4 transition-colors hover:border-border sm:flex-row sm:items-center ${
                  canOpenRadar ? "cursor-pointer hover:bg-accent/20" : ""
                }`}
                onClick={() => {
                  if (canOpenRadar) openJob(job);
                }}
              >
                <div className="flex shrink-0 items-center gap-3">
                  <div className="h-11 w-11 overflow-hidden rounded-xl bg-muted">
                    <img
                      src={
                        job.profilePicUrl ||
                        `https://ui-avatars.com/api/?name=${encodeURIComponent(job.handle)}&background=6366f1&color=fff&size=88&bold=true&format=svg`
                      }
                      alt=""
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          `https://ui-avatars.com/api/?name=${encodeURIComponent(job.handle)}&background=6366f1&color=fff&size=88&bold=true&format=svg`;
                      }}
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-foreground">@{job.handle}</span>
                      <Badge variant="outline" className="h-5 gap-1 text-[10px] capitalize">
                        {job.platform === "instagram" ? (
                          <Instagram className="h-2.5 w-2.5" />
                        ) : (
                          <Music2 className="h-2.5 w-2.5" />
                        )}
                        {job.platform}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] h-5">
                        {job.status === "running" && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
                        {job.status === "failed"
                          ? jobStatusLabel(job)
                          : job.status === "running"
                            ? `${job.progressPercent}%`
                            : job.status}
                      </Badge>
                      {niche ? (
                        <span className="text-[10px] text-muted-foreground">{niche}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      <span>{formatNumber(job.followerCount || 0)} followers</span>
                      <span>{jobVideoCount(job)} videos</span>
                      {job.platform === "instagram" ? (
                        <span className="hidden sm:inline">{job.timeframeDays}d window</span>
                      ) : null}
                      {stats?.totalViews ? (
                        <span className="hidden sm:inline">{formatNumber(stats.totalViews)} views</span>
                      ) : null}
                      {stats?.avgEngagementPct != null ? (
                        <span className="hidden text-emerald-400 sm:inline">
                          {stats.avgEngagementPct.toFixed(2)}% avg ER
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-4 text-xs text-muted-foreground sm:justify-center">
                  {isScrapeJobInFlight(job.status) ? (
                    <div className="w-full min-w-[200px] max-w-xs">
                      <ScrapeJobProgressUI
                        snapshot={
                          job.platform === "instagram"
                            ? runningJobProgressSnapshot(job)
                            : {
                                jobId: job.id,
                                handle: job.handle,
                                status: job.status,
                                progressPercent: job.progressPercent,
                                reelsFound: job.videosFound,
                                currentStep: job.currentStep,
                                estimatedTotal: job.estimatedTotal,
                              }
                        }
                        variant="card"
                      />
                    </div>
                  ) : null}
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {timeAgo(job.updatedAt)}
                  </span>
                  {syncedRecently && job.status === "completed" ? (
                    <span className="text-emerald-500 font-medium">Fresh</span>
                  ) : null}
                </div>
                <div
                  className="flex shrink-0 flex-wrap justify-end gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  {job.platform === "instagram" && job.status === "failed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9 gap-1.5 text-xs"
                      onClick={(e) => handleFailedRetry(e, job.id)}
                      disabled={resyncMutation.isPending}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${resyncMutation.isPending && resyncMutation.variables?.jobId === job.id ? "animate-spin" : ""}`} />
                      Retry
                    </Button>
                  )}
                  {job.platform === "instagram" &&
                    job.status === "completed" &&
                    !syncedRecently && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-9 gap-1.5 text-xs"
                      onClick={(e) => handleResync(e, job.id)}
                      disabled={resyncMutation.isPending}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${resyncMutation.isPending && resyncMutation.variables?.jobId === job.id ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                  )}
                  {canOpenRadar ? (
                    <Button variant="outline" size="sm" className="min-h-9 text-xs" onClick={() => openJob(job)}>
                      Open
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 p-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) =>
                      handleDelete(e, job.id, job.handle, job.platform)
                    }
                    disabled={
                      deleteMutation.isPending || deleteTikTokMutation.isPending
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
