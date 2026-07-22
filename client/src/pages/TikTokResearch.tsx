import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Loader2,
  Clock,
  Play,
  Wand2,
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
import { WorkspaceReelGridTile } from "@/components/WorkspaceReelGridTile";
import { WORKSPACE_REEL_GRID_CLASS } from "@/lib/workspaceReelGridLayout";
import { LIBRARY_REMAKE_CTA_LABEL } from "@/lib/libraryRemakeChainCore";
import { formatNumber } from "@/components/InlineWorkflow";
import Tooltip from "@/components/Tooltip";

type TikTokVideoRow = {
  id: number;
  awemeId: string;
  caption: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  thumbnailUrl: string | null;
  videoUrl: string | null;
  videoPageUrl: string;
  durationSec: number | null;
  postedAt: Date;
  engagementRate: number;
};

type SortOption =
  | "views_desc"
  | "likes_desc"
  | "comments_desc"
  | "shares_desc"
  | "engagement_desc"
  | "date_desc"
  | "date_asc";

type ViewMode = "list" | "grid";

const SORT_OPTIONS: {
  value: SortOption;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "views_desc", label: "Highest Views", icon: <Eye className="h-3.5 w-3.5" /> },
  { value: "likes_desc", label: "Highest Likes", icon: <Heart className="h-3.5 w-3.5" /> },
  {
    value: "comments_desc",
    label: "Highest Comments",
    icon: <MessageCircle className="h-3.5 w-3.5" />,
  },
  {
    value: "shares_desc",
    label: "Highest Shares",
    icon: <Share2 className="h-3.5 w-3.5" />,
  },
  {
    value: "engagement_desc",
    label: "Highest Engagement Rate",
    icon: <TrendingUp className="h-3.5 w-3.5" />,
  },
  {
    value: "date_desc",
    label: "Date (Newest)",
    icon: <CalendarIcon className="h-3.5 w-3.5" />,
  },
  {
    value: "date_asc",
    label: "Date (Oldest)",
    icon: <CalendarIcon className="h-3.5 w-3.5" />,
  },
];

