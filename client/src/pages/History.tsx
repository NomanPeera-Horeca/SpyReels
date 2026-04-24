import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { useLocation } from "wouter";
import {
  History as HistoryIcon,
  Film,
  ArrowRight,
  Loader2,
  Clock,
  Calendar,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useMemo } from "react";

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
      return "Account too large to scrape";
    case "unknown":
    default:
      return "Failed";
  }
}

export default function History() {
  const [, setLocation] = useLocation();
  const jobsQuery = trpc.scrape.list.useQuery();
  const utils = trpc.useUtils();

  // Deduplicate: group by handle (case-insensitive), keep the latest (most reels or most recent) per handle
  const deduplicatedJobs = useMemo(() => {
    if (!jobsQuery.data) return [];
    const handleMap = new Map<string, typeof jobsQuery.data[number]>();
    // Jobs are already sorted by createdAt desc, so first occurrence is latest
    for (const job of jobsQuery.data) {
      const key = job.handle.toLowerCase();
      const existing = handleMap.get(key);
      if (!existing) {
        handleMap.set(key, job);
      } else {
        // Keep the one with more reels, or the more recent one
        if (job.totalReels > existing.totalReels) {
          handleMap.set(key, job);
        }
      }
    }
    return Array.from(handleMap.values());
  }, [jobsQuery.data]);

  const resyncMutation = trpc.scrape.resync.useMutation({
    onError: (error) => {
      toast.error("Re-sync failed", { description: error.message });
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
          toast.success("Re-syncing started", {
            description: `Fetching reels from the last ${data.daysSinceSync} day${data.daysSinceSync > 1 ? "s" : ""}...`,
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
            description: "The scrape is running again in the background.",
          });
        },
      }
    );
  };

  const deleteMutation = trpc.scrape.delete.useMutation({
    onSuccess: () => {
      toast.success("Removed from monitoring");
      utils.scrape.list.invalidate();
    },
    onError: (error) => {
      toast.error("Failed to remove", { description: error.message });
    },
  });

  const handleDelete = (e: React.MouseEvent, jobId: number, handle: string) => {
    e.stopPropagation();
    if (confirm(`Remove @${handle} from monitoring? This will also delete all scraped reels for this job.`)) {
      deleteMutation.mutate({ jobId });
    }
  };

  return (
    <div className="max-w-4xl mx-auto pt-4">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <HistoryIcon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Account Monitoring
            </h1>
            <p className="text-sm text-muted-foreground">
              Track your research jobs and monitor competitor accounts.
            </p>
          </div>
        </div>
        <Button onClick={() => setLocation("/")} size="sm">
          New Scrape
        </Button>
      </div>

      {jobsQuery.isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      )}

      {jobsQuery.data && jobsQuery.data.length === 0 && (
        <Card className="border-border/50 bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Film className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">No scrape jobs yet.</p>
            <Button variant="outline" onClick={() => setLocation("/")}>
              Start your first scrape
            </Button>
          </CardContent>
        </Card>
      )}

      {deduplicatedJobs.length > 0 && (
        <div className="space-y-2">
          {deduplicatedJobs.map((job) => {
            const syncedRecently = isSyncedWithin24h(job.updatedAt);
            return (
              <div
                key={job.id}
                className="flex items-center gap-4 rounded-lg border border-border/50 bg-card p-4 hover:border-border transition-colors cursor-pointer group"
                onClick={() => {
                  if (job.status === "completed" || job.status === "running") {
                    setLocation(`/dashboard?jobId=${job.id}&from=history`);
                  }
                }}
              >
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0 overflow-hidden">
                  <img
                    src={job.profilePicUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(job.handle)}&background=6d28d9&color=fff&size=80&bold=true&format=svg`}
                    alt={job.handle}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(job.handle)}&background=6d28d9&color=fff&size=80&bold=true&format=svg`;
                    }}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">
                      @{job.handle}
                    </span>
                    <Badge
                      variant={
                        job.status === "completed"
                          ? "default"
                          : job.status === "failed"
                          ? "destructive"
                          : "secondary"
                      }
                      className="text-[10px] h-5"
                    >
                      {job.status === "running" && (
                        <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />
                      )}
                      {job.status}
                    </Badge>
                    {syncedRecently && job.status === "completed" && (
                      <span className="text-[10px] text-green-500 font-medium">Up to date</span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Film className="h-3 w-3" />
                      {job.totalReels} reels
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      Synced {timeAgo(job.updatedAt)}
                    </span>
                    <span className="flex items-center gap-1 hidden sm:flex">
                      <Calendar className="h-3 w-3" />
                      {formatDate(job.createdAt)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {job.status === "failed" && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={(e) => handleFailedRetry(e, job.id)}
                      disabled={resyncMutation.isPending}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${resyncMutation.isPending && resyncMutation.variables?.jobId === job.id ? "animate-spin" : ""}`} />
                      Retry
                    </Button>
                  )}
                  {job.status === "completed" && !syncedRecently && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 text-xs"
                      onClick={(e) => handleResync(e, job.id)}
                      disabled={resyncMutation.isPending}
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${resyncMutation.isPending && resyncMutation.variables?.jobId === job.id ? "animate-spin" : ""}`} />
                      Re-sync
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={(e) => handleDelete(e, job.id, job.handle)}
                    disabled={deleteMutation.isPending}
                    title="Remove from monitoring"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
