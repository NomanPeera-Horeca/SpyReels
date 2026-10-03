import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { usePostHog } from "@posthog/react";
import type { inferRouterOutputs } from "@trpc/server";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import type { AppRouter } from "../../../server/routers";
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
  Eye,
  Heart,
  MessageCircle,
  TrendingUp,
  Clock,
  Film,
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
  Grid3X3,
  List,
  Instagram,
  Music2,
  Youtube,
  Bookmark,
  BookmarkCheck,
} from "lucide-react";
import { mergeRemakeability, type ReelClassificationLike } from "@/lib/remakeability";
import { useUsageGate } from "@/hooks/useUsageGate";
import {
  useLibraryRemakeChain,
  type LibraryRemakeSource,
  type LibraryRemakeStage,
} from "@/hooks/useLibraryRemakeChain";
import { libraryRemakeKey } from "@/lib/libraryRemakeChainCore";
import {
  buildLibraryOneClickRemake,
  reelClassificationFromRow,
} from "@/lib/oneClickRemakeAction";
import { buildRemakeIntentMedia } from "@/lib/remakeIntent";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import {
  InlineWorkflow,
  formatNumber,
  formatPostedTime,
} from "@/components/InlineWorkflow";
import { ReelGridThumbnail } from "@/components/ReelGridThumbnail";
import { WorkspaceReelGridTile } from "@/components/WorkspaceReelGridTile";
import {
  QuietCreatorButton,
  QuietReelCaption,
  QuietReelMetrics,
  QuietRemakeActions,
  QuietRemakeStatusChip,
  quietRemakeStatusFromState,
} from "@/components/QuietWorkspaceReelChrome";
import { useOpenCreatorInApp } from "@/hooks/useOpenCreatorInApp";
import { WORKSPACE_REEL_GRID_CLASS } from "@/lib/workspaceReelGridLayout";
import {
  REEL_LIBRARY_INITIAL_VISIBLE,
  REEL_LIBRARY_VISIBLE_STEP,
} from "@/lib/reelLibraryPagination";
import { WorkspaceReelGridSkeleton } from "@/components/WorkspaceReelGridSkeleton";
import { GridReelWorkflowDialog } from "@/components/GridReelWorkflowDialog";
import { ReelActionButtons } from "@/components/ReelActionButtons";
import { BrandCoachBadge } from "@/components/BrandCoachBadge";
import { useBrandCoachBatchPrefetched } from "@/hooks/useBrandCoachBatchPrefetched";

type CollectedRow = inferRouterOutputs<AppRouter>["collected"]["list"][number];
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

const DATE_FILTERS = [
  { value: "all", label: "All Time" },
  { value: "7", label: "Last 7 Days" },
  { value: "14", label: "Last 14 Days" },
  { value: "30", label: "Last 30 Days" },
  { value: "60", label: "Last 60 Days" },
  { value: "90", label: "Last 90 Days" },
  { value: "180", label: "Last 180 Days" },
];

const SORT_OPTIONS = [
  { value: "views", label: "Highest Views", icon: Eye },
  { value: "likes", label: "Highest Likes", icon: Heart },
  { value: "comments", label: "Highest Comments", icon: MessageCircle },
  { value: "engagement", label: "Highest Engagement Rate", icon: TrendingUp },
  { value: "added_newest", label: "Added (Newest)", icon: Calendar },
  { value: "added_oldest", label: "Added (Oldest)", icon: Calendar },
  { value: "posted_newest", label: "Posted (Newest)", icon: Calendar },
  { value: "posted_oldest", label: "Posted (Oldest)", icon: Calendar },
];

const RECREATE_BATCH_STALE_MS = 300_000;
const RECREATE_BATCH_POLL_MS = 5_000;
const VIEW_MODE_STORAGE_KEY = "reels-dashboard:viewMode";

function collectedPlatform(
  reel: CollectedRow
): "instagram" | "tiktok" | "youtube" {
  const platform = (reel.platform || "instagram").toLowerCase();
  if (platform === "tiktok" || platform === "youtube") return platform;
  return "instagram";
}

/** Match Creator Radar / research: Lucide platform mark + short label. */
function SourcePlatformBadge({ reel }: { reel: CollectedRow }) {
  const platform = collectedPlatform(reel);
  const icon =
    platform === "instagram" ? (
      <Instagram className="h-3 w-3" aria-hidden />
    ) : platform === "tiktok" ? (
      <Music2 className="h-3 w-3" aria-hidden />
    ) : (
      <Youtube className="h-3 w-3" aria-hidden />
    );

  const label =
    platform === "tiktok"
      ? "TikTok"
      : platform === "youtube"
        ? "YouTube"
        : reel.source === "telegram"
          ? "TG"
          : reel.source === "extension"
            ? "EXT"
            : "IG";

  return (
    <span className="inline-flex items-center gap-0.5">
      {icon}
      <span>{label}</span>
    </span>
  );
}

function collectedRowToLibraryRemakeSource(
  reel: CollectedRow,
  mappedReelId: number | null
): LibraryRemakeSource {
  return {
    source: "collected",
    collectedReelId: reel.id,
    transcriptionReelId: mappedReelId ?? undefined,
  };
}

