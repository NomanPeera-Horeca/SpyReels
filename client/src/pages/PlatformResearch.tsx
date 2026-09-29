import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  Loader2,
  Clock,
  ArrowLeft,
  Eye,
  Heart,
  MessageCircle,
  TrendingUp,
  Calendar as CalendarIcon,
  Share2,
  List,
  Grid3X3,
} from "lucide-react";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { MIN_SPY_DISPLAY_REELS } from "@shared/spyReelsLimits";
import { resolveFromParamFallback } from "@shared/appNavigation";
import { useAppBack } from "@/hooks/useAppBack";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { useUsageGate } from "@/hooks/useUsageGate";
import { WORKSPACE_REEL_GRID_CLASS } from "@/lib/workspaceReelGridLayout";
import { formatNumber, InlineWorkflow } from "@/components/InlineWorkflow";
import { GridReelWorkflowDialog } from "@/components/GridReelWorkflowDialog";
import Tooltip from "@/components/Tooltip";
import { PlatformVideoCard } from "@/components/PlatformVideoCard";
import {
  libraryRemakeKey,
  type LibraryRemakeSource,
  type LibraryRemakeStage,
  type LibraryRemakeState,
} from "@/lib/libraryRemakeChainCore";
import { useLibraryRemakeChain } from "@/hooks/useLibraryRemakeChain";
import { buildLibraryOneClickRemake } from "@/lib/oneClickRemakeAction";
import type { OneClickRemakeAction } from "@/components/ReelActionButtons";
import type {
  PlatformResearchConfig,
  PlatformVideoLike,
  SortOption,
} from "@/lib/platformResearchConfigs";

type ViewMode = "list" | "grid";

const RECREATE_BATCH_STALE_MS = 300_000;
const RECREATE_BATCH_POLL_MS = 5_000;

type RecreateBatchEntry = { latestScriptId: number; status: string };

function videoRecreateState(
  entry: RecreateBatchEntry | undefined
): "none" | "generating" | "ready" | "failed" {
  if (!entry) return "none";
  if (entry.status === "pending" || entry.status === "processing") {
    return "generating";
  }
  if (entry.status === "completed") return "ready";
  return "failed";
}

const SORT_ICONS: Record<SortOption, React.ReactNode> = {
  views_desc: <Eye className="h-3.5 w-3.5" />,
  likes_desc: <Heart className="h-3.5 w-3.5" />,
  comments_desc: <MessageCircle className="h-3.5 w-3.5" />,
  shares_desc: <Share2 className="h-3.5 w-3.5" />,
  engagement_desc: <TrendingUp className="h-3.5 w-3.5" />,
  date_desc: <CalendarIcon className="h-3.5 w-3.5" />,
  date_asc: <CalendarIcon className="h-3.5 w-3.5" />,
};

function toPlatformVideos(
  rows: Array<Record<string, unknown>>
): PlatformVideoLike[] {
  return rows.map((row) => ({
    id: Number(row.id),
    viewCount: Number(row.viewCount ?? 0),
    likeCount: Number(row.likeCount ?? 0),
    commentCount: Number(row.commentCount ?? 0),
    shareCount: row.shareCount == null ? undefined : Number(row.shareCount),
    thumbnailUrl: (row.thumbnailUrl as string | null) ?? null,
    videoPageUrl: String(row.videoPageUrl ?? ""),
    durationSec: row.durationSec == null ? null : Number(row.durationSec),
    postedAt: row.postedAt as Date,
    engagementRate: Number(row.engagementRate ?? 0),
    caption: (row.caption as string | null | undefined) ?? null,
    title: (row.title as string | null | undefined) ?? null,
    videoUrl: (row.videoUrl as string | null | undefined) ?? null,
    outsideSpyWindow:
      row.outsideSpyWindow == null ? null : Boolean(row.outsideSpyWindow),
  }));
}

