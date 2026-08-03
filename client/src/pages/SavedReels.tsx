import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePostHog } from "@posthog/react";
import type { inferRouterOutputs } from "@trpc/server";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
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
  BookmarkCheck,
  Eye,
  Heart,
  MessageCircle,
  TrendingUp,
  Clock,
  ChevronDown,
  ChevronUp,
  Loader2,
  Zap,
  Grid3X3,
  List,
} from "lucide-react";
import { mergeRemakeability } from "@/lib/remakeability";
import { scriptFilmPath } from "@shared/scriptFilm";
import { useUsageGate } from "@/hooks/useUsageGate";
import {
  useLibraryRemakeChain,
  type LibraryRemakeSource,
  type LibraryRemakeStage,
} from "@/hooks/useLibraryRemakeChain";
import {
  buildLibraryOneClickRemake,
  reelClassificationFromRow,
} from "@/lib/oneClickRemakeAction";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { BrandCoachBadge } from "@/components/BrandCoachBadge";
import { useBrandCoachBatchPrefetched } from "@/hooks/useBrandCoachBatchPrefetched";
import {
  InlineWorkflow,
  formatNumber,
  formatPostedTime,
} from "@/components/InlineWorkflow";
import { ReelGridThumbnail } from "@/components/ReelGridThumbnail";
import {
  REEL_LIBRARY_INITIAL_VISIBLE,
  REEL_LIBRARY_VISIBLE_STEP,
} from "@/lib/reelLibraryPagination";
import { WorkspaceReelGridTile } from "@/components/WorkspaceReelGridTile";
import { WorkspaceReelGridSkeleton } from "@/components/WorkspaceReelGridSkeleton";
import { WORKSPACE_REEL_GRID_CLASS } from "@/lib/workspaceReelGridLayout";
import { GridReelWorkflowDialog } from "@/components/GridReelWorkflowDialog";
import {
  ReelActionButtons,
  type ReelActionSource,
} from "@/components/ReelActionButtons";

type SavedItem = inferRouterOutputs<AppRouter>["saved"]["list"][number];

type ViewMode = "list" | "grid";

type RecreateBatchEntry = { latestScriptId: number; status: string };

function reelRecreateState(
  entry: RecreateBatchEntry | undefined
): "none" | "generating" | "ready" | "failed" {
  if (!entry) return "none";
  if (entry.status === "pending" || entry.status === "processing") return "generating";
  if (entry.status === "completed") return "ready";
  return "failed";
}

function transcriptionIsNoSpeech(
  t:
    | {
        status?: string;
        transcript?: string | null;
        segments?: unknown;
        hasSpeech?: boolean;
      }
    | null
    | undefined
): boolean {
  if (!t || t.status !== "completed") return false;
  if (typeof t.hasSpeech === "boolean") return !t.hasSpeech;
  const segs = t.segments;
  const n = Array.isArray(segs) ? segs.length : 0;
  return !String(t.transcript ?? "").trim() && n === 0;
}

function engagementPercent(item: SavedItem): number {
  if (item.source === "discover") return 0;
  const fc = item.job.followerCount;
  if (!fc) return 0;
  return ((item.reel.likeCount || 0) + (item.reel.commentCount || 0)) / fc * 100;
}

function isUserJobSavedItem(item: SavedItem): boolean {
  return (item.source === "scraped" || item.source === "discover") && item.reelId != null;
}

/** Avoid id collisions between featured_reels.id and reels.id in mixed saved lists. */
function txPendingKey(item: SavedItem): string | null {
  if (item.source === "featured" && item.featuredReelId != null) return `f:${item.featuredReelId}`;
  if (item.reelId != null) return `s:${item.reelId}`;
  return null;
}

function transcribePendingKeyFromVariables(variables: {
  reelId?: number;
  featuredReelId?: number;
}): string | null {
  if (variables.featuredReelId != null) return `f:${variables.featuredReelId}`;
  if (variables.reelId != null) return `s:${variables.reelId}`;
  return null;
}

function recreateEntryForItem(
  item: SavedItem,
  scrapedMap: Record<number, RecreateBatchEntry>,
  featuredMap: Record<number, RecreateBatchEntry>
): RecreateBatchEntry | undefined {
  if (item.source === "featured") return featuredMap[item.reel.id];
  return scrapedMap[item.reel.id];
}

function savedItemToLibraryRemakeSource(item: SavedItem): LibraryRemakeSource | null {
  if (item.source === "featured" && item.featuredReelId != null) {
    return { source: "featured", featuredReelId: item.featuredReelId };
  }
  if ((item.source === "scraped" || item.source === "discover") && item.reelId != null) {
    return { source: "user", reelId: item.reelId, jobId: item.jobId ?? 0 };
  }
  return null;
}

const RECREATE_BATCH_STALE_MS = 300_000;
const RECREATE_BATCH_POLL_MS = 5_000;
const VIEW_MODE_STORAGE_KEY = "reels-dashboard:viewMode";