export default function CollectedReels() {
  const posthog = usePostHog();
  const utils = trpc.useUtils();
  const transcribeGate = useUsageGate("transcribeCount");
  const { openCreator } = useOpenCreatorInApp("collected");
  const [quietMoreId, setQuietMoreId] = useState<number | null>(null);

  const collectedQuery = trpc.collected.list.useQuery(undefined, {
    refetchInterval: (query) => {
      const rows = query.state.data;
      const hasPending = rows?.some((r) => r.status === "pending");
      return hasPending ? 3000 : 8000;
    },
  });
  const prefsQuery = trpc.preferences.get.useQuery();
  const telegramQuery = trpc.telegram.status.useQuery();
  const userTimezone = prefsQuery.data?.timezone || "America/Chicago";

  const collectedRows = collectedQuery.data || [];
  const reelsRef = useRef(collectedRows);
  reelsRef.current = collectedRows;

  const mirrorReelIds = useMemo(
    () =>
      collectedRows
        .map((r) => r.transcriptionReelId)
        .filter((id): id is number => id != null && id > 0),
    [collectedRows]
  );

  const savedBatchQuery = trpc.saved.checkBatch.useQuery(
    { reelIds: mirrorReelIds },
    { enabled: mirrorReelIds.length > 0 }
  );
  const savedMap = savedBatchQuery.data ?? {};

  const toggleCollectedSave = trpc.collected.toggleSave.useMutation({
    onSuccess: (data) => {
      void utils.saved.checkBatch.invalidate();
      void utils.saved.list.invalidate();
      void utils.collected.list.invalidate();
      toast.success(data.saved ? "Saved" : "Removed from saved");
    },
    onError: (err) => toast.error(err.message),
  });

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
        posthog?.capture("view_toggled", { mode: next, page: "collected_reels" });
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

  const [expandedCollectedId, setExpandedCollectedId] = useState<number | null>(null);
  const [gridModalCollectedId, setGridModalCollectedId] = useState<number | null>(null);
  /** Freeze-safe: only one grid tile mounts an inline player at a time. */
  const [inlinePlayingId, setInlinePlayingId] = useState<number | null>(null);
  const viewModeRef = useRef(viewMode);
  viewModeRef.current = viewMode;

  const [recreatePulse, setRecreatePulse] = useState<{
    reelId: number;
    nonce: number;
    openScriptId?: number;
  } | null>(null);

  const triggerRecreatePulse = useCallback((mappedReelId: number) => {
    const list = reelsRef.current;
    const item = list.find((r) => r.transcriptionReelId === mappedReelId);
    if (!item) return;
    if (viewModeRef.current === "grid") setGridModalCollectedId(item.id);
    else setExpandedCollectedId(item.id);
    setRecreatePulse((prev) => ({
      reelId: mappedReelId,
      nonce: (prev?.reelId === mappedReelId ? prev.nonce : 0) + 1,
    }));
  }, []);

  const triggerOpenMyScript = useCallback(
    (mappedReelId: number, openScriptId: number) => {
      const list = reelsRef.current;
      const item = list.find((r) => r.transcriptionReelId === mappedReelId);
      if (viewModeRef.current === "grid") {
        if (item) setGridModalCollectedId(item.id);
      } else if (item) {
        setExpandedCollectedId(item.id);
      }
      setRecreatePulse((prev) => ({
        reelId: mappedReelId,
        nonce: (prev?.reelId === mappedReelId ? prev.nonce : 0) + 1,
        openScriptId,
      }));
    },
    []
  );

  const [sortBy, setSortBy] = useState("added_newest");
  const [visibleLimit, setVisibleLimit] = useState(REEL_LIBRARY_INITIAL_VISIBLE);
  const [dateFilter, setDateFilter] = useState("all");
  const [urlInput, setUrlInput] = useState("");
  const [addingUrl, setAddingUrl] = useState(false);
  const [pendingCollectedTranscribe, setPendingCollectedTranscribe] = useState<Set<number>>(
    () => new Set()
  );

  const transcribeInFlightRef = useRef(0);
  const [, setTranscribeInFlightBumper] = useState(0);
  const releaseTranscribeSlot = useCallback(() => {
    transcribeInFlightRef.current = Math.max(0, transcribeInFlightRef.current - 1);
    setTranscribeInFlightBumper((n) => n + 1);
  }, []);

  const deleteMutation = trpc.collected.delete.useMutation({
    onSuccess: () => {
      utils.collected.list.invalidate();
      toast.success("Reel removed from collection");
    },
  });

  const addByUrlMutation = trpc.collected.addByUrl.useMutation({
    onSuccess: (data) => {
      utils.collected.list.invalidate();
      if (data.duplicate) {
        toast.info("This reel is already in your collection");
      } else if (data.retried) {
        toast.success("Re-fetching reel metadata...");
      } else {
        posthog?.capture("reel_added_by_url");
        toast.success("Reel added! Fetching metadata...");
      }
      setUrlInput("");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteFailedMutation = trpc.collected.deleteFailed.useMutation({
    onSuccess: (data) => {
      utils.collected.list.invalidate();
      if (data.deleted > 0) {
        toast.success(`Removed ${data.deleted} failed reel${data.deleted === 1 ? "" : "s"}`);
      } else {
        toast.info("No failed reels to remove");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const retryMutation = trpc.collected.retry.useMutation({
    onSuccess: () => {
      utils.collected.list.invalidate();
      toast.success("Refreshing reel data...");
    },
  });

  const refreshAllMutation = trpc.collected.refreshAll.useMutation({
    onSuccess: (data) => {
      utils.collected.list.invalidate();
      if (data.refreshed > 0) toast.success(`Refreshing ${data.refreshed} reel(s)...`);
      else toast.info("All reels are up to date");
    },
  });

  const invalidateAfterCollectTranscribe = useCallback(() => {
    void utils.collected.list.invalidate();
  }, [utils]);

  const transcribeCollected = trpc.collected.transcribe.useMutation({
    onMutate: () => {
      transcribeInFlightRef.current += 1;
      setTranscribeInFlightBumper((n) => n + 1);
    },
    onSettled: (_d, _e, vars) => {
      releaseTranscribeSlot();
      invalidateAfterCollectTranscribe();
      if (vars.collectedReelId != null) {
        posthog?.capture("reel_transcribed", { collected_reel_id: vars.collectedReelId });
      }
    },
    onSuccess: () => {
      toast.info("Transcription started", {
        description: "Processing audio... This may take up to a minute.",
      });
    },
    onError: (err, vars) => {
      setPendingCollectedTranscribe((prev) => {
        const n = new Set(prev);
        n.delete(vars.collectedReelId);
        return n;
      });
      toast.error(err.message);
    },
  });

  const gridRecreateGenerate = trpc.recreate.generate.useMutation({
    onSuccess: () => utils.recreate.checkBatch.invalidate(),
    onError: (error) =>
      toast.error("Script generation failed", { description: error.message }),
  });

  useEffect(() => {
    const data = collectedQuery.data;
    if (!data?.length) return;
    setPendingCollectedTranscribe((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set(prev);
      let changed = false;
      for (const item of data) {
        if (!next.has(item.id)) continue;
        const st = item.transcriptionStatus;
        if (st === "completed" || st === "failed") {
          next.delete(item.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [collectedQuery.data]);

  useEffect(() => {
    setGridModalCollectedId(null);
    setVisibleLimit(REEL_LIBRARY_INITIAL_VISIBLE);
  }, [viewMode]);

  useEffect(() => {
    setVisibleLimit(REEL_LIBRARY_INITIAL_VISIBLE);
  }, [dateFilter, sortBy]);

  const runCollectTranscribe = useCallback(
    (item: CollectedRow, opts: { expand: boolean }) => {
      if (!transcribeGate.allowed) {
        toast.error(`Transcription limit reached (${transcribeGate.used}/${transcribeGate.limit})`, {
          description: "Upgrade your plan for more transcriptions.",
          action: { label: "Upgrade", onClick: () => (window.location.href = "/pricing") },
        });
        return;
      }
      if (transcribeInFlightRef.current >= 5) {
        toast.info("Please wait for some transcriptions to complete before starting more.");
        return;
      }
      if (opts.expand) {
        if (viewMode === "grid") setGridModalCollectedId(item.id);
        else setExpandedCollectedId(item.id);
      }
      setPendingCollectedTranscribe((prev) => new Set(prev).add(item.id));
      transcribeCollected.mutate({ collectedReelId: item.id });
    },
    [
      transcribeGate.allowed,
      transcribeGate.used,
      transcribeGate.limit,
      viewMode,
      transcribeCollected,
    ]
  );

  const getEffectiveViews = (item: CollectedRow) => {
    if (item.monitoredViewCount && item.monitoredViewCount > 0) return item.monitoredViewCount;
    return item.viewCount || 0;
  };

  const getEngagementRate = (item: CollectedRow) => {
    const followerCount = item.monitoredFollowerCount || item.ownerFollowerCount;
    if (!followerCount || followerCount === 0) return null;
    return (((item.likeCount || 0) + (item.commentCount || 0)) / followerCount) * 100;
  };

  const filteredReels = useMemo(() => {
    if (dateFilter === "all") return collectedRows;
    const days = parseInt(dateFilter, 10);
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return collectedRows.filter((r) => {
      if (!r.postedAt) return false;
      return new Date(r.postedAt).getTime() >= cutoff.getTime();
    });
  }, [collectedRows, dateFilter]);

  const sortedReels = useMemo(() => {
    const all = [...filteredReels];

    switch (sortBy) {
      case "views":
        return all.sort((a, b) => getEffectiveViews(b) - getEffectiveViews(a));
      case "likes":
        return all.sort((a, b) => (b.likeCount || 0) - (a.likeCount || 0));
      case "comments":
        return all.sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0));
      case "engagement":
        return all.sort(
          (a, b) => (getEngagementRate(b) || 0) - (getEngagementRate(a) || 0)
        );
      case "posted_oldest":
        return all.sort((a, b) => {
          const aTime = a.postedAt
            ? new Date(a.postedAt).getTime()
            : new Date(a.createdAt).getTime();
          const bTime = b.postedAt
            ? new Date(b.postedAt).getTime()
            : new Date(b.createdAt).getTime();
          return aTime - bTime;
        });
      case "posted_newest":
        return all.sort((a, b) => {
          const aTime = a.postedAt
            ? new Date(a.postedAt).getTime()
            : new Date(a.createdAt).getTime();
          const bTime = b.postedAt
            ? new Date(b.postedAt).getTime()
            : new Date(b.createdAt).getTime();
          return bTime - aTime;
        });
      case "added_oldest":
        return all.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
      case "added_newest":
      default:
        return all.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }
  }, [filteredReels, sortBy]);

  const displayedReels = useMemo(
    () => sortedReels.slice(0, visibleLimit),
    [sortedReels, visibleLimit]
  );

  const hasMoreReels = sortedReels.length > visibleLimit;

  useEffect(() => {
    setVisibleLimit((prev) =>
      sortedReels.length <= REEL_LIBRARY_INITIAL_VISIBLE
        ? REEL_LIBRARY_INITIAL_VISIBLE
        : Math.min(prev, sortedReels.length)
    );
  }, [sortedReels.length]);

  const mappedReelIds = useMemo(
    () =>
      [
        ...new Set(
          displayedReels
            .map((r) => r.transcriptionReelId)
            .filter((id): id is number => id != null && id > 0)
        ),
      ],
    [displayedReels]
  );

  const recreateBatchQuery = trpc.recreate.checkBatch.useQuery(
    { reelIds: mappedReelIds },
    {
      enabled: mappedReelIds.length > 0,
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

  const recreateMap = recreateBatchQuery.data || {};

  const brandCoachBatch = useBrandCoachBatchPrefetched({ reelIds: mappedReelIds });

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
      void utils.collected.list.invalidate();
      void utils.recreate.checkBatch.invalidate();
    },
    [utils]
  );

  const {
    libraryRemakeKey,
    getRemakeState,
    startRemake,
    retryRemake,
    startInspirationSave,
    openRemakeWorkspace,
    RemakeDialogs,
  } = useLibraryRemakeChain({
    onStageChange: libraryRemakeOnStageChange,
    onOpenTeleprompter: triggerOpenMyScript,
  });

  const currentSortOption =
    SORT_OPTIONS.find((o) => o.value === sortBy) || SORT_OPTIONS[4];

  const gridModalRow = useMemo(
    () =>
      gridModalCollectedId == null
        ? null
        : sortedReels.find((r) => r.id === gridModalCollectedId) ?? null,
    [gridModalCollectedId, sortedReels]
  );

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    setAddingUrl(true);
    addByUrlMutation.mutate({ url: urlInput.trim() }, { onSettled: () => setAddingUrl(false) });
  };

  const isTelegramConnected = telegramQuery.data?.connected;
  const botUsername = telegramQuery.data?.botUsername;
  const telegramReels = collectedRows.filter((r) => r.source === "telegram");
  const failedCount = collectedRows.filter((r) => r.status === "failed").length;

  function isCollectedSaved(reel: CollectedRow): boolean {
    const mirrorId = reel.transcriptionReelId;
    if (mirrorId == null || mirrorId <= 0) return false;
    return !!savedMap[mirrorId];
  }

  function renderGridSaveAndRemove(reel: CollectedRow) {
    const isSaved = isCollectedSaved(reel);
    const ready = reel.status === "ready";
    return (
      <div className="flex items-center gap-1.5">
        {ready ? (
          <button
            type="button"
            className={`flex h-10 w-10 items-center justify-center rounded-full backdrop-blur transition-colors ${
              isSaved
                ? "bg-emerald-500/90 text-white hover:bg-emerald-500"
                : "bg-black/55 text-white/90 hover:bg-black/75"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleCollectedSave.mutate({ collectedReelId: reel.id });
            }}
            disabled={toggleCollectedSave.isPending}
            title={isSaved ? "Remove from saved" : "Save reel"}
            aria-label={isSaved ? "Remove from saved" : "Save reel"}
          >
            {isSaved ? (
              <BookmarkCheck className="h-4 w-4" />
            ) : (
              <Bookmark className="h-4 w-4" />
            )}
          </button>
        ) : null}
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-black/55 text-white/90 backdrop-blur transition-colors hover:bg-destructive/90 hover:text-white"
          onClick={(e) => {
            e.stopPropagation();
            deleteMutation.mutate({ id: reel.id });
          }}
          disabled={deleteMutation.isPending}
          title="Remove from collection"
          aria-label="Remove from collection"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function renderCollectedActions(
    reel: CollectedRow,
    opts: {
      mappedReelId: number | null;
      compact?: boolean;
      hideExternal?: boolean;
      gridTile?: boolean;
    }
  ) {
    const { mappedReelId, compact = false, hideExternal = false, gridTile = false } = opts;
    const engagementRate = getEngagementRate(reel);
    const isPending = reel.status === "pending";
    const isFailed = reel.status === "failed";
    const isReady = reel.status === "ready";

    if (isPending) {
      if (gridTile) {
        return (
          <div className="w-full" onClick={(e) => e.stopPropagation()}>
            <Button variant="outline" size="sm" className="min-h-10 w-full justify-center text-xs" disabled>
              <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Fetching...
            </Button>
          </div>
        );
      }
      return (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled>
            <Loader2 className="mr-1 h-3 w-3 animate-spin" /> Fetching...
          </Button>
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
      );
    }

    if (isFailed) {
      if (gridTile) {
        return (
          <div className="w-full" onClick={(e) => e.stopPropagation()}>
            <Button
              variant="outline"
              size="sm"
              className="min-h-10 w-full justify-center text-xs"
              onClick={() => retryMutation.mutate({ id: reel.id })}
              disabled={retryMutation.isPending}
            >
              <RefreshCw className="h-3 w-3 sm:mr-1" /> Retry
            </Button>
          </div>
        );
      }
      return (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
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
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={() => deleteMutation.mutate({ id: reel.id })}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      );
    }

    if (!isReady) return null;

    const hasTranscription = reel.transcriptionStatus === "completed" && mappedReelId != null && mappedReelId > 0;
    const isNoSpeech = !!(reel.transcriptionStatus === "completed" && reel.transcriptionIsNoSpeech);
    const txProcessingLocal = pendingCollectedTranscribe.has(reel.id);
    const isProcessing =
      reel.transcriptionStatus === "processing" || txProcessingLocal;
    const transcriptionFailed =
      reel.transcriptionStatus === "failed" && !txProcessingLocal;

    const isTxQueued =
      isProcessing &&
      (reel.transcriptionStatus !== "processing" ||
        reel.transcriptionStartedAt == null);

    const recreateSt =
      mappedReelId != null
        ? reelRecreateState(
            recreateMap[mappedReelId as keyof typeof recreateMap] as
              | RecreateBatchEntry
              | undefined
          )
        : "none";

    const transcriptionShape =
      hasTranscription && !isNoSpeech
        ? { status: "completed" as const, transcript: "word ".repeat(8).trimEnd(), segments: [] as const }
        : null;
    const listRemakeHint = mergeRemakeability(transcriptionShape, reel as ReelClassificationLike);
    const idleNotRemakeable =
      listRemakeHint.notRemakeable && hasTranscription && !isNoSpeech && recreateSt === "none";

    const librarySource = collectedRowToLibraryRemakeSource(reel, mappedReelId);
    const hookState = getRemakeState(libraryRemakeKey(librarySource));
    const isProcessingForStrip =
      isProcessing || hookState?.stage === "transcribing";
    const batchEntry =
      mappedReelId != null
        ? (recreateMap[mappedReelId as keyof typeof recreateMap] as RecreateBatchEntry | undefined)
        : undefined;
    const alreadyTranscribed = mappedReelId != null && hasTranscription && !isNoSpeech;
    const resolvedOpenReelId = mappedReelId ?? hookState.reelId ?? null;
    const remakeMedia = buildRemakeIntentMedia({
      thumbnailUrl: reel.thumbnailUrl,
      videoUrl: reel.videoUrl,
      shortcode: reel.shortcode,
      reelId: mappedReelId,
      platform: collectedPlatform(reel),
      reelUrl: reel.reelUrl,
      duration: reel.duration,
    });
    const oneClickRemake = buildLibraryOneClickRemake({
      openScriptReelId: resolvedOpenReelId,
      isNoSpeech,
      alreadyTranscribed,
      idleNotRemakeable,
      classificationReason: reel.classificationReason ?? undefined,
      classification: reelClassificationFromRow(reel),
      batchRecreateSt: recreateSt,
      batchEntry,
      hookState,
      librarySource,
      media: remakeMedia,
      startRemake,
      retryRemake,
      startInspirationSave,
      openRemakeWorkspace,
    });

    const actionReelId = mappedReelId ?? reel.id;
    const hasIg = !!(reel.reelUrl ?? "").trim();

    return (
      <div
        className={
          gridTile
            ? "w-full"
            : "flex shrink-0 flex-wrap items-center justify-end gap-0.5 sm:gap-1"
        }
        onClick={(e) => e.stopPropagation()}
      >
        {!gridTile ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7 shrink-0 text-xs"
            onClick={(e) => {
              e.stopPropagation();
              retryMutation.mutate({ id: reel.id });
            }}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? (
              <Loader2 className="h-3 w-3 sm:mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3 sm:mr-1" />
            )}
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        ) : null}

        <ReelActionButtons
          collectionMode={!gridTile}
          source={{ source: "user_job", reelId: actionReelId, jobId: 0 }}
          reelId={actionReelId}
          reelUrl={hasIg ? reel.reelUrl! : "https://www.instagram.com/"}
          isSaved={isCollectedSaved(reel)}
          hasTranscription={hasTranscription}
          isProcessing={isProcessingForStrip}
          isFailed={transcriptionFailed}
          recreateState={recreateSt}
          isQueued={isTxQueued}
          isNoSpeech={isNoSpeech}
          oneClickRemake={oneClickRemake}
          compact={compact || gridTile}
          hideBookmark={gridTile}
          hideExternalLink={hideExternal || !hasIg}
          onToggleSave={() => {
            if (reel.status !== "ready") return;
            toggleCollectedSave.mutate({ collectedReelId: reel.id });
          }}
          saveBusy={toggleCollectedSave.isPending}
          onTranscribe={() => {}}
          onExpand={() => {
            if (mappedReelId == null || isNoSpeech) return;
            if (viewModeRef.current === "grid") setGridModalCollectedId(reel.id);
            else setExpandedCollectedId(reel.id);
          }}
          onMakeVersion={() => {}}
          onOpenMyScript={() => {}}
          onRemoveFromCollection={
            gridTile ? undefined : () => deleteMutation.mutate({ id: reel.id })
          }
          removeFromCollectionBusy={gridTile ? undefined : deleteMutation.isPending}
        />
      </div>
    );
  }

  /** Full strip used in expanded panel (transcribe before mapped reel exists). */
  function renderExpandedTranscribeOnly(reel: CollectedRow) {
    const isProcessingLocal = pendingCollectedTranscribe.has(reel.id);
    return (
      <div className="border-t border-border bg-accent/10 p-4">
        <div className="py-4 text-center">
          <Film className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
          <p className="mb-3 text-sm text-muted-foreground">
            Transcribe this reel first to unlock Re-Create and script generation.
          </p>
          <Button
            size="sm"
            onClick={() => runCollectTranscribe(reel, { expand: false })}
            disabled={transcribeCollected.isPending || isProcessingLocal || !transcribeGate.allowed}
          >
            {transcribeCollected.isPending || isProcessingLocal ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : null}
            Transcribe Now
          </Button>
        </div>
      </div>
    );
  }

  const engagementPctForPreview = (r: CollectedRow) => getEngagementRate(r) ?? 0;

  return (
    <div className="mx-auto max-w-7xl px-2 sm:px-0">
      {RemakeDialogs}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground sm:text-2xl">
            <Inbox className="h-5 w-5 text-primary sm:h-6 sm:w-6" />
            Collected Reels
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {collectedRows.length} reel{collectedRows.length !== 1 ? "s" : ""} collected
            {telegramReels.length > 0 ? ` (${telegramReels.length} from Telegram)` : ""}
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
              <List className="mr-1 h-3.5 w-3.5" /> List
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "grid" ? "default" : "ghost"}
              className="min-h-9 px-3 text-xs"
              onClick={() => setViewModeTracked("grid")}
            >
              <Grid3X3 className="mr-1 h-3.5 w-3.5" /> Grid
            </Button>
          </div>

          {collectedRows.length > 0 && (
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

          {failedCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs text-destructive hover:text-destructive"
              onClick={() => deleteFailedMutation.mutate()}
              disabled={deleteFailedMutation.isPending}
            >
              {deleteFailedMutation.isPending ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : null}
              Clear {failedCount} failed
            </Button>
          )}

          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-8 w-36 text-xs">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              {DATE_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="h-8 w-[13rem] text-xs">
              <div className="flex items-center gap-1.5">
                {currentSortOption && <currentSortOption.icon className="h-3 w-3" />}
                <span>{currentSortOption?.label}</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((opt) => (
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

      {!telegramQuery.isLoading && !isTelegramConnected && (
        <div className="mb-6 rounded-lg border border-blue-500/30 bg-blue-500/5 p-4">
          <div className="flex items-start gap-3">
            <Send className="mt-0.5 h-5 w-5 shrink-0 text-blue-400" />
            <div className="flex-1">
              <h3 className="mb-1 text-sm font-semibold text-foreground">
                Connect Telegram to Collect Reels from Mobile
              </h3>
              <p className="mb-3 text-xs text-muted-foreground">
                Share Instagram, TikTok, or YouTube links from your phone to the SpyReels Telegram bot. They&apos;ll appear
                here automatically for transcription and script generation.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-blue-500/30 text-xs text-blue-400 hover:bg-blue-500/10"
                onClick={() => (window.location.href = "/settings")}
              >
                <Send className="mr-1.5 h-3 w-3" />
                Connect Telegram in Settings
              </Button>
            </div>
          </div>
        </div>
      )}

      {isTelegramConnected && (
        <div className="mb-6 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="flex items-center gap-2 text-xs text-emerald-400">
            <Send className="h-3.5 w-3.5" />
            <span>
              Telegram connected{botUsername ? `: share video links to @${botUsername}` : ""}. They&apos;ll appear here
              automatically.
            </span>
          </div>
        </div>
      )}

      <div className="mb-6 flex gap-2">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Paste Instagram, TikTok, or YouTube URL..."
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddUrl()}
            className="h-9 pl-9 text-sm"
          />
        </div>
        <Button size="sm" className="h-9 px-4" onClick={handleAddUrl} disabled={addingUrl || !urlInput.trim()}>
          {addingUrl ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1.5 h-3.5 w-3.5" />}
          Add Reel
        </Button>
      </div>

      {collectedQuery.isLoading && <WorkspaceReelGridSkeleton count={8} />}

      {!collectedQuery.isLoading && collectedRows.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <h2 className="mb-2 text-lg font-medium text-foreground">No collected reels yet</h2>
          <p className="mb-4 max-w-md text-sm text-muted-foreground">
            Collect videos by sharing Instagram, TikTok, or YouTube links to the Telegram bot, or paste URLs above.
          </p>
        </div>
      )}

      {!collectedQuery.isLoading && dateFilter !== "all" && (
        <p className="mb-3 text-xs text-muted-foreground">
          Showing {sortedReels.length} of {collectedRows.length} reels
        </p>
      )}

      {sortedReels.length > 0 && viewMode === "list" && (
        <div key="list" className="space-y-1">
          {displayedReels.map((reel, index) => {
            const effectiveViews = getEffectiveViews(reel);
            const engagementRate = getEngagementRate(reel);
            const mappedReelId = reel.transcriptionReelId ?? null;
            const isExpanded = expandedCollectedId === reel.id;
            const isPending = reel.status === "pending";
            const isFailed = reel.status === "failed";
            const isReady = reel.status === "ready";

            const hasTranscription =
              reel.transcriptionStatus === "completed" &&
              mappedReelId != null &&
              mappedReelId > 0;
            const isNoSpeech = !!(reel.transcriptionStatus === "completed" && reel.transcriptionIsNoSpeech);

            const isTranscriptionProcessing =
              reel.transcriptionStatus === "processing" || pendingCollectedTranscribe.has(reel.id);

            const isTranscriptionFailed =
              reel.transcriptionStatus === "failed" && !pendingCollectedTranscribe.has(reel.id);

            return (
              <div key={reel.id} className="overflow-hidden rounded-lg border border-border/30">
                <div
                  className={`flex cursor-pointer items-center gap-2 bg-card/50 p-2 transition-colors hover:bg-card sm:gap-3 sm:p-3 ${
                    isExpanded ? "border-b border-border/30 bg-card" : ""
                  } ${isPending || isFailed ? "cursor-default opacity-95" : ""}`}
                  onClick={() =>
                    !isPending && !isFailed && isReady && setExpandedCollectedId(isExpanded ? null : reel.id)
                  }
                >
                  <span className="hidden w-5 shrink-0 text-right font-mono text-sm text-muted-foreground sm:block sm:w-6">
                    {index + 1}
                  </span>

                  <div className="relative h-18 w-14 shrink-0 overflow-hidden rounded-md bg-muted">
                    {(reel.thumbnailUrl ?? "").trim() ? (
                      <>
                        <ReelGridThumbnail
                          className="relative h-full w-full"
                          thumbnailUrl={reel.thumbnailUrl}
                          width={56}
                          height={72}
                        />
                        <span className="pointer-events-none absolute left-0.5 top-0.5 rounded bg-black/70 px-0.5 text-[8px] text-white">
                          <SourcePlatformBadge reel={reel} />
                        </span>
                        {reel.duration ? (
                          <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-black/70 px-1 font-mono text-[9px] text-white">
                            {Math.floor(reel.duration / 60)}:
                            {(Math.floor(reel.duration % 60)).toString().padStart(2, "0")}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <div className="relative flex h-full w-full flex-col items-center justify-center gap-1">
                        <span className="pointer-events-none absolute left-0.5 top-0.5 rounded bg-black/70 px-0.5 text-[8px] text-white">
                          <SourcePlatformBadge reel={reel} />
                        </span>
                        {isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : isFailed ? (
                          <AlertCircle className="h-4 w-4 text-destructive" />
                        ) : (
                          <Film className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    {isPending && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>{reel.errorMessage || "Fetching reel from Instagram…"}</span>
                      </div>
                    )}
                    {isFailed && (
                      <div className="flex items-center gap-2 text-sm text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />
                        <span>{reel.errorMessage || "Failed to fetch reel data"}</span>
                      </div>
                    )}
                    {isReady && (
                      <>
                        <div className="mb-0.5 flex flex-wrap items-center gap-2">
                          {reel.ownerUsername && (
                            <span className="text-xs font-medium text-primary">@{reel.ownerUsername}</span>
                          )}
                          {hasTranscription && !isNoSpeech && (
                            <Badge variant="secondary" className="h-5 text-[10px]">
                              Transcribed
                            </Badge>
                          )}
                          {hasTranscription && isNoSpeech && (
                            <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground">
                              No voice
                            </span>
                          )}
                          {isTranscriptionProcessing && (
                            <span className="animate-pulse rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-medium text-amber-400">
                              Processing
                            </span>
                          )}
                          {isTranscriptionFailed && (
                            <span className="rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-medium text-red-400">
                              Failed
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-2 text-sm leading-snug text-foreground">
                          {reel.caption || <span className="italic text-muted-foreground">No caption</span>}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          {effectiveViews > 0 && (
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" /> {formatNumber(effectiveViews)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Heart className="h-3 w-3" /> {formatNumber(reel.likeCount || 0)}
                          </span>
                          <span className="flex items-center gap-1">
                            <MessageCircle className="h-3 w-3" /> {formatNumber(reel.commentCount || 0)}
                          </span>
                          {engagementRate != null && engagementRate > 0 && (
                            <span className="flex items-center gap-1 font-medium text-emerald-400">
                              <TrendingUp className="h-3 w-3" /> {engagementRate.toFixed(2)}%
                            </span>
                          )}
                          {reel.postedAt && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Clock className="h-3 w-3" /> {formatPostedTime(reel.postedAt, userTimezone)}
                            </span>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                    {renderCollectedActions(reel, { mappedReelId })}
                    {isReady && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0 text-muted-foreground"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedCollectedId(isExpanded ? null : reel.id);
                        }}
                      >
                        {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </Button>
                    )}
                  </div>
                </div>

                {isExpanded && mappedReelId != null && (
                  <CollectedReelWorkflow
                    collectedReelId={reel.id}
                    reelId={mappedReelId}
                    handle={reel.ownerUsername || "unknown"}
                    userTimezone={userTimezone}
                    postedAt={reel.postedAt || new Date()}
                    reelClassification={reel}
                    recreateEntrySignal={
                      recreatePulse?.reelId === mappedReelId
                        ? { nonce: recreatePulse.nonce, openScriptId: recreatePulse.openScriptId }
                        : undefined
                    }
                  />
                )}

                {isExpanded && !mappedReelId && isReady && renderExpandedTranscribeOnly(reel)}
              </div>
            );
          })}
        </div>
      )}

      {sortedReels.length > 0 && viewMode === "grid" && (
        <div key="grid" className={WORKSPACE_REEL_GRID_CLASS}>
          {displayedReels.map((reel, index) => {
            const mappedReelId = reel.transcriptionReelId ?? null;
            const isPending = reel.status === "pending";
            const isFailed = reel.status === "failed";
            const isReady = reel.status === "ready";

            const hasTranscription =
              reel.transcriptionStatus === "completed" && mappedReelId != null && mappedReelId > 0;
            const isNoSpeech = !!(reel.transcriptionStatus === "completed" && reel.transcriptionIsNoSpeech);
            const isProcessing =
              reel.transcriptionStatus === "processing" || pendingCollectedTranscribe.has(reel.id);
            const engagementRate = getEngagementRate(reel) ?? 0;
            const effectiveViews = getEffectiveViews(reel);
            const statusMessage = isPending
              ? reel.errorMessage || "Fetching from Instagram..."
              : isFailed
                ? reel.errorMessage || "Could not load this reel. Retry or remove it."
                : null;
            const hasThumb = isReady && !!(reel.thumbnailUrl ?? "").trim();

            const recreateSt =
              mappedReelId != null
                ? reelRecreateState(
                    recreateMap[mappedReelId as keyof typeof recreateMap] as
                      | RecreateBatchEntry
                      | undefined
                  )
                : "none";
            const transcriptionShape =
              hasTranscription && !isNoSpeech
                ? {
                    status: "completed" as const,
                    transcript: "word ".repeat(8).trimEnd(),
                    segments: [] as const,
                  }
                : null;
            const listRemakeHint = mergeRemakeability(
              transcriptionShape,
              reel as ReelClassificationLike
            );
            const idleNotRemakeable =
              listRemakeHint.notRemakeable &&
              hasTranscription &&
              !isNoSpeech &&
              recreateSt === "none";
            const librarySource = collectedRowToLibraryRemakeSource(reel, mappedReelId);
            const hookState = getRemakeState(libraryRemakeKey(librarySource));
            const batchEntry =
              mappedReelId != null
                ? (recreateMap[mappedReelId as keyof typeof recreateMap] as
                    | RecreateBatchEntry
                    | undefined)
                : undefined;
            const oneClickRemakeForQuiet = isReady
              ? buildLibraryOneClickRemake({
                  openScriptReelId: mappedReelId ?? hookState.reelId ?? null,
                  isNoSpeech,
                  alreadyTranscribed: mappedReelId != null && hasTranscription && !isNoSpeech,
                  idleNotRemakeable,
                  classificationReason: reel.classificationReason ?? undefined,
                  classification: reelClassificationFromRow(reel),
                  batchRecreateSt: recreateSt,
                  batchEntry,
                  hookState,
                  librarySource,
                  media: buildRemakeIntentMedia({
                    thumbnailUrl: reel.thumbnailUrl,
                    videoUrl: reel.videoUrl,
                    shortcode: reel.shortcode,
                    reelId: mappedReelId,
                    platform: collectedPlatform(reel),
                    reelUrl: reel.reelUrl,
                    duration: reel.duration,
                  }),
                  startRemake,
                  retryRemake,
                  startInspirationSave,
                  openRemakeWorkspace,
                })
              : null;
            const remakeStatusLabel = isReady
              ? quietRemakeStatusFromState({
                  hookStage: hookState.stage,
                  batchState: recreateSt,
                  hasSavedScript: Boolean(batchEntry?.latestScriptId || hookState.scriptId),
                })
              : null;

            return (
              <WorkspaceReelGridTile
                key={reel.id}
                chrome="quiet"
                index={index}
                isActive={isReady && gridModalCollectedId === reel.id}
                thumbnailUrl={hasThumb ? reel.thumbnailUrl : null}
                videoUrl={hasThumb ? reel.videoUrl : null}
                shortcode={reel.shortcode}
                reelId={mappedReelId ?? undefined}
                duration={isReady ? reel.duration : null}
                reelUrl={isReady ? reel.reelUrl : null}
                interactiveMedia={isReady && hasThumb}
                inlinePlaying={inlinePlayingId === reel.id}
                onInlinePlayRequest={() => setInlinePlayingId(reel.id)}
                onInlinePlayStop={() =>
                  setInlinePlayingId((cur) => (cur === reel.id ? null : cur))
                }
                onMetaClick={isReady ? () => setGridModalCollectedId(reel.id) : undefined}
                statusChip={
                  remakeStatusLabel ? (
                    <QuietRemakeStatusChip label={remakeStatusLabel} />
                  ) : undefined
                }
                mediaPlatform={collectedPlatform(reel)}
                mediaFallback={
                  <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-muted/40 p-4 text-center">
                    {isPending ? (
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/60" />
                    ) : isFailed ? (
                      <AlertCircle className="h-8 w-8 text-destructive/70" />
                    ) : (
                      <Film className="h-8 w-8 text-muted-foreground/60" />
                    )}
                    <span className="line-clamp-4 text-[10px] leading-snug text-muted-foreground">
                      {statusMessage ?? "No thumbnail"}
                    </span>
                  </div>
                }
                caption={
                  <QuietReelCaption>
                    {!isReady ? (
                      statusMessage
                    ) : reel.caption ? (
                      reel.caption
                    ) : (
                      <span className="italic text-[#a8a3b3]">No caption</span>
                    )}
                  </QuietReelCaption>
                }
                creator={
                  isReady ? (
                    <QuietCreatorButton
                      handle={reel.ownerUsername}
                      onOpen={() =>
                        void openCreator({
                          handle: reel.ownerUsername,
                          platform:
                            collectedPlatform(reel) === "tiktok"
                              ? "tiktok"
                              : collectedPlatform(reel) === "youtube"
                                ? "youtube"
                                : "instagram",
                        })
                      }
                    />
                  ) : null
                }
                stats={
                  isReady ? (
                    <QuietReelMetrics
                      views={effectiveViews}
                      engagementPct={engagementRate}
                      reachViews={effectiveViews}
                      reachFollowers={
                        reel.monitoredFollowerCount || reel.ownerFollowerCount
                      }
                      postedAt={
                        reel.postedAt instanceof Date
                          ? reel.postedAt.toISOString()
                          : reel.postedAt
                      }
                    />
                  ) : (
                    <div className="min-h-[0.875rem]" aria-hidden />
                  )
                }
                actions={
                  isReady && oneClickRemakeForQuiet ? (
                    <QuietRemakeActions
                      remakeLabel={oneClickRemakeForQuiet.label}
                      remakeDisabled={oneClickRemakeForQuiet.disabled}
                      remakeBusy={oneClickRemakeForQuiet.loading}
                      onRemake={() => oneClickRemakeForQuiet.onClick()}
                      saved={isCollectedSaved(reel)}
                      onToggleSave={() => {
                        if (reel.status !== "ready") return;
                        toggleCollectedSave.mutate({ collectedReelId: reel.id });
                      }}
                      moreOpen={quietMoreId === reel.id}
                      onToggleMore={() =>
                        setQuietMoreId((cur) => (cur === reel.id ? null : reel.id))
                      }
                      moreMenu={
                        quietMoreId === reel.id ? (
                          <div className="absolute bottom-11 right-0 z-30 grid min-w-[160px] gap-0.5 rounded-[12px] border border-[#2b2739] bg-[#1d1b24] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.45)]">
                            <button
                              type="button"
                              className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
                              onClick={() => {
                                setQuietMoreId(null);
                                setGridModalCollectedId(reel.id);
                              }}
                            >
                              View details
                            </button>
                            {reel.ownerUsername ? (
                              <button
                                type="button"
                                className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
                                onClick={() => {
                                  setQuietMoreId(null);
                                  void openCreator({
                                    handle: reel.ownerUsername,
                                    platform:
                                      collectedPlatform(reel) === "tiktok"
                                        ? "tiktok"
                                        : collectedPlatform(reel) === "youtube"
                                          ? "youtube"
                                          : "instagram",
                                  });
                                }}
                              >
                                Open creator
                              </button>
                            ) : null}
                            {reel.reelUrl ? (
                              <a
                                href={reel.reelUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
                                onClick={() => setQuietMoreId(null)}
                              >
                                Open source
                              </a>
                            ) : null}
                            <button
                              type="button"
                              className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-[rgba(255,107,122,.08)] hover:text-[#ffb4bd]"
                              onClick={() => {
                                setQuietMoreId(null);
                                deleteMutation.mutate({ id: reel.id });
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        ) : null
                      }
                    />
                  ) : (
                    renderCollectedActions(reel, {
                      mappedReelId,
                      hideExternal: true,
                      gridTile: true,
                    })
                  )
                }
              />
            );
          })}
        </div>
      )}

      {hasMoreReels && sortedReels.length > 0 && (
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
        open={gridModalRow != null && gridModalRow.status === "ready"}
        onOpenChange={(open) => {
          if (!open) setGridModalCollectedId(null);
        }}
        reel={
          gridModalRow && gridModalRow.status === "ready"
            ? {
                id: gridModalRow.id,
                caption: gridModalRow.caption,
                thumbnailUrl: gridModalRow.thumbnailUrl,
                videoUrl: gridModalRow.videoUrl ?? "",
                viewCount: getEffectiveViews(gridModalRow),
                likeCount: gridModalRow.likeCount,
                commentCount: gridModalRow.commentCount,
                engagementRate: engagementPctForPreview(gridModalRow),
                postedAt: gridModalRow.postedAt || gridModalRow.createdAt,
                duration: gridModalRow.duration,
              }
            : null
        }
        userTimezone={userTimezone}
      >
        {gridModalRow && gridModalRow.status === "ready" ? (
          gridModalRow.transcriptionReelId != null ? (
            <CollectedReelWorkflow
              collectedReelId={gridModalRow.id}
              reelId={gridModalRow.transcriptionReelId}
              handle={gridModalRow.ownerUsername || "unknown"}
              userTimezone={userTimezone}
              postedAt={gridModalRow.postedAt || gridModalRow.createdAt}
              reelClassification={gridModalRow}
              recreateEntrySignal={
                recreatePulse?.reelId === gridModalRow.transcriptionReelId
                  ? { nonce: recreatePulse.nonce, openScriptId: recreatePulse.openScriptId }
                  : undefined
              }
              onRemakeSaved={() => setGridModalCollectedId(null)}
            />
          ) : (
            renderExpandedTranscribeOnly(gridModalRow)
          )
        ) : null}
      </GridReelWorkflowDialog>
    </div>
  );
}

function CollectedReelWorkflow({
  collectedReelId,
  reelId,
  handle,
  userTimezone,
  postedAt,
  reelClassification,
  recreateEntrySignal,
  onRemakeSaved,
}: {
  collectedReelId: number;
  reelId: number;
  handle: string;
  userTimezone: string;
  postedAt: Date | string;
  reelClassification?: ReelClassificationLike;
  recreateEntrySignal?: { nonce: number; openScriptId?: number };
  onRemakeSaved?: () => void;
}) {
  const utils = trpc.useUtils();
  const transcriptionQuery = trpc.collected.transcriptionStatus.useQuery(
    { reelId },
    {
      refetchInterval: (query) => {
        const data = query.state.data;
        if (data?.status === "completed") return false;
        return 3000;
      },
    }
  );

  const transcription = transcriptionQuery.data;
  const hasTranscription = transcription?.status === "completed";
  const isProcessing = transcription?.status === "processing";
  const listRemakeHint = mergeRemakeability(
    transcription
      ? {
          status: transcription.status,
          transcript: transcription.transcript,
          segments: transcription.segments,
        }
      : null,
    reelClassification
  );

  const transcribeMutation = trpc.collected.transcribe.useMutation({
    onSuccess: () => {
      void transcriptionQuery.refetch();
      void utils.collected.list.invalidate();
    },
  });

  const isNoSpeech =
    transcription?.status === "completed" &&
    !String(transcription?.transcript ?? "").trim() &&
    (!Array.isArray(transcription?.segments) || transcription!.segments!.length === 0);

  return (
    <InlineWorkflow
      reelId={reelId}
      handle={handle}
      hasTranscription={hasTranscription}
      isProcessing={!!isProcessing}
      isNoSpeech={isNoSpeech}
      inspirationPanelVariant="saved-collected"
      listRemakeHint={listRemakeHint}
      reelClassification={reelClassification}
      onTranscribe={() => {
        transcribeMutation.mutate({ collectedReelId });
        toast.info("Transcription started...");
      }}
      userTimezone={userTimezone}
      postedAt={postedAt}
      recreateEntrySignal={recreateEntrySignal}
      onRemakeSaved={onRemakeSaved}
    />
  );
}