function VideoCard({
  video,
  index,
}: {
  video: TikTokVideoRow;
  index: number;
}) {
  const [remakeRequested, setRemakeRequested] = useState(false);
  const [transcriptionId, setTranscriptionId] = useState<number | null>(null);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [generationStarted, setGenerationStarted] = useState(false);
  const [showScript, setShowScript] = useState(false);

  const transcribeMutation = trpc.transcribe.start.useMutation({
    onSuccess: (data) => {
      setTranscriptionId(data.transcriptionId);
    },
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly transcription limit reached.");
      } else {
        toast.error(err.message);
      }
    },
  });

  const transcriptionQuery = trpc.transcribe.status.useQuery(
    { tiktokVideoId: video.id },
    {
      enabled: true,
      refetchInterval: (query) => {
        if (!remakeRequested && transcriptionId == null) return false;
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed") return false;
        return 2000;
      },
    }
  );

  const generateMutation = trpc.recreate.generate.useMutation({
    onSuccess: (data) => {
      setScriptId(data.scriptId);
    },
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly script generation limit reached.");
      } else {
        toast.error(err.message);
      }
    },
  });

  const scriptQuery = trpc.recreate.status.useQuery(
    { scriptId: scriptId! },
    {
      enabled: scriptId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        return status === "processing" ? 2000 : false;
      },
    }
  );

  const transcription = transcriptionQuery.data;
  const hasTranscription = transcription?.status === "completed";
  const transcript = transcription?.transcript ?? null;
  const isTranscribing =
    remakeRequested &&
    (transcribeMutation.isPending ||
      (transcriptionId != null &&
        transcription?.status !== "completed" &&
        transcription?.status !== "failed"));

  const script = scriptQuery.data;
  const isGenerating =
    generateMutation.isPending ||
    (scriptId != null && script?.status === "processing");

  useEffect(() => {
    if (
      !remakeRequested ||
      generationStarted ||
      transcription?.status !== "completed" ||
      !transcription.transcript
    ) {
      return;
    }

    setGenerationStarted(true);
    generateMutation.mutate({
      tiktokVideoId: video.id,
      topic: "",
      gradeLevel: "auto",
    });
  }, [
    generationStarted,
    generateMutation,
    remakeRequested,
    transcription?.status,
    transcription?.transcript,
    video.id,
  ]);

  useEffect(() => {
    if (script?.status === "completed" && script.generatedScript) {
      setShowScript(true);
    }
  }, [script?.generatedScript, script?.status]);

  const startRemake = () => {
    if (script?.status === "completed" && script.generatedScript) {
      setShowScript((current) => !current);
      return;
    }

    setRemakeRequested(true);
    setGenerationStarted(false);
    setTranscriptionId(null);
    setScriptId(null);
    transcribeMutation.mutate({ tiktokVideoId: video.id });
  };

  const noSpeech = hasTranscription && !transcript;
  const transcriptionFailed = transcription?.status === "failed";
  const generationFailed = script?.status === "failed";

  let buttonLabel = LIBRARY_REMAKE_CTA_LABEL;
  if (isTranscribing) buttonLabel = "Transcribing...";
  else if (isGenerating) buttonLabel = "Generating...";
  else if (noSpeech) buttonLabel = "No speech detected";
  else if (transcriptionFailed || generationFailed) buttonLabel = "Retry";
  else if (script?.status === "completed") {
    buttonLabel = showScript ? "Hide result" : "View result";
  }

  return (
    <WorkspaceReelGridTile
      index={index}
      thumbnailUrl={video.thumbnailUrl}
      videoUrl={video.videoUrl}
      engagementRate={video.engagementRate}
      duration={video.durationSec}
      reelUrl={video.videoPageUrl}
      statusChip={
        hasTranscription && transcript ? (
          <span className="rounded bg-emerald-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950">
            Transcribed
          </span>
        ) : hasTranscription && !transcript ? (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
            No voice
          </span>
        ) : isTranscribing ? (
          <span className="animate-pulse rounded bg-amber-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
            Processing
          </span>
        ) : null
      }
      caption={
        <p className="line-clamp-2 min-h-[2rem] text-xs text-foreground">
          {video.caption || (
            <span className="italic text-muted-foreground">No caption</span>
          )}
        </p>
      }
      stats={
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          <span>{formatNumber(video.viewCount)} views</span>
          <span aria-hidden>·</span>
          <span className="font-medium text-emerald-400">
            {video.engagementRate.toFixed(2)}%
          </span>
          <span aria-hidden>·</span>
          <span>{formatNumber(video.likeCount)} likes</span>
          <span aria-hidden>·</span>
          <span>{formatNumber(video.commentCount)} comments</span>
          <span aria-hidden>·</span>
          <span>{formatNumber(video.shareCount)} shares</span>
          <span aria-hidden>·</span>
          <span>{new Date(video.postedAt).toLocaleDateString()}</span>
        </div>
      }
      actions={
        <div className="space-y-2">
          <Button
            variant={script?.status === "completed" ? "default" : "outline"}
            size="sm"
            className={
              script?.status === "completed"
                ? "min-h-9 h-auto w-full justify-center px-2.5 py-2 text-xs font-semibold leading-snug whitespace-normal text-center shadow-sm"
                : "min-h-9 h-auto w-full justify-center px-2.5 py-2 text-xs font-semibold leading-snug whitespace-normal text-center border-primary/30 text-primary hover:bg-primary/10"
            }
            onClick={startRemake}
            disabled={isTranscribing || isGenerating || noSpeech}
          >
            {isTranscribing || isGenerating ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : script?.status === "completed" && !showScript ? (
              <Play className="mr-2 h-3.5 w-3.5 fill-current" />
            ) : (
              <Wand2 className="mr-2 h-3.5 w-3.5" />
            )}
            {buttonLabel}
          </Button>

          {transcriptionFailed ? (
            <p className="text-xs text-destructive">
              {transcription.errorMessage || "Transcription failed"}
            </p>
          ) : null}
          {generationFailed ? (
            <p className="text-xs text-destructive">
              {script.errorMessage || "Script generation failed"}
            </p>
          ) : null}
          {noSpeech ? (
            <p className="text-xs text-muted-foreground">
              No speech was detected, so a script was not generated.
            </p>
          ) : null}
          {showScript &&
          script?.status === "completed" &&
          script.generatedScript ? (
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/40 bg-muted/50 p-3 text-xs">
              {script.generatedScript}
            </div>
          ) : null}
        </div>
      }
      mediaFallback={<div className="h-full w-full bg-muted" />}
    />
  );
}

