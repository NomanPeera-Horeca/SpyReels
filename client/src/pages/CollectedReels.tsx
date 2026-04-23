import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { usePostHog } from "@posthog/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Inbox,
  ExternalLink,
  Eye,
  Heart,
  MessageCircle,
  TrendingUp,
  Clock,
  Film,
  FileText,
  Wand2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Trash2,
  Plus,
  RefreshCw,
  Send,
  AlertCircle,
  Link2,
  Calendar,
  ArrowUpDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  InlineWorkflow,
  formatNumber,
  formatPostedTime,
  formatDuration,
} from "@/components/InlineWorkflow";

function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Date filter options matching Account Monitoring
const DATE_FILTERS = [
  { value: "all", label: "All Time" },
  { value: "7", label: "Last 7 Days" },
  { value: "14", label: "Last 14 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "60", label: "Last 60 Days" },
  { value: "90", label: "Last 90 Days" },
  { value: "180", label: "Last 180 Days" },
];

// Sort options matching Account Monitoring
const SORT_OPTIONS = [
  { value: "views", label: "Highest Views", icon: Eye },
  { value: "likes", label: "Highest Likes", icon: Heart },
  { value: "comments", label: "Highest Comments", icon: MessageCircle },
  { value: "engagement", label: "Highest Engagement Rate", icon: TrendingUp },
  { value: "date_newest", label: "Date (Newest)", icon: Calendar },
  { value: "date_oldest", label: "Date (Oldest)", icon: Calendar },
];

export default function CollectedReels() {
  const posthog = usePostHog();
  const collectedQuery = trpc.collected.list.useQuery(undefined, {
    refetchInterval: 5000, // Poll for updates from Telegram bot
  });
  const prefsQuery = trpc.preferences.get.useQuery();
  const telegramQuery = trpc.telegram.status.useQuery();
  const userTimezone = prefsQuery.data?.timezone || "America/Chicago";
  const utils = trpc.useUtils();

  const [expandedReel, setExpandedReel] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState("date_newest");
  const [dateFilter, setDateFilter] = useState("all");
  const [urlInput, setUrlInput] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);

  // Track pending transcriptions (in-session only, for loading state)
  const [pendingTranscriptions, setPendingTranscriptions] = useState<
    Set<number>
  >(new Set());

  const deleteMutation = trpc.collected.delete.useMutation({
    onSuccess: () => {
      utils.collected.list.invalidate();
      toast.success("Reel removed from collection");
    },
  });

  const addByUrlMutation = trpc.collected.addByUrl.useMutation({
    onSuccess: data => {
      utils.collected.list.invalidate();
      if (data.duplicate) {
        toast.info("This reel is already in your collection");
      } else {
        posthog?.capture("reel_added_by_url");
        toast.success("Reel added! Fetching metadata...");
      }
      setUrlInput("");
    },
    onError: err => {
      toast.error(err.message);
    },
  });

  const retryMutation = trpc.collected.retry.useMutation({
    onSuccess: () => {
      utils.collected.list.invalidate();
      toast.success("Refreshing reel data...");
    },
  });

  const refreshAllMutation = trpc.collected.refreshAll.useMutation({
    onSuccess: data => {
      utils.collected.list.invalidate();
      if (data.refreshed > 0) {
        toast.success(`Refreshing ${data.refreshed} reel(s)...`);
      } else {
        toast.info("All reels are up to date");
      }
    },
  });

  const transcribeMutation = trpc.collected.transcribe.useMutation({
    onSuccess: (data, variables) => {
      posthog?.capture("reel_transcribed", {
        collected_reel_id: variables.collectedReelId,
      });
      setPendingTranscriptions(prev => {
        const next = new Set(prev);
        next.add(variables.collectedReelId);
        return next;
      });
      utils.collected.list.invalidate();
    },
    onError: err => {
      toast.error(err.message);
    },
  });

  const collectedReels = collectedQuery.data || [];

  // Apply date filter (by posted date)
  const filteredReels = useMemo(() => {
    if (dateFilter === "all") return collectedReels;
    const days = parseInt(dateFilter);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return collectedReels.filter(r => {
      if (!r.postedAt) return false;
      return new Date(r.postedAt).getTime() >= cutoff.getTime();
    });
  }, [collectedReels, dateFilter]);

  // Helper to get the best available view count (cross-referenced from Account Monitoring, or collected reel's own)
  const getEffectiveViews = (item: (typeof collectedReels)[0]) => {
    if (item.monitoredViewCount && item.monitoredViewCount > 0)
      return item.monitoredViewCount;
    return item.viewCount || 0;
  };
  // Helper to get engagement rate using cross-referenced follower count or collected reel's own
  const getEngagementRate = (item: (typeof collectedReels)[0]) => {
    const views = getEffectiveViews(item);
    const followerCount =
      item.monitoredFollowerCount || item.ownerFollowerCount;
    if (!followerCount || followerCount === 0) return null;
    return (
      (((item.likeCount || 0) + (item.commentCount || 0)) / followerCount) * 100
    );
  };

  // Apply sort
  const sortedReels = useMemo(() => {
    const all = [...filteredReels];

    switch (sortBy) {
      case "views":
        return all.sort((a, b) => getEffectiveViews(b) - getEffectiveViews(a));
      case "likes":
        return all.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
      case "comments":
        return all.sort(
          (a, b) => (b.commentCount || 0) - (a.commentCount || 0)
        );
      case "engagement":
        return all.sort(
          (a, b) => (getEngagementRate(b) || 0) - (getEngagementRate(a) || 0)
        );
      case "date_oldest":
        return all.sort((a, b) => {
          const aTime = a.postedAt ? new Date(a.postedAt).getTime() : 0;
          const bTime = b.postedAt ? new Date(b.postedAt).getTime() : 0;
          return aTime - bTime;
        });
      case "date_newest":
      default:
        return all.sort((a, b) => {
          const aTime = a.postedAt
            ? new Date(a.postedAt).getTime()
            : new Date(a.createdAt).getTime();
          const bTime = b.postedAt
            ? new Date(b.postedAt).getTime()
            : new Date(b.createdAt).getTime();
          return bTime - aTime;
        });
    }
  }, [filteredReels, sortBy]);

  // Group by source for stats
  const telegramReels = collectedReels.filter(r => r.source === "telegram");

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    setAddingUrl(true);
    addByUrlMutation.mutate(
      { url: urlInput.trim() },
      {
        onSettled: () => setAddingUrl(false),
      }
    );
  };

  const isTelegramConnected = telegramQuery.data?.connected;
  const botUsername = telegramQuery.data?.botUsername;

  // Get the current sort option for display
  const currentSortOption =
    SORT_OPTIONS.find(o => o.value === sortBy) || SORT_OPTIONS[4];

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Inbox className="h-6 w-6 text-primary" />
            Collected Reels
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {collectedReels.length} reel{collectedReels.length !== 1 ? "s" : ""}{" "}
            collected
            {telegramReels.length > 0 &&
              ` (${telegramReels.length} from Telegram)`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {collectedReels.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => refreshAllMutation.mutate()}
              disabled={refreshAllMutation.isPending}
            >
              {refreshAllMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Refresh All
            </Button>
          )}

          {/* Date Filter */}
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              {DATE_FILTERS.map(f => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Sort Options */}
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-52 h-8 text-xs">
              <div className="flex items-center gap-1.5">
                {currentSortOption && (
                  <currentSortOption.icon className="h-3 w-3" />
                )}
                <span>{currentSortOption?.label}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  <div className="flex items-center gap-2">
                    <opt.icon className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{opt.label}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Telegram Connection Banner */}
      {!telegramQuery.isLoading && !isTelegramConnected && (
        <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
          <div className="flex items-start gap-3">
            <Send className="h-5 w-5 text-blue-400 mt-0.5 shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-foreground mb-1">
                Connect Telegram to Collect Reels from Mobile
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                Share Instagram Reel links directly from your phone to the
                SpyReels Telegram bot. They'll appear here automatically for
                transcription and script generation.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10"
                onClick={() => (window.location.href = "/settings")}
              >
                <Send className="mr-1.5 h-3 w-3" />
                Connect Telegram in Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Connected Banner */}
      {isTelegramConnected && (
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <Send className="h-3.5 w-3.5" />
            <span>
              Telegram connected
              {botUsername ? `: share Reel links to @${botUsername}` : ""}.
              They'll appear here automatically.
            </span>
          </div>
        </div>
      )}

      {/* Quick Add URL */}
      <div className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Paste Instagram Reel URL here..."
            value={urlInput}
            onChange={e => setUrlInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleAddUrl()}
            className="pl-9 h-9 text-sm"
          />
        </div>
        <Button
          size="sm"
          className="h-9 px-4"
          onClick={handleAddUrl}
          disabled={addingUrl || !urlInput.trim()}
        >
          {addingUrl ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="mr-1.5 h-3.5 w-3.5" />
          )}
          Add Reel
        </Button>
      </div>

      {/* Loading */}
      {collectedQuery.isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty State */}
      {!collectedQuery.isLoading && collectedReels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-medium text-foreground mb-2">
            No collected reels yet
          </h2>
          <p className="text-sm text-muted-foreground max-w-md mb-4">
            Collect reels by sharing Instagram links to the Telegram bot from
            your phone, or paste URLs above. Then transcribe and generate
            scripts right here.
          </p>
          <div className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                1
              </span>
              <span>See a viral Reel on Instagram</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                2
              </span>
              <span>Tap Share → Share to Telegram → SpyReels Bot</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                3
              </span>
              <span>It appears here. Transcribe and re-create.</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter result count when filtered */}
      {!collectedQuery.isLoading && dateFilter !== "all" && (
        <p className="text-xs text-muted-foreground mb-3">
          Showing {sortedReels.length} of {collectedReels.length} reels
        </p>
      )}

      {/* Reel List */}
      <div className="space-y-1">
        {sortedReels.map(reel => {
          const effectiveViews = getEffectiveViews(reel);
          const engagementRate = getEngagementRate(reel);
          const isExpanded = expandedReel === reel.id;
          const isPending = reel.status === "pending";
          const isFailed = reel.status === "failed";
          const isReady = reel.status === "ready";

          // Transcription state: from server data (persisted) or pending in-session
          const hasTranscription =
            reel.transcriptionStatus === "completed" &&
            !!reel.transcriptionReelId;
          const isTranscriptionProcessing =
            reel.transcriptionStatus === "processing" ||
            pendingTranscriptions.has(reel.id);
          const mappedReelId = reel.transcriptionReelId;

          return (
            <div
              key={reel.id}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <div
                className={`flex items-center gap-3 sm:gap-4 p-2 sm:p-3 hover:bg-accent/30 transition-colors cursor-pointer ${isExpanded ? "bg-accent/20" : ""}`}
                onClick={() =>
                  isReady && setExpandedReel(isExpanded ? null : reel.id)
                }
              >
                {/* Thumbnail - fixed sizing to prevent cutoff */}
                <div className="relative w-16 h-20 rounded-md overflow-hidden bg-muted shrink-0 flex-none">
                  {reel.thumbnailUrl ? (
                    <img
                      src={reel.thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      {isPending ? (
                        <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />
                      ) : (
                        <Film className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  )}
                  {reel.duration && (
                    <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 text-white px-1 rounded">
                      {formatDurationShort(reel.duration)}
                    </span>
                  )}
                  {/* Source badge */}
                  <span className="absolute top-1 right-1 text-[9px] bg-black/70 text-white px-1 rounded">
                    {reel.source === "telegram"
                      ? "TG"
                      : reel.source === "extension"
                        ? "EXT"
                        : "URL"}
                  </span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  {isPending && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Fetching reel data...</span>
                    </div>
                  )}
                  {isFailed && (
                    <div className="flex items-center gap-2 text-sm text-destructive">
                      <AlertCircle className="h-3.5 w-3.5" />
                      <span>
                        {reel.errorMessage || "Failed to fetch reel data"}
                      </span>
                    </div>
                  )}
                  {isReady && (
                    <>
                      <div className="flex items-center gap-2 mb-0.5">
                        {reel.ownerUsername && (
                          <span className="text-xs font-medium text-primary">
                            @{reel.ownerUsername}
                          </span>
                        )}
                        {hasTranscription && (
                          <span className="text-[9px] font-medium bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">
                            Transcribed
                          </span>
                        )}
                        {isTranscriptionProcessing && !hasTranscription && (
                          <span className="text-[9px] font-medium bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded-full animate-pulse">
                            Processing
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-foreground line-clamp-2 leading-snug">
                        {reel.caption || "No caption"}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        {effectiveViews > 0 && (
                          <span className="flex items-center gap-1">
                            <Eye className="h-3 w-3" />{" "}
                            {formatNumber(effectiveViews)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" />{" "}
                          {formatNumber(reel.likeCount || 0)}
                        </span>
                        <span className="flex items-center gap-1">
                          <MessageCircle className="h-3 w-3" />{" "}
                          {formatNumber(reel.commentCount || 0)}
                        </span>
                        {engagementRate !== null && engagementRate > 0 && (
                          <span className="flex items-center gap-1 text-emerald-400">
                            <TrendingUp className="h-3 w-3" />{" "}
                            {engagementRate.toFixed(2)}%
                          </span>
                        )}
                        {reel.postedAt && (
                          <span className="flex items-center gap-1 text-amber-400/80">
                            <Clock className="h-3 w-3" />{" "}
                            {formatPostedTime(reel.postedAt, userTimezone)}
                          </span>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Actions */}
                <div
                  className="flex items-center gap-0.5 sm:gap-1 shrink-0 flex-wrap justify-end"
                  onClick={e => e.stopPropagation()}
                >
                  {isFailed && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => retryMutation.mutate({ id: reel.id })}
                      disabled={retryMutation.isPending}
                    >
                      <RefreshCw className="h-3 w-3 sm:mr-1" />{" "}
                      <span className="hidden sm:inline">Retry</span>
                    </Button>
                  )}

                  {isPending && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled
                    >
                      <Loader2 className="mr-1 h-3 w-3 animate-spin" />{" "}
                      Fetching...
                    </Button>
                  )}

                  {isReady && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => retryMutation.mutate({ id: reel.id })}
                      disabled={retryMutation.isPending}
                    >
                      {retryMutation.isPending ? (
                        <Loader2 className="h-3 w-3 sm:mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3 sm:mr-1" />
                      )}
                      <span className="hidden sm:inline">Refresh</span>
                    </Button>
                  )}

                  {isReady && (
                    <>
                      {hasTranscription ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setExpandedReel(reel.id)}
                        >
                          <FileText className="h-3 w-3 sm:mr-1" />
                          <span className="hidden sm:inline">Transcript</span>
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => {
                            transcribeMutation.mutate({
                              collectedReelId: reel.id,
                            });
                            toast.info("Transcription started...");
                            setExpandedReel(reel.id);
                          }}
                          disabled={
                            transcribeMutation.isPending ||
                            isTranscriptionProcessing
                          }
                        >
                          {isTranscriptionProcessing ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              <span className="hidden sm:inline">
                                Transcribing...
                              </span>
                            </>
                          ) : (
                            <>
                              <FileText className="h-3 w-3 sm:mr-1" />
                              <span className="hidden sm:inline">
                                Transcribe
                              </span>
                            </>
                          )}
                        </Button>
                      )}

                      {hasTranscription && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs border-primary/30 text-primary hover:bg-primary/10"
                          onClick={() => setExpandedReel(reel.id)}
                        >
                          <Wand2 className="h-3 w-3 sm:mr-1" />{" "}
                          <span className="hidden sm:inline">Re-Create</span>
                        </Button>
                      )}
                    </>
                  )}

                  {reel.reelUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => window.open(reel.reelUrl, "_blank")}
                      title="Open on Instagram"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {isReady && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        setExpandedReel(isExpanded ? null : reel.id)
                      }
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate({ id: reel.id })}
                    disabled={deleteMutation.isPending}
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Expanded inline workflow - show when transcription exists */}
              {isExpanded && mappedReelId && (
                <CollectedReelWorkflow
                  collectedReelId={reel.id}
                  reelId={mappedReelId}
                  handle={reel.ownerUsername || "unknown"}
                  userTimezone={userTimezone}
                  postedAt={reel.postedAt || new Date()}
                />
              )}

              {/* Expanded but no transcription yet - show transcribe prompt */}
              {isExpanded && !mappedReelId && isReady && (
                <div className="p-4 border-t border-border bg-accent/10">
                  <div className="text-center py-4">
                    <FileText className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">
                      Transcribe this reel first to unlock Re-Create and script
                      generation.
                    </p>
                    <Button
                      size="sm"
                      onClick={() => {
                        transcribeMutation.mutate({ collectedReelId: reel.id });
                        toast.info("Transcription started...");
                      }}
                      disabled={
                        transcribeMutation.isPending ||
                        isTranscriptionProcessing
                      }
                    >
                      {transcribeMutation.isPending ||
                      isTranscriptionProcessing ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <FileText className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Transcribe Now
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Wrapper that polls for transcription completion and then shows InlineWorkflow.
 */
function CollectedReelWorkflow({
  collectedReelId,
  reelId,
  handle,
  userTimezone,
  postedAt,
}: {
  collectedReelId: number;
  reelId: number;
  handle: string;
  userTimezone: string;
  postedAt: Date | string;
}) {
  const transcriptionQuery = trpc.collected.transcriptionStatus.useQuery(
    { reelId },
    {
      refetchInterval: query => {
        const data = query.state.data;
        if (data && data.status === "completed") return false;
        return 3000;
      },
    }
  );

  const transcription = transcriptionQuery.data;
  const hasTranscription = transcription?.status === "completed";
  const isProcessing = transcription?.status === "processing";

  const transcribeMutation = trpc.collected.transcribe.useMutation();

  return (
    <InlineWorkflow
      reelId={reelId}
      handle={handle}
      hasTranscription={hasTranscription}
      isProcessing={!!isProcessing}
      onTranscribe={() => {
        transcribeMutation.mutate({ collectedReelId });
        toast.info("Transcription started...");
      }}
      userTimezone={userTimezone}
      postedAt={postedAt}
    />
  );
}
