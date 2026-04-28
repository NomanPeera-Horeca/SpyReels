import { useState, useMemo, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bookmark,
  BookmarkX,
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
  Zap,
  Info,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { mergeRemakeability } from "@/lib/remakeability";
import Tooltip from "@/components/Tooltip";
import {
  InlineWorkflow,
  formatNumber,
  formatPostedTime,
  formatDuration,
} from "@/components/InlineWorkflow";

// SavedReels uses formatDuration for mm:ss display (different from shared)
function formatDurationShort(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// InlineWorkflow is imported from @/components/InlineWorkflow
// Removed: local InlineWorkflow, StructureBlock, ScriptWithCues, GRADE_OPTIONS, DURATION_OPTIONS, TIME_OPTIONS,
//          formatTimestamp, segmentsToSRT, formatTimingDuration, formatPostedTime, formatNumber

// ── Main Component ──


export default function SavedReels() {
  const [, setLocation] = useLocation();
  const savedQuery = trpc.saved.list.useQuery();
  const prefsQuery = trpc.preferences.get.useQuery();
  const userTimezone = prefsQuery.data?.timezone || "America/Chicago";
  const utils = trpc.useUtils();

  const [expandedReel, setExpandedReel] = useState<number | null>(null);
  const [batchTranscribing, setBatchTranscribing] = useState(false);
  const [sortBy, setSortBy] = useState("date");

  const unsaveMutation = trpc.saved.toggle.useMutation({
    onSuccess: () => {
      utils.saved.list.invalidate();
      toast.success("Reel removed from saved");
    },
  });

  const transcribeMutation = trpc.transcribe.start.useMutation({
    onSuccess: () => {
      utils.saved.list.invalidate();
    },
  });

  const savedReels = savedQuery.data || [];

  const sortedReels = useMemo(() => {
    const all = [...savedReels];
    switch (sortBy) {
      case "views":
        return all.sort((a, b) => (b.reel.viewCount || 0) - (a.reel.viewCount || 0));
      case "likes":
        return all.sort((a, b) => (b.reel.likeCount || 0) - (a.reel.likeCount || 0));
      case "engagement":
        const getEng = (item: typeof all[0]) =>
          item.job.followerCount
            ? ((item.reel.likeCount || 0) + (item.reel.commentCount || 0)) / item.job.followerCount * 100
            : 0;
        return all.sort((a, b) => getEng(b) - getEng(a));
      case "date":
      default:
        return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [savedReels, sortBy]);

  // Group by source + handle so a handle that exists in both a user's
  // scrape jobs AND the featured catalog renders as two separate sections
  // — they have different navigation targets and different id keyspaces.
  const groupedByHandle: Record<string, typeof sortedReels> = {};
  for (const item of sortedReels) {
    const groupKey = `${item.source}:${item.job.handle}`;
    if (!groupedByHandle[groupKey]) groupedByHandle[groupKey] = [];
    groupedByHandle[groupKey].push(item);
  }

  const handleTranscribeAll = async () => {
    const untranscribed = savedReels.filter((item) => !item.transcription || item.transcription.status !== "completed");
    if (untranscribed.length === 0) {
      toast.info("All saved reels are already transcribed!");
      return;
    }
    setBatchTranscribing(true);
    let started = 0;
    for (const item of untranscribed) {
      try {
        // Route to the right transcribe input based on the saved row's
        // source; `saved.list` guarantees exactly one of reelId / featuredReelId.
        if (item.source === "featured" && item.featuredReelId != null) {
          await transcribeMutation.mutateAsync({ featuredReelId: item.featuredReelId });
          started++;
        } else if (item.reelId != null) {
          await transcribeMutation.mutateAsync({ reelId: item.reelId });
          started++;
        }
      } catch { /* continue */ }
    }
    setBatchTranscribing(false);
    toast.success(`Started transcription for ${started} reel${started !== 1 ? "s" : ""}`);
    utils.saved.list.invalidate();
  };

  const untranscribedCount = savedReels.filter((item) => !item.transcription || item.transcription.status !== "completed").length;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Bookmark className="h-6 w-6 text-primary" />
            Saved Reels
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {savedReels.length} reel{savedReels.length !== 1 ? "s" : ""} saved across {Object.keys(groupedByHandle).length} account{Object.keys(groupedByHandle).length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Sort by..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Recently Saved</SelectItem>
              <SelectItem value="views">Most Views</SelectItem>
              <SelectItem value="likes">Most Likes</SelectItem>
              <SelectItem value="engagement">Highest Engagement</SelectItem>
            </SelectContent>
          </Select>

          {savedReels.length > 0 && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleTranscribeAll} disabled={batchTranscribing || untranscribedCount === 0}>
              {batchTranscribing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Zap className="mr-1.5 h-3.5 w-3.5" />}
              {untranscribedCount > 0 ? `Transcribe All (${untranscribedCount})` : "All Transcribed"}
            </Button>
          )}
        </div>
      </div>

      {savedQuery.isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )}

      {!savedQuery.isLoading && savedReels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bookmark className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <h2 className="text-lg font-medium text-foreground mb-2">No saved reels yet</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Save reels from the Dashboard by clicking the bookmark icon. Saved reels appear here for quick access.
          </p>
        </div>
      )}

      {Object.entries(groupedByHandle).map(([groupKey, items]) => {
        const handle = groupKey.split(":").slice(1).join(":");
        // Handle click target depends on the source: scraped rows jump to
        // the scrape-job dashboard, featured rows to the instant Path-B
        // dashboard. We pick the first item's source as representative;
        // groups are already keyed on handle so they can't mix.
        const headerHref =
          items[0].source === "featured" && items[0].job.featuredAccountId != null
            ? `/dashboard?featuredAccountId=${items[0].job.featuredAccountId}`
            : items[0].jobId != null
            ? `/dashboard?jobId=${items[0].jobId}`
            : null;
        return (
        <div key={groupKey} className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <button
              onClick={() => headerHref && setLocation(headerHref)}
              disabled={!headerHref}
              className="text-lg font-semibold text-foreground hover:text-primary transition-colors disabled:opacity-60"
            >
              @{handle}
            </button>
            <Badge variant="outline" className="text-xs">{items.length} saved</Badge>
            {items[0].source === "featured" && (
              <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">Featured</Badge>
            )}
            {items[0].job.followerCount ? (
              <span className="text-xs text-muted-foreground">{formatNumber(items[0].job.followerCount)} followers</span>
            ) : null}
          </div>

          <div className="space-y-1">
            {items.map((item) => {
              const reel = item.reel;
              const engagementRate = item.job.followerCount
                ? (((reel.likeCount || 0) + (reel.commentCount || 0)) / item.job.followerCount) * 100
                : null;
              // `rowKey` discriminates expanded state between scraped and
              // featured rows (they can share a numeric id across tables).
              // For 3b we fall back to reelId; 3c makes this source-aware.
              const rowKey = item.reelId ?? item.featuredReelId ?? 0;
              const isExpanded = expandedReel === rowKey;
              const hasTranscript = !!item.transcription && item.transcription.status === "completed";
              const isProcessing = item.transcription?.status === "processing";
              const rowNotRemakeable = mergeRemakeability(
                item.transcription,
                item.reel
              ).notRemakeable;

              return (
                <div key={item.id} className="rounded-lg border border-border bg-card overflow-hidden">
                  <div
                    className={`flex items-center gap-2 sm:gap-4 p-2 sm:p-3 hover:bg-accent/30 transition-colors cursor-pointer ${isExpanded ? "bg-accent/20" : ""}`}
                    onClick={() => setExpandedReel(isExpanded ? null : rowKey)}
                  >
                    {/* Thumbnail */}
                    <div className="relative w-16 h-20 rounded-md overflow-hidden bg-muted shrink-0">
                      {reel.thumbnailUrl ? (
                        <img src={reel.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Film className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      {reel.duration && (
                        <span className="absolute bottom-1 left-1 text-[10px] bg-black/70 text-white px-1 rounded">
                          {formatDurationShort(reel.duration)}
                        </span>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground line-clamp-2 leading-snug">{reel.caption || "No caption"}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><Eye className="h-3 w-3" /> {formatNumber(reel.viewCount || 0)}</span>
                        <span className="flex items-center gap-1"><Heart className="h-3 w-3" /> {formatNumber(reel.likeCount || 0)}</span>
                        <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" /> {formatNumber(reel.commentCount || 0)}</span>
                        {engagementRate !== null && (
                          <span className="flex items-center gap-1 text-emerald-400"><TrendingUp className="h-3 w-3" /> {engagementRate.toFixed(2)}%</span>
                        )}
                        {reel.postedAt && (
                          <span className="flex items-center gap-1 text-amber-400/80">
                            <Clock className="h-3 w-3" /> {formatPostedTime(reel.postedAt, userTimezone)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-0.5 sm:gap-1 shrink-0 flex-wrap justify-end" onClick={(e) => e.stopPropagation()}>
                      <Button variant={hasTranscript ? "ghost" : "outline"} size="sm" className="h-7 text-xs" onClick={() => {
                        if (hasTranscript || isProcessing) {
                          setExpandedReel(rowKey);
                        } else if (item.source === "featured" && item.featuredReelId != null) {
                          transcribeMutation.mutate({ featuredReelId: item.featuredReelId });
                          toast.info("Transcription started...");
                          setExpandedReel(rowKey);
                        } else if (item.reelId != null) {
                          transcribeMutation.mutate({ reelId: item.reelId });
                          toast.info("Transcription started...");
                          setExpandedReel(rowKey);
                        }
                      }} disabled={transcribeMutation.isPending}>
                        <FileText className="h-3 w-3 sm:mr-1" />
                        <span className="hidden sm:inline">{hasTranscript ? "Transcript" : isProcessing ? "Transcribing..." : "Transcribe"}</span>
                      </Button>

                      {hasTranscript && (
                        rowNotRemakeable ? (
                          <p className="text-[10px] sm:text-xs italic text-muted-foreground text-right leading-tight max-w-[5.5rem] sm:max-w-none self-center flex items-center justify-end gap-1">
                            <span>Saved as inspiration</span>
                            {reel.classificationReason?.trim() ? (
                              <Tooltip content={reel.classificationReason.trim()}>
                                <span className="inline-flex cursor-help shrink-0">
                                  <Info className="h-3 w-3 text-muted-foreground/70" aria-hidden />
                                </span>
                              </Tooltip>
                            ) : null}
                          </p>
                        ) : (
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={() => setExpandedReel(rowKey)}>
                            <Wand2 className="h-3 w-3 sm:mr-1" /> <span className="hidden sm:inline">Re-Create</span>
                          </Button>
                        )
                      )}

                      {reel.reelUrl && (
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => window.open(reel.reelUrl, "_blank")} title="Open on Instagram">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpandedReel(isExpanded ? null : rowKey)}>
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => {
                          if (item.source === "featured" && item.featuredReelId != null) {
                            unsaveMutation.mutate({ featuredReelId: item.featuredReelId });
                          } else if (item.reelId != null && item.jobId != null) {
                            unsaveMutation.mutate({ reelId: item.reelId, jobId: item.jobId });
                          }
                        }}
                        disabled={unsaveMutation.isPending}
                        title="Remove from saved"
                      >
                        <BookmarkX className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded inline workflow — source-aware. */}
                  {isExpanded && item.source === "featured" && item.featuredReelId != null && (
                    <InlineWorkflow
                      reelSource="featured"
                      featuredReelId={item.featuredReelId}
                      handle={handle}
                      hasTranscription={hasTranscript}
                      isProcessing={!!isProcessing}
                      inspirationPanelVariant="saved-collected"
                      listRemakeHint={mergeRemakeability(item.transcription, item.reel)}
                      reelClassification={item.reel}
                      onTranscribe={() => {
                        if (item.featuredReelId != null) {
                          transcribeMutation.mutate({ featuredReelId: item.featuredReelId });
                          toast.info("Transcription started...");
                        }
                      }}
                      userTimezone={userTimezone}
                      postedAt={reel.postedAt}
                    />
                  )}
                  {isExpanded && item.source === "scraped" && item.reelId != null && (
                    <InlineWorkflow
                      reelSource="user_job"
                      reelId={item.reelId}
                      handle={handle}
                      hasTranscription={hasTranscript}
                      isProcessing={!!isProcessing}
                      inspirationPanelVariant="saved-collected"
                      listRemakeHint={mergeRemakeability(item.transcription, item.reel)}
                      reelClassification={item.reel}
                      onTranscribe={() => {
                        if (item.reelId != null) {
                          transcribeMutation.mutate({ reelId: item.reelId });
                          toast.info("Transcription started...");
                        }
                      }}
                      userTimezone={userTimezone}
                      postedAt={reel.postedAt}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
        );
      })}
    </div>
  );
}