export default function PlatformResearch({
  config,
  initialJobId,
  initialHandle,
}: {
  config: PlatformResearchConfig;
  initialJobId?: number;
  initialHandle?: string;
}) {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const fromPage = useMemo(() => {
    const params = new URLSearchParams(searchString);
    return params.get("from") || null;
  }, [searchString]);
  const researchBackFallback = useMemo(() => {
    const resolved = resolveFromParamFallback(fromPage);
    return resolved === "/research"
      ? `/research?platform=${config.platform}`
      : resolved;
  }, [fromPage, config.platform]);
  const handleResearchBack = useAppBack(researchBackFallback);
  const utils = trpc.useUtils();
  const [handle, setHandle] = useState(initialHandle ?? "");
  const autoStartedHandleRef = useRef<string | null>(null);
  const [timeframe, setTimeframe] = useState<"30" | "90" | "180">("30");
  const [activeJobId, setActiveJobId] = useState<number | null>(
    initialJobId ?? null
  );
  const [sortBy, setSortBy] = useState<SortOption>("engagement_desc");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [gridModalVideoId, setGridModalVideoId] = useState<number | null>(null);
  /** Freeze-safe: only one grid tile mounts an inline player at a time. */
  const [inlinePlayingId, setInlinePlayingId] = useState<number | null>(null);
  const [pendingTranscriptions, setPendingTranscriptions] = useState<
    Set<number>
  >(() => new Set());
  const [recreatePulse, setRecreatePulse] = useState<{
    videoId: number;
    nonce: number;
    openScriptId?: number;
  } | null>(null);
  const [txStatusById, setTxStatusById] = useState<
    Record<
      number,
      { status: string; transcript?: string | null; segments?: unknown }
    >
  >({});
  const scrapeGate = useUsageGate("scrapeCount");
  const prefsQuery = trpc.preferences.get.useQuery();
  const userTimezone = prefsQuery.data?.timezone || "America/Chicago";

  useEffect(() => {
    if (initialJobId != null) {
      setActiveJobId(initialJobId);
    }
  }, [initialJobId]);

  useEffect(() => {
    const previousTitle = document.title;
    let robotsMeta = document.querySelector('meta[name="robots"]');
    const created = !robotsMeta;
    const previousRobots = robotsMeta?.getAttribute("content") ?? null;

    if (!robotsMeta) {
      robotsMeta = document.createElement("meta");
      robotsMeta.setAttribute("name", "robots");
      document.head.appendChild(robotsMeta);
    }

    document.title = config.documentTitle;
    robotsMeta.setAttribute("content", "noindex,nofollow");

    return () => {
      document.title = previousTitle;
      if (created && robotsMeta?.parentNode) {
        robotsMeta.parentNode.removeChild(robotsMeta);
      } else if (robotsMeta) {
        if (previousRobots) {
          robotsMeta.setAttribute("content", previousRobots);
        } else {
          robotsMeta.removeAttribute("content");
        }
      }
    };
  }, [config.documentTitle]);

  // Platform-specific tRPC procedures are strongly typed; switch here once.
  const tiktokStart = trpc.tiktokScrape.start.useMutation({
    onSuccess: (data) => {
      setLocation(`${config.routePrefix}?jobId=${data.jobId}&from=research`);
    },
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly research limit reached.");
      } else {
        toast.error(err.message);
      }
    },
  });
  const youtubeStart = trpc.youtubeScrape.start.useMutation({
    onSuccess: (data) => {
      setLocation(`${config.routePrefix}?jobId=${data.jobId}&from=research`);
    },
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly research limit reached.");
      } else {
        toast.error(err.message);
      }
    },
  });
  useEffect(() => {
    if (config.platform !== "tiktok" || !initialHandle || initialJobId != null) return;
    if (!/^[a-z0-9._]{2,24}$/i.test(initialHandle) || autoStartedHandleRef.current === initialHandle) return;
    autoStartedHandleRef.current = initialHandle;
    setHandle(initialHandle);
    tiktokStart.mutate({ handle: initialHandle, timeframe: "30" });
  }, [config.platform, initialHandle, initialJobId, tiktokStart]);

  const startPending =
    config.platform === "tiktok"
      ? tiktokStart.isPending
      : youtubeStart.isPending;

  const tiktokProgress = trpc.tiktokScrape.progress.useQuery(
    { jobId: activeJobId! },
    {
      enabled: config.platform === "tiktok" && activeJobId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed") return false;
        return 2000;
      },
    }
  );
  const youtubeProgress = trpc.youtubeScrape.progress.useQuery(
    { jobId: activeJobId! },
    {
      enabled: config.platform === "youtube" && activeJobId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed") return false;
        return 2000;
      },
    }
  );
  const job =
    config.platform === "tiktok"
      ? tiktokProgress.data
      : youtubeProgress.data;

  const isRunning =
    activeJobId != null &&
    job?.status !== "completed" &&
    job?.status !== "failed";

  const tiktokVideos = trpc.tiktokScrape.videos.useQuery(
    { jobId: activeJobId! },
    {
      enabled:
        config.platform === "tiktok" &&
        activeJobId != null &&
        job?.status === "completed",
    }
  );
  const youtubeVideos = trpc.youtubeScrape.videos.useQuery(
    { jobId: activeJobId! },
    {
      enabled:
        config.platform === "youtube" &&
        activeJobId != null &&
        job?.status === "completed",
    }
  );

  const videosData =
    config.platform === "tiktok" ? tiktokVideos.data : youtubeVideos.data;
  const audienceCount =
    config.platform === "tiktok"
      ? (tiktokVideos.data?.followerCount ?? 0)
      : (youtubeVideos.data?.subscriberCount ?? 0);

  const allVideos = useMemo(
    () =>
      toPlatformVideos(
        (videosData?.videos ?? []) as Array<Record<string, unknown>>
      ),
    [videosData?.videos]
  );

  const filteredVideos = useMemo(() => {
    if (!allVideos.length || dateFilter === "all") return allVideos;
    const now = new Date();
    let cutoffDays = 30;
    if (dateFilter === "7") cutoffDays = 7;
    else if (dateFilter === "14") cutoffDays = 14;
    else if (dateFilter === "30") cutoffDays = 30;
    else if (dateFilter === "60") cutoffDays = 60;
    else if (dateFilter === "90") cutoffDays = 90;
    else if (dateFilter === "180") cutoffDays = 180;
    const cutoff = new Date(now.getTime() - cutoffDays * 24 * 60 * 60 * 1000);
    return allVideos.filter((v) => new Date(v.postedAt) >= cutoff);
  }, [allVideos, dateFilter]);

  const sortedVideos = useMemo(() => {
    const list = [...filteredVideos];
    switch (sortBy) {
      case "views_desc":
        return list.sort((a, b) => b.viewCount - a.viewCount);
      case "likes_desc":
        return list.sort((a, b) => b.likeCount - a.likeCount);
      case "comments_desc":
        return list.sort((a, b) => b.commentCount - a.commentCount);
      case "shares_desc":
        return list.sort(
          (a, b) => (b.shareCount ?? 0) - (a.shareCount ?? 0)
        );
      case "engagement_desc":
        return list.sort((a, b) => b.engagementRate - a.engagementRate);
      case "date_asc":
        return list.sort(
          (a, b) =>
            new Date(a.postedAt).getTime() - new Date(b.postedAt).getTime()
        );
      case "date_desc":
      default:
        return list.sort(
          (a, b) =>
            new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
        );
    }
  }, [filteredVideos, sortBy]);

  const videoIdsForSaved = useMemo(
    () => allVideos.map((v) => v.id),
    [allVideos]
  );

  const savedBatchQuery = trpc.saved.checkBatch.useQuery(
    config.platform === "tiktok"
      ? { tiktokVideoIds: videoIdsForSaved }
      : { youtubeVideoIds: videoIdsForSaved },
    { enabled: videoIdsForSaved.length > 0 }
  );
  const savedMap = savedBatchQuery.data || {};

  const recreateBatchQuery = trpc.recreate.checkBatch.useQuery(
    config.platform === "tiktok"
      ? { tiktokVideoIds: videoIdsForSaved }
      : { youtubeVideoIds: videoIdsForSaved },
    {
      enabled: videoIdsForSaved.length > 0,
      staleTime: RECREATE_BATCH_STALE_MS,
      refetchInterval: (query) => {
        const d = query.state.data;
        if (!d) return false;
        for (const v of Object.values(d)) {
          if (
            v &&
            (v.status === "pending" || v.status === "processing")
          ) {
            return RECREATE_BATCH_POLL_MS;
          }
        }
        return false;
      },
    }
  );
  const recreateMap = recreateBatchQuery.data || {};

  const videosInSpyWindow = allVideos.filter(
    (v) => v.outsideSpyWindow !== true
  ).length;
  const backfilledVideoCount =
    allVideos.length > videosInSpyWindow
      ? allVideos.length - videosInSpyWindow
      : 0;

  const toggleSave = trpc.saved.toggle.useMutation({
    onSuccess: (data) => {
      utils.saved.checkBatch.invalidate();
      utils.saved.list.invalidate();
      toast.success(data.saved ? "Saved" : "Removed from saved");
    },
  });

  const gridModalVideo = useMemo(
    () =>
      gridModalVideoId == null
        ? null
        : (sortedVideos.find((v) => v.id === gridModalVideoId) ?? null),
    [sortedVideos, gridModalVideoId]
  );

  useEffect(() => {
    if (gridModalVideoId == null) return;
    if (!sortedVideos.some((v) => v.id === gridModalVideoId)) {
      setGridModalVideoId(null);
    }
  }, [gridModalVideoId, sortedVideos]);

  // Hydrate transcription status for visible cards (additive; Instagram Dashboard
  // uses joined reel.transcription instead).
  useEffect(() => {
    let cancelled = false;
    const ids = sortedVideos.map((v) => v.id);
    if (ids.length === 0) return;

    void (async () => {
      const next: typeof txStatusById = {};
      await Promise.all(
        ids.slice(0, 40).map(async (id) => {
          try {
            const status = await utils.transcribe.status.fetch(
              config.platform === "tiktok"
                ? { tiktokVideoId: id }
                : { youtubeVideoId: id }
            );
            if (status) {
              next[id] = {
                status: status.status,
                transcript: status.transcript,
                segments: status.segments,
              };
            }
          } catch {
            /* ignore per-video status failures */
          }
        })
      );
      if (!cancelled) {
        setTxStatusById((prev) => ({ ...prev, ...next }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sortedVideos, config.platform, utils.transcribe.status]);

  const toLibrarySource = useCallback(
    (videoId: number): LibraryRemakeSource =>
      config.platform === "tiktok"
        ? { source: "tiktok", tiktokVideoId: videoId }
        : { source: "youtube", youtubeVideoId: videoId },
    [config.platform]
  );

  const transcribeStatusInputForVideo = useCallback(
    (videoId: number) =>
      config.platform === "tiktok"
        ? { tiktokVideoId: videoId }
        : { youtubeVideoId: videoId },
    [config.platform]
  );

  const applyTxStatus = useCallback(
    (
      videoId: number,
      status: {
        status: string;
        transcript?: string | null;
        segments?: unknown;
      }
    ) => {
      setTxStatusById((prev) => ({
        ...prev,
        [videoId]: {
          status: status.status,
          transcript: status.transcript,
          segments: status.segments,
        },
      }));
      if (status.status === "completed" || status.status === "failed") {
        setPendingTranscriptions((prev) => {
          if (!prev.has(videoId)) return prev;
          const next = new Set(prev);
          next.delete(videoId);
          return next;
        });
      }
    },
    []
  );

  // Keep standalone modal/card "Transcribe" pending in sync (remake uses the
  // library chain). Previously we only fetched once on mutate settle, so a
  // still-processing response left the CTA stuck on "Transcribing...".
  useEffect(() => {
    if (pendingTranscriptions.size === 0) return;
    let cancelled = false;
    const ids = Array.from(pendingTranscriptions);

    const poll = async () => {
      await Promise.all(
        ids.map(async (id) => {
          try {
            const status = await utils.transcribe.status.fetch(
              transcribeStatusInputForVideo(id) as never
            );
            if (cancelled || !status) return;
            applyTxStatus(id, status);
          } catch {
            /* ignore per-video poll failures */
          }
        })
      );
    };

    void poll();
    const timer = window.setInterval(() => {
      void poll();
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [
    pendingTranscriptions,
    utils.transcribe.status,
    transcribeStatusInputForVideo,
    applyTxStatus,
  ]);

  const transcribeMutation = trpc.transcribe.start.useMutation({
    onSuccess: (data, variables) => {
      const videoId = variables.tiktokVideoId ?? variables.youtubeVideoId;
      if (data.status === "completed") {
        if (videoId != null) {
          setPendingTranscriptions((prev) => {
            const next = new Set(prev);
            next.delete(videoId);
            return next;
          });
          void utils.transcribe.status
            .fetch(transcribeStatusInputForVideo(videoId) as never)
            .then((status) => {
              if (status) applyTxStatus(videoId, status);
            })
            .catch(() => undefined);
        }
        toast.success("Transcription ready");
        return;
      }
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
    },
    onError: (err, variables) => {
      const videoId = variables.tiktokVideoId ?? variables.youtubeVideoId;
      if (videoId != null) {
        setPendingTranscriptions((prev) => {
          const next = new Set(prev);
          next.delete(videoId);
          return next;
        });
        setTxStatusById((prev) => ({
          ...prev,
          [videoId]: { status: "failed" },
        }));
      }
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly transcription limit reached.");
      } else {
        toast.error("Transcription failed", { description: err.message });
      }
    },
  });

  const runTranscribe = (videoId: number) => {
    setPendingTranscriptions((prev) => new Set(prev).add(videoId));
    setTxStatusById((prev) => ({
      ...prev,
      [videoId]: { status: "processing" },
    }));
    transcribeMutation.mutate(transcribeStatusInputForVideo(videoId) as never);
  };

  const triggerRecreatePulse = (videoId: number) => {
    setGridModalVideoId(videoId);
    setRecreatePulse((prev) => ({
      videoId,
      nonce: (prev?.videoId === videoId ? prev.nonce : 0) + 1,
    }));
  };

  const triggerOpenMyScript = useCallback(
    (videoId: number, openScriptId: number) => {
      setGridModalVideoId(videoId);
      setRecreatePulse((prev) => ({
        videoId,
        openScriptId,
        nonce: (prev?.videoId === videoId ? prev.nonce : 0) + 1,
      }));
    },
    []
  );

  const getRemakeStateRef = useRef<(key: string) => LibraryRemakeState>(
    () => ({ stage: "idle", progressPercent: 0 })
  );

  const libraryRemakeOnStageChange = useCallback(
    (
      source: LibraryRemakeSource,
      stage: LibraryRemakeStage,
      prevStage: LibraryRemakeStage | undefined
    ) => {
      const videoId =
        source.source === "tiktok"
          ? source.tiktokVideoId
          : source.source === "youtube"
            ? source.youtubeVideoId
            : null;
      if (videoId == null) return;

      if (
        prevStage === "transcribing" &&
        (stage === "generating" ||
          stage === "inspiration" ||
          stage === "ready" ||
          stage === "error")
      ) {
        void utils.transcribe.status
          .fetch(transcribeStatusInputForVideo(videoId) as never)
          .then((status) => {
            if (status) applyTxStatus(videoId, status);
          })
          .catch(() => undefined);
      }

      if (stage === "ready" && prevStage !== "ready") {
        void utils.recreate.checkBatch.invalidate();
        toast.success("Your remake is ready in the workspace");
      }
    },
    [
      applyTxStatus,
      transcribeStatusInputForVideo,
      utils.recreate.checkBatch,
      utils.transcribe.status,
    ]
  );

  const {
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

  getRemakeStateRef.current = getRemakeState;

  const handleSubmit = () => {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setActiveJobId(null);
    if (config.platform === "tiktok") {
      tiktokStart.mutate({ handle: trimmed, timeframe });
    } else {
      youtubeStart.mutate({ handle: trimmed, timeframe });
    }
  };

  const displayHandle =
    job?.handle || handle.replace(/^@/, "").trim() || null;
  const showResults = job?.status === "completed" && videosData != null;

  const buildOneClick = (video: PlatformVideoLike): OneClickRemakeAction => {
    const librarySource = toLibrarySource(video.id);
    const tx = txStatusById[video.id];
    const hasTranscription = tx?.status === "completed";
    const isNoSpeech =
      hasTranscription &&
      !String(tx?.transcript ?? "").trim() &&
      !(Array.isArray(tx?.segments) && tx.segments.length > 0);
    const batchEntry = recreateMap[video.id] as RecreateBatchEntry | undefined;
    const recreateSt = videoRecreateState(batchEntry);

    return buildLibraryOneClickRemake({
      openScriptReelId: video.id,
      isNoSpeech: !!isNoSpeech,
      alreadyTranscribed: hasTranscription && !isNoSpeech,
      idleNotRemakeable: false,
      classification: {},
      batchRecreateSt: recreateSt,
      batchEntry,
      hookState: getRemakeState(libraryRemakeKey(librarySource)),
      librarySource,
      startRemake,
      retryRemake,
      startInspirationSave,
      openRemakeWorkspace,
    });
  };

  const isVideoProcessing = (videoId: number) => {
    const tx = txStatusById[videoId];
    const hookState = getRemakeState(
      libraryRemakeKey(toLibrarySource(videoId))
    );
    if (
      hookState.stage === "transcribing" ||
      hookState.stage === "generating"
    ) {
      return true;
    }
    if (tx?.status === "completed" || tx?.status === "failed") {
      return false;
    }
    return (
      pendingTranscriptions.has(videoId) ||
      tx?.status === "processing" ||
      tx?.status === "pending"
    );
  };

  return (
    <div className="mt-5 space-y-5">
      {initialJobId == null && !showResults ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="space-y-5"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor={config.handleInputId}>{config.handleLabel}</Label>
              <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold text-primary">
                Paste handle here
              </span>
            </div>
            <div className="relative rounded-xl ring-1 ring-primary/70 shadow-[0_0_0_3px_hsl(var(--primary)/0.08),0_10px_30px_hsl(var(--primary)/0.12)] transition focus-within:ring-2 focus-within:ring-primary">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-primary">
                @
              </span>
              <Input
                id={config.handleInputId}
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder={config.handlePlaceholder}
                disabled={isRunning}
                className="h-12 border-primary/30 bg-primary/5 pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {config.handleHelpText}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor={config.timeframeInputId}>Timeframe</Label>
            <Select
              value={timeframe}
              onValueChange={(value) =>
                setTimeframe(value as "30" | "90" | "180")
              }
              disabled={isRunning}
            >
              <SelectTrigger
                id={config.timeframeInputId}
                className="h-11 bg-background"
              >
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="180">Last 180 days</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {config.timeframeHelpText}
            </p>
          </div>

          {!scrapeGate.isLoading && !scrapeGate.allowed ? (
            <UpgradePrompt
              action="scrapeCount"
              used={scrapeGate.used}
              limit={scrapeGate.limit}
              planRequired={scrapeGate.planRequired}
              variant="inline"
            />
          ) : null}

          {!scrapeGate.isLoading &&
          scrapeGate.allowed &&
          scrapeGate.limit > 0 ? (
            <p className="text-center text-xs text-muted-foreground">
              {scrapeGate.used}/{scrapeGate.limit} account research sessions this
              month
            </p>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="h-12 w-full text-base font-medium"
            disabled={
              isRunning ||
              !handle.trim() ||
              startPending ||
              scrapeGate.isLoading ||
              !scrapeGate.allowed
            }
          >
            {isRunning || startPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              config.ctaLabel
            )}
          </Button>
        </form>
      ) : null}

      {isRunning ? (
        <div className="rounded-lg border border-border/40 bg-background/60 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {job?.videosFound ? (
              <span>
                Found {job.videosFound} {config.foundProgressNoun}...
              </span>
            ) : (
              <span>
                Connecting to @
                {job?.handle || handle.replace(/^@/, "")}...
              </span>
            )}
          </div>
        </div>
      ) : null}

      {job?.status === "failed" ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {job.errorMessage || "Research failed"}
        </div>
      ) : null}

      {showResults ? (
        <div className="max-w-[1700px] mx-auto px-2 sm:px-0">
          <div className="min-w-0">
            <div className="mb-6 flex flex-col gap-4">
              <div className="flex min-w-0 gap-3">
                <Tooltip content="Back">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0"
                    onClick={handleResearchBack}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                </Tooltip>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold tracking-tight text-foreground">
                      {displayHandle ? `@${displayHandle}` : "@…"}
                    </h1>
                    {job ? (
                      <Badge
                        variant={
                          job.status === "completed"
                            ? "default"
                            : job.status === "failed"
                              ? "destructive"
                              : "secondary"
                        }
                        className="text-xs"
                      >
                        {job.status === "running" && (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        )}
                        {job.status}
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {sortedVideos.length}
                    {dateFilter !== "all" ? ` of ${allVideos.length}` : ""}{" "}
                    {config.contentNoun}
                    {dateFilter !== "all"
                      ? ` (last ${dateFilter} days)`
                      : " collected"}
                    {audienceCount > 0 ? (
                      <>
                        {" "}
                        &middot; {formatNumber(audienceCount)}{" "}
                        {config.audienceLabel}
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
                <Tooltip content={`Filter ${config.contentNoun} by date posted`}>
                  <div>
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                      <SelectTrigger className="h-9 w-full min-w-[8.5rem] max-w-[9.5rem] bg-card text-sm sm:w-[150px]">
                        <SelectValue placeholder="Date range" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Time</SelectItem>
                        <SelectItem value="7">Last 7 Days</SelectItem>
                        <SelectItem value="14">Last 14 Days</SelectItem>
                        <SelectItem value="30">Last 30 Days</SelectItem>
                        <SelectItem value="60">Last 60 Days</SelectItem>
                        <SelectItem value="90">Last 90 Days</SelectItem>
                        <SelectItem value="180">Last 180 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </Tooltip>

                <Tooltip content="Change how videos are sorted">
                  <div>
                    <Select
                      value={sortBy}
                      onValueChange={(v) => setSortBy(v as SortOption)}
                    >
                      <SelectTrigger className="h-9 w-full min-w-0 max-w-full bg-card text-sm sm:min-w-[14rem] sm:max-w-[20rem]">
                        <SelectValue placeholder="Sort by..." />
                      </SelectTrigger>
                      <SelectContent>
                        {config.sortOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="flex items-center gap-2">
                              {SORT_ICONS[opt.value]}
                              {opt.label}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </Tooltip>

                <Tooltip content="Switch between detailed list and visual grid view">
                  <div className="workspace-view-toggle inline-flex items-center gap-0.5 rounded-md border border-border/50 bg-muted/30 p-0.5">
                    <Button
                      variant={viewMode === "list" ? "default" : "ghost"}
                      size="sm"
                      className="min-h-9 px-3 text-xs"
                      onClick={() => setViewMode("list")}
                    >
                      <List className="h-3.5 w-3.5 mr-1" />
                      List
                    </Button>
                    <Button
                      variant={viewMode === "grid" ? "default" : "ghost"}
                      size="sm"
                      className="min-h-9 px-3 text-xs"
                      onClick={() => setViewMode("grid")}
                    >
                      <Grid3X3 className="h-3.5 w-3.5 mr-1" />
                      Grid
                    </Button>
                  </div>
                </Tooltip>
              </div>
            </div>

            {backfilledVideoCount > 0 &&
            videosInSpyWindow < MIN_SPY_DISPLAY_REELS &&
            typeof job?.timeframeDays === "number" ? (
              <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
                <p className="text-sm text-foreground">
                  Only {videosInSpyWindow}{" "}
                  {videosInSpyWindow === 1
                    ? config.contentNoun.replace(/s$/i, "")
                    : config.contentNoun}{" "}
                  posted in the last {job.timeframeDays} days. We added{" "}
                  {backfilledVideoCount} older{" "}
                  {backfilledVideoCount === 1
                    ? config.contentNoun.replace(/s$/i, "")
                    : config.contentNoun}{" "}
                  so you have at least{" "}
                  {Math.min(allVideos.length, MIN_SPY_DISPLAY_REELS)} to study.
                </p>
              </div>
            ) : null}

            <div className="space-y-3">
              <div className={WORKSPACE_REEL_GRID_CLASS}>
                {sortedVideos.map((video, index) => {
                  const isSaved = !!savedMap[video.id];

                  return (
                    <PlatformVideoCard
                      key={video.id}
                      video={video}
                      index={index}
                      config={config}
                      isModalOpen={gridModalVideoId === video.id}
                      creatorHandle={displayHandle}
                      followerCount={audienceCount}
                      isSaved={isSaved}
                      oneClickRemake={buildOneClick(video)}
                      interactiveMedia
                      inlinePlaying={inlinePlayingId === video.id}
                      onInlinePlayRequest={() => setInlinePlayingId(video.id)}
                      onInlinePlayStop={() =>
                        setInlinePlayingId((cur) =>
                          cur === video.id ? null : cur
                        )
                      }
                      onMediaClick={() => setGridModalVideoId(video.id)}
                      onToggleSave={() => {
                        if (config.platform === "tiktok") {
                          toggleSave.mutate({ tiktokVideoId: video.id });
                        } else {
                          toggleSave.mutate({ youtubeVideoId: video.id });
                        }
                      }}
                      onExpand={() => setGridModalVideoId(video.id)}
                      saveBusy={toggleSave.isPending}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <GridReelWorkflowDialog
        open={gridModalVideo != null}
        onOpenChange={(open) => {
          if (!open) setGridModalVideoId(null);
        }}
        reel={
          gridModalVideo
            ? {
                id: gridModalVideo.id,
                caption:
                  config.getCaption(gridModalVideo) || null,
                thumbnailUrl: gridModalVideo.thumbnailUrl,
                videoUrl: config.getVideoUrl(gridModalVideo),
                viewCount: gridModalVideo.viewCount,
                likeCount: gridModalVideo.likeCount,
                commentCount: gridModalVideo.commentCount,
                engagementRate: gridModalVideo.engagementRate,
                postedAt: gridModalVideo.postedAt,
                duration: gridModalVideo.durationSec,
                niche: null,
                hookPattern: null,
                viralFlag: false,
                confidence: null,
                tiktokVideoId:
                  config.platform === "tiktok" ? gridModalVideo.id : undefined,
                youtubeVideoId:
                  config.platform === "youtube" ? gridModalVideo.id : undefined,
                platform: config.platform,
              }
            : null
        }
        userTimezone={userTimezone}
      >
        {gridModalVideo ? (
          config.platform === "tiktok" ? (
            <InlineWorkflow
              reelSource="tiktok"
              tiktokVideoId={gridModalVideo.id}
              handle={displayHandle || ""}
              reelCaption={config.getCaption(gridModalVideo) || undefined}
              hasTranscription={
                txStatusById[gridModalVideo.id]?.status === "completed"
              }
              isProcessing={isVideoProcessing(gridModalVideo.id)}
              isNoSpeech={
                txStatusById[gridModalVideo.id]?.status === "completed" &&
                !String(txStatusById[gridModalVideo.id]?.transcript ?? "").trim() &&
                !(
                  Array.isArray(txStatusById[gridModalVideo.id]?.segments) &&
                  (txStatusById[gridModalVideo.id]?.segments as unknown[])
                    .length > 0
                )
              }
              onTranscribe={() => runTranscribe(gridModalVideo.id)}
              userTimezone={userTimezone}
              postedAt={gridModalVideo.postedAt}
              recreateEntrySignal={
                recreatePulse?.videoId === gridModalVideo.id
                  ? {
                      nonce: recreatePulse.nonce,
                      openScriptId: recreatePulse.openScriptId,
                    }
                  : undefined
              }
              onRemakeSaved={() => setGridModalVideoId(null)}
            />
          ) : (
            <InlineWorkflow
              reelSource="youtube"
              youtubeVideoId={gridModalVideo.id}
              handle={displayHandle || ""}
              reelCaption={config.getCaption(gridModalVideo) || undefined}
              hasTranscription={
                txStatusById[gridModalVideo.id]?.status === "completed"
              }
              isProcessing={isVideoProcessing(gridModalVideo.id)}
              isNoSpeech={
                txStatusById[gridModalVideo.id]?.status === "completed" &&
                !String(txStatusById[gridModalVideo.id]?.transcript ?? "").trim() &&
                !(
                  Array.isArray(txStatusById[gridModalVideo.id]?.segments) &&
                  (txStatusById[gridModalVideo.id]?.segments as unknown[])
                    .length > 0
                )
              }
              onTranscribe={() => runTranscribe(gridModalVideo.id)}
              userTimezone={userTimezone}
              postedAt={gridModalVideo.postedAt}
              recreateEntrySignal={
                recreatePulse?.videoId === gridModalVideo.id
                  ? {
                      nonce: recreatePulse.nonce,
                      openScriptId: recreatePulse.openScriptId,
                    }
                  : undefined
              }
              onRemakeSaved={() => setGridModalVideoId(null)}
            />
          )
        ) : null}
      </GridReelWorkflowDialog>
      {RemakeDialogs}
    </div>
  );
}