export default function TikTokResearch({
  initialJobId,
}: {
  initialJobId?: number;
}) {
  const [, setLocation] = useLocation();
  const [handle, setHandle] = useState("");
  const [timeframe, setTimeframe] = useState<"30" | "90" | "180">("30");
  const [activeJobId, setActiveJobId] = useState<number | null>(
    initialJobId ?? null
  );
  const [sortBy, setSortBy] = useState<SortOption>("engagement_desc");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const scrapeGate = useUsageGate("scrapeCount");

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

    document.title = "TikTok Research | SpyReels";
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
  }, []);

  const startMutation = trpc.tiktokScrape.start.useMutation({
    onSuccess: (data) => {
      setLocation(`/tiktok-scraping?jobId=${data.jobId}&from=research`);
    },
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly research limit reached.");
      } else {
        toast.error(err.message);
      }
    },
  });

  const progressQuery = trpc.tiktokScrape.progress.useQuery(
    { jobId: activeJobId! },
    {
      enabled: activeJobId != null,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (status === "completed" || status === "failed") return false;
        return 2000;
      },
    }
  );

  const job = progressQuery.data;
  const isRunning =
    activeJobId != null &&
    job?.status !== "completed" &&
    job?.status !== "failed";

  const videosQuery = trpc.tiktokScrape.videos.useQuery(
    { jobId: activeJobId! },
    { enabled: activeJobId != null && job?.status === "completed" }
  );

  const sortedVideos = useMemo(() => {
    const list = [...(videosQuery.data?.videos ?? [])];
    switch (sortBy) {
      case "views_desc":
        return list.sort((a, b) => b.viewCount - a.viewCount);
      case "likes_desc":
        return list.sort((a, b) => b.likeCount - a.likeCount);
      case "comments_desc":
        return list.sort((a, b) => b.commentCount - a.commentCount);
      case "shares_desc":
        return list.sort((a, b) => b.shareCount - a.shareCount);
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
  }, [videosQuery.data?.videos, sortBy]);

  const handleSubmit = () => {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setActiveJobId(null);
    startMutation.mutate({ handle: trimmed, timeframe });
  };

  const displayHandle =
    job?.handle || handle.replace(/^@/, "").trim() || null;
  const followerCount = videosQuery.data?.followerCount ?? 0;
  const showResults =
    job?.status === "completed" && videosQuery.data != null;

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
              <Label htmlFor="tiktok-handle">TikTok Handle</Label>
              <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold text-primary">
                Paste handle here
              </span>
            </div>
            <div className="relative rounded-xl ring-1 ring-primary/70 shadow-[0_0_0_3px_hsl(var(--primary)/0.08),0_10px_30px_hsl(var(--primary)/0.12)] transition focus-within:ring-2 focus-within:ring-primary">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-primary">
                @
              </span>
              <Input
                id="tiktok-handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="e.g. khaby.lame"
                disabled={isRunning}
                className="h-12 border-primary/30 bg-primary/5 pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Paste the TikTok username without the @ symbol. The account must be
              public.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tiktok-timeframe">Timeframe</Label>
            <Select
              value={timeframe}
              onValueChange={(value) =>
                setTimeframe(value as "30" | "90" | "180")
              }
              disabled={isRunning}
            >
              <SelectTrigger id="tiktok-timeframe" className="h-11 bg-background">
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
              TikTok videos posted within this window will be collected.
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
              startMutation.isPending ||
              scrapeGate.isLoading ||
              !scrapeGate.allowed
            }
          >
            {isRunning || startMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting...
              </>
            ) : (
              "Start spying on TikTok"
            )}
          </Button>
        </form>
      ) : null}

      {isRunning ? (
        <div className="rounded-lg border border-border/40 bg-background/60 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {job?.videosFound ? (
              <span>Found {job.videosFound} videos...</span>
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
                    onClick={() => setLocation("/research?platform=tiktok")}
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
                    {sortedVideos.length} videos collected
                    {followerCount > 0 ? (
                      <>
                        {" "}
                        &middot; {formatNumber(followerCount)} followers
                      </>
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
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
                        {SORT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            <span className="flex items-center gap-2">
                              {opt.icon}
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

            <div className="space-y-3">
              {/* List currently renders the same grid shell (placeholder). */}
              <div className={WORKSPACE_REEL_GRID_CLASS}>
                {sortedVideos.map((video, index) => (
                  <VideoCard key={video.id} video={video} index={index} />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