export default function SavedReels() {
  const posthog = usePostHog();
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const transcribeGate = useUsageGate("transcribeCount");

  const savedQuery = trpc.saved.list.useQuery(undefined, {
    /** Avoid refetch churn when switching sidebar tabs; invalidations still refresh after save/transcribe. */
    staleTime: 45_000,
    gcTime: 5 * 60_000,
  });
  const prefsQuery = trpc.preferences.get.useQuery();
  const userTimezone = prefsQuery.data?.timezone || "America/Chicago";

  const savedReels = savedQuery.data || [];
  const savedReelsRef = useRef(savedReels);
  savedReelsRef.current = savedReels;

  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "grid";
    try {
      const stored = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY);
      if (stored === "list" || stored === "grid") return stored;
    } catch {
      /* ignore */
    }
    return "grid";
  });

  const setViewModeTracked = useCallback(
    (next: ViewMode) => {
      setViewMode((prev) => {
        if (prev === next) return prev;
        posthog?.capture("view_toggled", { mode: next, page: "saved_reels" });
        try {
          window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, next);
        } catch {
          /* ignore */
        }
        return next;
      });
    },
    [posthog]
  );

  const [expandedSavedId, setExpandedSavedId] = useState<number | null>(null);
  const [gridModalSavedId, setGridModalSavedId] = useState<number | null>(null);
  /** Freeze-safe: only one grid tile mounts an inline player at a time. */
  const [inlinePlayingId, setInlinePlayingId] = useState<number | null>(null);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const [recreatePulse, setRecreatePulse] = useState<{
    reelId: number;
    nonce: number;
    openScriptId?: number;
  } | null>(null);

  const triggerRecreatePulse = useCallback((reelId: number) => {
    const list = savedReelsRef.current;
    const item = list.find((s) => s.reel.id === reelId);
    if (viewModeRef.current === "grid") {
      if (item) setGridModalSavedId(item.id);
    } else {
      if (item) setExpandedSavedId(item.id);
    }
    setRecreatePulse((prev) => ({
      reelId,
      nonce: (prev?.reelId === reelId ? prev.nonce : 0) + 1,
    }));
  }, []);

  const triggerOpenMyScript = useCallback(
    (reelId: number, openScriptId: number) => {
      if (viewModeRef.current === "grid") {
        setLocation(scriptFilmPath(openScriptId));
        return;
      }
      const list = savedReelsRef.current;
      const item = list.find((s) => s.reel.id === reelId);
      if (item) setExpandedSavedId(item.id);
      setRecreatePulse((prev) => ({
        reelId,
        nonce: (prev?.reelId === reelId ? prev.nonce : 0) + 1,
        openScriptId,
      }));
    },
    [setLocation]
  );

  const [sortBy, setSortBy] = useState("date");
  const [visibleLimit, setVisibleLimit] = useState(REEL_LIBRARY_INITIAL_VISIBLE);
  const [batchTranscribing, setBatchTranscribing] = useState(false);
  const [pendingTranscriptions, setPendingTranscriptions] = useState<Set<string>>(() => new Set());

  const transcribeInFlightRef = useRef(0);
  const [, setTranscribeInFlightBumper] = useState(0);
  const releaseTranscribeSlot = useCallback(() => {
    transcribeInFlightRef.current = Math.max(0, transcribeInFlightRef.current - 1);
    setTranscribeInFlightBumper((n) => n + 1);
  }, []);

  const libraryRemakeOnStageChange = useCallback(
    (
      _source: LibraryRemakeSource,
      stage: LibraryRemakeStage,
      prevStage: LibraryRemakeStage | undefined
    ) => {
      if (
        prevStage !== "transcribing" ||
        (stage !== "generating" && stage !== "inspiration")
      ) {
        return;
      }
      void utils.saved.list.invalidate();
      void utils.recreate.checkBatch.invalidate();
    },
    [utils]
  );

  const { libraryRemakeKey, getRemakeState, startRemake, retryRemake, startInspirationSave, VoiceGateDialog } =
    useLibraryRemakeChain({ onStageChange: libraryRemakeOnStageChange });

  const invalidateTranscriptionFollowUp = useCallback(
    (variables: { reelId?: number; featuredReelId?: number } | undefined) => {
      void utils.saved.list.invalidate();
      if (variables?.featuredReelId != null) {
        void utils.transcribe.status.invalidate({ featuredReelId: variables.featuredReelId });
      } else if (variables?.reelId != null) {
        void utils.transcribe.status.invalidate({ reelId: variables.reelId });
      }
    },
    [utils]
  );

  const startTranscription = trpc.transcribe.start.useMutation({
    onSettled: (_data, _err, variables) => {
      releaseTranscribeSlot();
      invalidateTranscriptionFollowUp(variables);
    },
    onSuccess: (data, variables) => {
      const k = transcribePendingKeyFromVariables(variables);
      if (data.status === "completed") {
        if (k != null) {
          setPendingTranscriptions((prev) => {
            const next = new Set(prev);
            next.delete(k);
            return next;
          });
        }
        toast.success("Transcription ready");
      } else {
        if (
          data.status === "processing" &&
          "queuePending" in data &&
          (data as { queuePending?: boolean }).queuePending
        ) {
          toast.info("Added to queue", {
            description: "Will start when a slot is free.",
          });
        } else {
          toast.info("Transcription started", {
            description: "Processing audio... This may take up to a minute.",
          });
        }
      }
    },
    onError: (error, variables) => {
      const k = transcribePendingKeyFromVariables(variables);
      if (k != null) {
        setPendingTranscriptions((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      }
      toast.error("Transcription failed", { description: error.message });
    },
  });

  const gridRecreateGenerate = trpc.recreate.generate.useMutation({
    onSuccess: () => {
      void utils.recreate.checkBatch.invalidate();
    },
    onError: (error) => {
      toast.error("Script generation failed", { description: error.message });
    },
  });

  const runGridMakeVersion = useCallback(
    (item: SavedItem) => {
      if (item.source === "featured" && item.featuredReelId != null) {
        gridRecreateGenerate.mutate({
          featuredReelId: item.featuredReelId,
          topic: "",
          gradeLevel: "auto",
        });
      } else if (item.reelId != null) {
        gridRecreateGenerate.mutate({ reelId: item.reelId, topic: "", gradeLevel: "auto" });
      }
    },
    [gridRecreateGenerate]
  );

  const runTranscribeClick = useCallback(
    (item: SavedItem, opts: { expand: boolean }) => {
      if (!transcribeGate.allowed) {
        toast.error(`Transcription limit reached (${transcribeGate.used}/${transcribeGate.limit})`, {
          description: "Upgrade your plan for more transcriptions.",
          action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
        });
        return;
      }
      const pKey = txPendingKey(item);
      if (pKey == null) return;
      if (transcribeInFlightRef.current >= 5) {
        toast.info("Please wait for some transcriptions to complete before starting more.");
        return;
      }
      transcribeInFlightRef.current += 1;
      setTranscribeInFlightBumper((n) => n + 1);
      if (opts.expand) {
        if (viewMode === "grid") {
          setGridModalSavedId(item.id);
        } else {
          setExpandedSavedId(item.id);
        }
      }
      setPendingTranscriptions((prev) => new Set(prev).add(pKey));

      if (item.source === "featured" && item.featuredReelId != null) {
        startTranscription.mutate({ featuredReelId: item.featuredReelId });
      } else if (item.reelId != null) {
        startTranscription.mutate({ reelId: item.reelId });
      }
    },
    [
      transcribeGate.allowed,
      transcribeGate.used,
      transcribeGate.limit,
      viewMode,
      startTranscription,
      setLocation,
    ]
  );

  useEffect(() => {
    setGridModalSavedId(null);
    setVisibleLimit(REEL_LIBRARY_INITIAL_VISIBLE);
  }, [viewMode]);

  /** Clear optimistic pending rows when saved.list refetches to completed/failed (same idea as Dashboard). */
  useEffect(() => {
    const data = savedQuery.data;
    if (!data?.length) return;
    setPendingTranscriptions((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const item of data) {
        const k = txPendingKey(item);
        if (!k || !prev.has(k)) continue;
        const st = item.transcription?.status;
        if (st === "completed" || st === "failed") {
          next.delete(k);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [savedQuery.data]);

  const toggleSave = trpc.saved.toggle.useMutation({
    onSuccess: (data) => {
      utils.saved.checkBatch.invalidate();
      utils.saved.list.invalidate();
      toast.success(data.saved ? "Saved" : "Removed from saved");
    },
  });

  const sortedReels = useMemo(() => {
    const all = [...savedReels];
    switch (sortBy) {
      case "views":
        return all.sort((a, b) => (b.reel.viewCount || 0) - (a.reel.viewCount || 0));
      case "likes":
        return all.sort((a, b) => (b.reel.likeCount || 0) - (a.reel.likeCount || 0));
      case "engagement":
        return all.sort((a, b) => engagementPercent(b) - engagementPercent(a));
      case "date":
      default:
        return all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
  }, [savedReels, sortBy]);

  const displayedReels = useMemo(
    () => sortedReels.slice(0, visibleLimit),
    [sortedReels, visibleLimit]
  );

  const groupedByHandle = useMemo(() => {
    const groups: Record<string, SavedItem[]> = {};
    for (const item of displayedReels) {
      const groupKey = `${item.source}:${item.job.handle}`;
      if (!groups[groupKey]) groups[groupKey] = [];
      groups[groupKey].push(item);
    }
    return groups;
  }, [displayedReels]);

  const hasMoreReels = sortedReels.length > visibleLimit;

  const visibleScrapedReelIds = useMemo(
    () =>
      [
        ...new Set(
          displayedReels.filter((i) => isUserJobSavedItem(i)).map((i) => i.reelId!)
        ),
      ],
    [displayedReels]
  );
  const visibleFeaturedReelIds = useMemo(
    () =>
      [
        ...new Set(
          displayedReels
            .filter((i) => i.source === "featured" && i.featuredReelId != null)
            .map((i) => i.featuredReelId!)
        ),
      ],
    [displayedReels]
  );

  const brandCoachBatch = useBrandCoachBatchPrefetched({
    reelIds: visibleScrapedReelIds,
    featuredReelIds: visibleFeaturedReelIds,
  });

  const brandCoachPrefetchedScore = useCallback(
    (item: SavedItem): ReturnType<typeof brandCoachBatch.prefetchedForReel> => {
      if (item.source === "featured" && item.featuredReelId != null) {
        return brandCoachBatch.prefetchedForFeatured(item.featuredReelId);
      }
      return brandCoachBatch.prefetchedForReel(item.reel.id);
    },
    [brandCoachBatch.prefetchedForFeatured, brandCoachBatch.prefetchedForReel]
  );

  const recreateScrapedQuery = trpc.recreate.checkBatch.useQuery(
    { reelIds: visibleScrapedReelIds },
    {
      enabled: visibleScrapedReelIds.length > 0,
      staleTime: RECREATE_BATCH_STALE_MS,
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return false;
        for (const v of Object.values(d)) {
          if (v && (v.status === "pending" || v.status === "processing")) {
            return RECREATE_BATCH_POLL_MS;
          }
        }
        return false;
      },
    }
  );
  const recreateFeaturedQuery = trpc.recreate.checkBatch.useQuery(
    { featuredReelIds: visibleFeaturedReelIds },
    {
      enabled: visibleFeaturedReelIds.length > 0,
      staleTime: RECREATE_BATCH_STALE_MS,
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return false;
        for (const v of Object.values(d)) {
          if (v && (v.status === "pending" || v.status === "processing")) {
            return RECREATE_BATCH_POLL_MS;
          }
        }
        return false;
      },
    }
  );

  const scrapedRecreateMap = recreateScrapedQuery.data || {};
  const featuredRecreateMap = recreateFeaturedQuery.data || {};

  useEffect(() => {
    setVisibleLimit((prev) =>
      sortedReels.length <= REEL_LIBRARY_INITIAL_VISIBLE
        ? REEL_LIBRARY_INITIAL_VISIBLE
        : Math.min(prev, sortedReels.length)
    );
  }, [sortedReels.length]);

  const gridModalItem = useMemo(
    () => (gridModalSavedId == null ? null : sortedReels.find((i) => i.id === gridModalSavedId) ?? null),
    [gridModalSavedId, sortedReels]
  );

  const handleTranscribeAll = async () => {
    if (!transcribeGate.allowed) {
      toast.error(`Transcription limit reached (${transcribeGate.used}/${transcribeGate.limit})`, {
        description: "Upgrade your plan for more transcriptions.",
        action: { label: "Upgrade", onClick: () => setLocation("/pricing") },
      });
      return;
    }
    const untranscribed = savedReels.filter(
      (item) => !item.transcription || item.transcription.status !== "completed"
    );
    if (untranscribed.length === 0) {
      toast.info("All saved reels are already transcribed!");
      return;
    }
    setBatchTranscribing(true);
    let started = 0;
    try {
      for (const item of untranscribed) {
        try {
          if (item.source === "featured" && item.featuredReelId != null) {
            await startTranscription.mutateAsync({ featuredReelId: item.featuredReelId });
            started++;
          } else if (item.reelId != null) {
            await startTranscription.mutateAsync({ reelId: item.reelId });
            started++;
          }
        } catch {
          /* continue */
        }
      }
    } finally {
      setBatchTranscribing(false);
    }
    toast.success(`Started transcription for ${started} reel${started !== 1 ? "s" : ""}`);
  };

  const untranscribedCount = savedReels.filter(
    (item) => !item.transcription || item.transcription.status !== "completed"
  ).length;

  const reelActionSource = (item: SavedItem): ReelActionSource =>
    item.source === "featured" && item.featuredReelId != null
      ? { source: "featured", featuredReelId: item.featuredReelId }
      : { source: "user_job", reelId: item.reelId!, jobId: item.jobId ?? 0 };

  const onToggleSave = (item: SavedItem) => {
    if (item.source === "featured" && item.featuredReelId != null) {
      toggleSave.mutate({ featuredReelId: item.featuredReelId });
    } else if (item.reelId != null && item.jobId != null) {
      toggleSave.mutate({ reelId: item.reelId, jobId: item.jobId });
    } else if (item.source === "discover" && item.reelId != null) {
      toggleSave.mutate({ reelId: item.reelId, jobId: 0 });
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-0">
      {VoiceGateDialog}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
            <Bookmark className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            Saved Reels
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {savedQuery.isLoading ? (
              "Loading your saved reels…"
            ) : (
              <>
                {savedReels.length} reel{savedReels.length !== 1 ? "s" : ""} saved across{" "}
                {Object.keys(groupedByHandle).length} account{Object.keys(groupedByHandle).length !== 1 ? "s" : ""}
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-md border border-border/50 bg-muted/30 p-0.5">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "list" ? "default" : "ghost"}
              className="min-h-9 px-3 text-xs"
              onClick={() => setViewModeTracked("list")}
            >
              <List className="mr-1 h-3.5 w-3.5" />
              List
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "grid" ? "default" : "ghost"}
              className="min-h-9 px-3 text-xs"
              onClick={() => setViewModeTracked("grid")}
            >
              <Grid3X3 className="mr-1 h-3.5 w-3.5" />
              Grid
            </Button>
          </div>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Recently Saved</SelectItem>
              <SelectItem value="views">Most Views</SelectItem>
              <SelectItem value="likes">Most Likes</SelectItem>
              <SelectItem value="engagement">Highest Engagement</SelectItem>
            </SelectContent>
          </Select>

          {savedReels.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => void handleTranscribeAll()}
              disabled={batchTranscribing || untranscribedCount === 0}
            >
              {batchTranscribing ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Zap className="mr-1.5 h-3.5 w-3.5" />
              )}
              {untranscribedCount > 0 ? `Transcribe All (${untranscribedCount})` : "All Transcribed"}
            </Button>
          )}
        </div>
      </div>

      {!transcribeGate.isLoading && !transcribeGate.allowed && (
        <div className="mb-4">
          <UpgradePrompt
            action="transcribeCount"
            used={transcribeGate.used}
            limit={transcribeGate.limit}
            planRequired={transcribeGate.planRequired}
            variant="banner"
          />
        </div>
      )}

      {savedQuery.isLoading && <WorkspaceReelGridSkeleton count={8} />}

      {!savedQuery.isLoading && savedReels.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Bookmark className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <h2 className="mb-2 text-lg font-medium text-foreground">No saved reels yet</h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Save reels from the Dashboard by clicking the bookmark icon. Saved reels appear here for quick access.
          </p>
        </div>
      )}

      {savedReels.length > 0 &&
        Object.entries(groupedByHandle).map(([groupKey, items]) => {
          const handle = groupKey.split(":").slice(1).join(":");
          const headerHref =
            items[0].source === "discover"
              ? null
              : items[0].source === "featured" && items[0].job.featuredAccountId != null
                ? `/dashboard?featuredAccountId=${items[0].job.featuredAccountId}`
                : items[0].jobId != null && items[0].jobId > 0
                  ? `/dashboard?jobId=${items[0].jobId}`
                  : null;

          return (
            <div key={groupKey} className="mb-8">
              <div className="mb-3 flex items-center gap-3">
                {items[0].source === "discover" ? (
                  <span className="text-lg font-semibold text-foreground">@{handle}</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => headerHref && setLocation(headerHref)}
                    disabled={!headerHref}
                    className="text-lg font-semibold text-foreground transition-colors hover:text-primary disabled:opacity-60"
                  >
                    @{handle}
                  </button>
                )}
                <Badge variant="outline" className="text-xs">
                  {items.length} saved
                </Badge>
                {items[0].source === "featured" && (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    Featured
                  </Badge>
                )}
                {items[0].source === "discover" && (
                  <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                    Discover
                  </Badge>
                )}
                {items[0].job.followerCount ? (
                  <span className="text-xs text-muted-foreground">
                    {formatNumber(items[0].job.followerCount)} followers
                  </span>
                ) : null}
              </div>

              {viewMode === "list" && (
                <div className="space-y-1">
                  {items.map((item, index) => {
                    const reel = item.reel;
                    const engagementRate = engagementPercent(item);
                    const isExpanded = expandedSavedId === item.id;
                    const pKey = txPendingKey(item);
                    const hasTranscription = !!item.transcription && item.transcription.status === "completed";
                    const isNoSpeech = transcriptionIsNoSpeech(item.transcription);
                    const isProcessing =
                      item.transcription?.status === "processing" || !!(pKey && pendingTranscriptions.has(pKey));
                    const isFailed =
                      item.transcription?.status === "failed" && !(pKey && pendingTranscriptions.has(pKey));
                    const isTxQueued =
                      isProcessing &&
                      (item.source === "scraped" || item.source === "discover") &&
                      (item.transcription?.status !== "processing" || !item.transcription?.startedAt);
                    const recreateSt = reelRecreateState(
                      recreateEntryForItem(item, scrapedRecreateMap, featuredRecreateMap)
                    );
                    const idleNotRemakeable =
                      mergeRemakeability(item.transcription, item.reel).notRemakeable &&
                      hasTranscription &&
                      !isNoSpeech &&
                      recreateSt === "none";

                    const librarySource = savedItemToLibraryRemakeSource(item);
                    const hookState =
                      librarySource != null
                        ? getRemakeState(libraryRemakeKey(librarySource))
                        : null;
                    const isProcessingForStrip =
                      isProcessing || hookState?.stage === "transcribing";
                    const batchEntry = recreateEntryForItem(
                      item,
                      scrapedRecreateMap,
                      featuredRecreateMap
                    );
                    const alreadyTranscribed = hasTranscription && !isNoSpeech;
                    const oneClickRemake =
                      librarySource != null
                        ? buildLibraryOneClickRemake({
                            openScriptReelId: reel.id,
                            jobId: librarySource.source === "user" ? (item.jobId ?? 0) : undefined,
                            isNoSpeech,
                            alreadyTranscribed,
                            idleNotRemakeable,
                            classificationReason: reel.classificationReason ?? undefined,
                            classification: reelClassificationFromRow(reel),
                            batchRecreateSt: recreateSt,
                            batchEntry,
                            hookState: getRemakeState(libraryRemakeKey(librarySource)),
                            librarySource,
                            startRemake,
                            retryRemake,
                            startInspirationSave,
                            triggerOpenMyScript,
                          })
                        : undefined;

                    return (
                      <div key={item.id} className="overflow-hidden rounded-lg border border-border/30">
                        <div
                          className={`flex cursor-pointer items-center gap-2 bg-card/50 p-2 transition-colors hover:bg-card sm:gap-3 sm:p-3 ${
                            isExpanded ? "border-b border-border/30 bg-card" : ""
                          }`}
                          onClick={() => setExpandedSavedId(isExpanded ? null : item.id)}
                        >
                          <span className="hidden w-5 shrink-0 text-right font-mono text-sm text-muted-foreground sm:block sm:w-6">
                            {index + 1}
                          </span>

                          <div className="relative h-18 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                            <ReelGridThumbnail
                              className="relative h-full w-full"
                              thumbnailUrl={reel.thumbnailUrl}
                              width={56}
                              height={72}
                            />
                            {reel.duration ? (
                              <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 text-[9px] font-mono text-white">
                                {Math.floor(reel.duration / 60)}:
                                {(Math.floor(reel.duration % 60)).toString().padStart(2, "0")}
                              </span>
                            ) : null}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="mb-0.5 flex items-center gap-2">
                              <p className="line-clamp-1 text-sm leading-snug text-foreground">
                                {reel.caption || <span className="italic text-muted-foreground">No caption</span>}
                              </p>
                              {hasTranscription && !isNoSpeech && (
                                <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
                                  Transcribed
                                </span>
                              )}
                              {isNoSpeech && (
                                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                                  No voice
                                </span>
                              )}
                              {isProcessing && (
                                <span className="shrink-0 animate-pulse rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
                                  Processing
                                </span>
                              )}
                              {isFailed && (
                                <span className="shrink-0 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-medium text-red-400">
                                  Failed
                                </span>
                              )}
                              <BrandCoachBadge
                                source={
                                  item.source === "featured" && item.featuredReelId != null
                                    ? { kind: "featured", featuredReelId: item.featuredReelId }
                                    : { kind: "reel", reelId: reel.id }
                                }
                                hasTranscript={hasTranscription && !isNoSpeech}
                                prefetchedScore={brandCoachPrefetchedScore(item)}
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Eye className="h-3 w-3" />
                                {formatNumber(reel.viewCount)}
                              </span>
                              <span className="flex items-center gap-1">
                                <Heart className="h-3 w-3" />
                                {formatNumber(reel.likeCount)}
                              </span>
                              <span className="flex items-center gap-1">
                                <MessageCircle className="h-3 w-3" />
                                {formatNumber(reel.commentCount)}
                              </span>
                              {engagementRate > 0 && (
                                <span className="flex items-center gap-1 font-medium text-emerald-400">
                                  <TrendingUp className="h-3 w-3" />
                                  {engagementRate.toFixed(2)}%
                                </span>
                              )}
                              <span className="flex items-center gap-1 text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {formatPostedTime(reel.postedAt, userTimezone)}
                              </span>
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5 sm:gap-1">
                            <ReelActionButtons
                              source={reelActionSource(item)}
                              reelId={reel.id}
                              reelUrl={reel.reelUrl}
                              isSaved
                              hasTranscription={hasTranscription}
                              isProcessing={isProcessingForStrip}
                              isFailed={isFailed}
                              recreateState={recreateSt}
                              saveBusy={toggleSave.isPending}
                              isQueued={isTxQueued}
                              isNoSpeech={isNoSpeech}
                              oneClickRemake={oneClickRemake}
                              onToggleSave={() => onToggleSave(item)}
                              onTranscribe={() => {}}
                              onExpand={() => setExpandedSavedId(item.id)}
                              onMakeVersion={() => {}}
                              onOpenMyScript={() => {}}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0 text-muted-foreground"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedSavedId(isExpanded ? null : item.id);
                              }}
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-3.5 w-3.5" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </div>
                        </div>

                        {isExpanded && item.source === "featured" && item.featuredReelId != null && (
                          <InlineWorkflow
                            reelSource="featured"
                            featuredReelId={item.featuredReelId}
                            handle={handle}
                            hasTranscription={hasTranscription}
                            isProcessing={isProcessing}
                            isTranscriptionQueued={isTxQueued}
                            isNoSpeech={isNoSpeech}
                            inspirationPanelVariant="saved-collected"
                            listRemakeHint={mergeRemakeability(item.transcription, item.reel)}
                            reelClassification={item.reel}
                            onSaveForInspiration={() => onToggleSave(item)}
                            saveForInspirationBusy={toggleSave.isPending}
                            inspirationReelIsSaved
                            onTranscribe={() => runTranscribeClick(item, { expand: false })}
                            userTimezone={userTimezone}
                            postedAt={reel.postedAt}
                            recreateEntrySignal={
                              recreatePulse?.reelId === reel.id
                                ? { nonce: recreatePulse.nonce, openScriptId: recreatePulse.openScriptId }
                                : undefined
                            }
                          />
                        )}
                        {isExpanded && isUserJobSavedItem(item) && item.reelId != null && (
                          <InlineWorkflow
                            reelSource="user_job"
                            reelId={item.reelId}
                            handle={handle}
                            hasTranscription={hasTranscription}
                            isProcessing={isProcessing}
                            isTranscriptionQueued={isTxQueued}
                            isNoSpeech={isNoSpeech}
                            inspirationPanelVariant="saved-collected"
                            listRemakeHint={mergeRemakeability(item.transcription, item.reel)}
                            reelClassification={item.reel}
                            onSaveForInspiration={() => onToggleSave(item)}
                            saveForInspirationBusy={toggleSave.isPending}
                            inspirationReelIsSaved
                            onTranscribe={() => runTranscribeClick(item, { expand: false })}
                            userTimezone={userTimezone}
                            postedAt={reel.postedAt}
                            recreateEntrySignal={
                              recreatePulse?.reelId === reel.id
                                ? { nonce: recreatePulse.nonce, openScriptId: recreatePulse.openScriptId }
                                : undefined
                            }
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {viewMode === "grid" && (
                <div className={WORKSPACE_REEL_GRID_CLASS}>
                  {items.map((item, index) => {
                    const reel = item.reel;
                    const engagementRate = engagementPercent(item);
                    const isModalOpen = gridModalSavedId === item.id;
                    const pKey = txPendingKey(item);
                    const hasTranscription = !!item.transcription && item.transcription.status === "completed";
                    const isNoSpeech = transcriptionIsNoSpeech(item.transcription);
                    const isProcessing =
                      item.transcription?.status === "processing" || !!(pKey && pendingTranscriptions.has(pKey));
                    const isFailed =
                      item.transcription?.status === "failed" && !(pKey && pendingTranscriptions.has(pKey));
                    const isTxQueued =
                      isProcessing &&
                      (item.source === "scraped" || item.source === "discover") &&
                      (item.transcription?.status !== "processing" || !item.transcription?.startedAt);
                    const recreateSt = reelRecreateState(
                      recreateEntryForItem(item, scrapedRecreateMap, featuredRecreateMap)
                    );
                    const idleNotRemakeable =
                      mergeRemakeability(item.transcription, item.reel).notRemakeable &&
                      hasTranscription &&
                      !isNoSpeech &&
                      recreateSt === "none";

                    const librarySource = savedItemToLibraryRemakeSource(item);
                    const hookState =
                      librarySource != null
                        ? getRemakeState(libraryRemakeKey(librarySource))
                        : null;
                    const isProcessingForStrip =
                      isProcessing || hookState?.stage === "transcribing";
                    const batchEntry = recreateEntryForItem(
                      item,
                      scrapedRecreateMap,
                      featuredRecreateMap
                    );
                    const alreadyTranscribed = hasTranscription && !isNoSpeech;
                    const oneClickRemake =
                      librarySource != null
                        ? buildLibraryOneClickRemake({
                            openScriptReelId: reel.id,
                            jobId: librarySource.source === "user" ? (item.jobId ?? 0) : undefined,
                            isNoSpeech,
                            alreadyTranscribed,
                            idleNotRemakeable,
                            classificationReason: reel.classificationReason ?? undefined,
                            classification: reelClassificationFromRow(reel),
                            batchRecreateSt: recreateSt,
                            batchEntry,
                            hookState: getRemakeState(libraryRemakeKey(librarySource)),
                            librarySource,
                            startRemake,
                            retryRemake,
                            startInspirationSave,
                            triggerOpenMyScript,
                          })
                        : undefined;

                    return (
                      <WorkspaceReelGridTile
                        key={item.id}
                        index={index}
                        isActive={isModalOpen}
                        thumbnailUrl={reel.thumbnailUrl}
                        videoUrl={reel.videoUrl}
                        shortcode={reel.shortcode}
                        reelId={item.source === "scraped" ? reel.id : undefined}
                        engagementRate={engagementRate}
                        duration={reel.duration}
                        reelUrl={reel.reelUrl}
                        interactiveMedia
                        inlinePlaying={inlinePlayingId === item.id}
                        onInlinePlayRequest={() => setInlinePlayingId(item.id)}
                        onInlinePlayStop={() =>
                          setInlinePlayingId((cur) => (cur === item.id ? null : cur))
                        }
                        topRight={
                          <button
                            type="button"
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/90 text-white backdrop-blur transition-colors hover:bg-emerald-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleSave(item);
                            }}
                            disabled={toggleSave.isPending}
                            title="Remove from saved"
                            aria-label="Remove from saved"
                          >
                            <BookmarkCheck className="h-4 w-4" />
                          </button>
                        }
                        statusChip={
                          hasTranscription && !isNoSpeech ? (
                            <span className="rounded bg-emerald-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950">
                              Transcribed
                            </span>
                          ) : isNoSpeech ? (
                            <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
                              No voice
                            </span>
                          ) : isProcessingForStrip ? (
                            <span className="animate-pulse rounded bg-amber-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
                              Processing
                            </span>
                          ) : null
                        }
                        badges={
                          <BrandCoachBadge
                            source={
                              item.source === "featured" && item.featuredReelId != null
                                ? { kind: "featured", featuredReelId: item.featuredReelId }
                                : { kind: "reel", reelId: reel.id }
                            }
                            hasTranscript={hasTranscription && !isNoSpeech}
                            prefetchedScore={brandCoachPrefetchedScore(item)}
                          />
                        }
                        caption={
                          <p className="line-clamp-2 min-h-[2rem] text-xs text-foreground">
                            {reel.caption || <span className="italic text-muted-foreground">No caption</span>}
                          </p>
                        }
                        stats={
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                            <span>{formatNumber(reel.viewCount)} views</span>
                            {engagementRate > 0 && (
                              <>
                                <span aria-hidden>·</span>
                                <span className="font-medium text-emerald-400">
                                  {engagementRate.toFixed(2)}%
                                </span>
                              </>
                            )}
                            <span className="hidden sm:inline" aria-hidden>
                              ·
                            </span>
                            <span className="hidden sm:inline">
                              {formatNumber(reel.likeCount)} likes
                            </span>
                            <span className="hidden md:inline" aria-hidden>
                              ·
                            </span>
                            <span className="hidden md:inline">
                              {formatNumber(reel.commentCount)} comments
                            </span>
                            <span className="hidden sm:inline" aria-hidden>
                              ·
                            </span>
                            <span className="hidden sm:inline text-muted-foreground">
                              {formatPostedTime(reel.postedAt, userTimezone)}
                            </span>
                          </div>
                        }
                        actions={
                          <ReelActionButtons
                            source={reelActionSource(item)}
                            reelId={reel.id}
                            reelUrl={reel.reelUrl}
                            isSaved
                            hasTranscription={hasTranscription}
                            isProcessing={isProcessingForStrip}
                            isFailed={isFailed}
                            recreateState={recreateSt}
                            saveBusy={toggleSave.isPending}
                            isQueued={isTxQueued}
                            isNoSpeech={isNoSpeech}
                            oneClickRemake={oneClickRemake}
                            compact
                            hideBookmark
                            hideExternalLink
                            onToggleSave={() => onToggleSave(item)}
                            onTranscribe={() => {}}
                            onExpand={() => setGridModalSavedId(item.id)}
                            onMakeVersion={() => {}}
                            onOpenMyScript={() => {}}
                          />
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

      {hasMoreReels && (
        <div className="mb-10 flex justify-center">
          <Button
            type="button"
            variant="outline"
            onClick={() => setVisibleLimit((n) => n + REEL_LIBRARY_VISIBLE_STEP)}
          >
            Show more ({sortedReels.length - visibleLimit} remaining)
          </Button>
        </div>
      )}

      <GridReelWorkflowDialog
        open={gridModalItem != null}
        onOpenChange={(open) => {
          if (!open) setGridModalSavedId(null);
        }}
        reel={
          gridModalItem
            ? {
                id: gridModalItem.reel.id,
                caption: gridModalItem.reel.caption,
                thumbnailUrl: gridModalItem.reel.thumbnailUrl,
                videoUrl: gridModalItem.reel.videoUrl ?? "",
                viewCount: gridModalItem.reel.viewCount,
                likeCount: gridModalItem.reel.likeCount,
                commentCount: gridModalItem.reel.commentCount,
                engagementRate: engagementPercent(gridModalItem),
                postedAt: gridModalItem.reel.postedAt,
                duration: gridModalItem.reel.duration,
              }
            : null
        }
        userTimezone={userTimezone}
      >
        {gridModalItem
          ? (() => {
              const item = gridModalItem;
              const reel = item.reel;
              const handle = item.job.handle;
              const hasTranscription = !!item.transcription && item.transcription.status === "completed";
              const isNoSpeech = transcriptionIsNoSpeech(item.transcription);
              const pKey = txPendingKey(item);
              const isProcessing =
                item.transcription?.status === "processing" || !!(pKey && pendingTranscriptions.has(pKey));
              const isTxQueued =
                isProcessing &&
                (item.source === "scraped" || item.source === "discover") &&
                (item.transcription?.status !== "processing" || !item.transcription?.startedAt);

              return item.source === "featured" && item.featuredReelId != null ? (
                <InlineWorkflow
                  reelSource="featured"
                  featuredReelId={item.featuredReelId}
                  handle={handle}
                  hasTranscription={hasTranscription}
                  isProcessing={isProcessing}
                  isTranscriptionQueued={isTxQueued}
                  isNoSpeech={isNoSpeech}
                  inspirationPanelVariant="saved-collected"
                  listRemakeHint={mergeRemakeability(item.transcription, item.reel)}
                  reelClassification={item.reel}
                  onSaveForInspiration={() => onToggleSave(item)}
                  saveForInspirationBusy={toggleSave.isPending}
                  inspirationReelIsSaved
                  onTranscribe={() => runTranscribeClick(item, { expand: false })}
                  userTimezone={userTimezone}
                  postedAt={reel.postedAt}
                  recreateEntrySignal={
                    recreatePulse?.reelId === reel.id
                      ? { nonce: recreatePulse.nonce, openScriptId: recreatePulse.openScriptId }
                      : undefined
                  }
                  onRemakeSaved={() => setGridModalSavedId(null)}
                />
              ) : item.reelId != null ? (
                <InlineWorkflow
                  reelSource="user_job"
                  reelId={item.reelId}
                  handle={handle}
                  hasTranscription={hasTranscription}
                  isProcessing={isProcessing}
                  isTranscriptionQueued={isTxQueued}
                  isNoSpeech={isNoSpeech}
                  inspirationPanelVariant="saved-collected"
                  listRemakeHint={mergeRemakeability(item.transcription, item.reel)}
                  reelClassification={item.reel}
                  onSaveForInspiration={() => onToggleSave(item)}
                  saveForInspirationBusy={toggleSave.isPending}
                  inspirationReelIsSaved
                  onTranscribe={() => runTranscribeClick(item, { expand: false })}
                  userTimezone={userTimezone}
                  postedAt={reel.postedAt}
                  recreateEntrySignal={
                    recreatePulse?.reelId === reel.id
                      ? { nonce: recreatePulse.nonce, openScriptId: recreatePulse.openScriptId }
                      : undefined
                  }
                  onRemakeSaved={() => setGridModalSavedId(null)}
                />
              ) : null;
            })()
          : null}
      </GridReelWorkflowDialog>
    </div>
  );
}
