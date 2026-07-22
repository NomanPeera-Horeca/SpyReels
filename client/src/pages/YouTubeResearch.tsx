import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, Play, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradePrompt } from "@/components/UpgradePrompt";
import { useUsageGate } from "@/hooks/useUsageGate";
import { WorkspaceReelGridTile } from "@/components/WorkspaceReelGridTile";
import { WORKSPACE_REEL_GRID_CLASS } from "@/lib/workspaceReelGridLayout";
import { LIBRARY_REMAKE_CTA_LABEL } from "@/lib/libraryRemakeChainCore";
import { formatNumber } from "@/components/InlineWorkflow";

type YouTubeVideoRow = {
  id: number;
  videoId: string;
  title: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  thumbnailUrl: string | null;
  videoPageUrl: string;
  durationSec: number | null;
  postedAt: Date;
  engagementRate: number;
};

function VideoCard({
  video,
  index,
}: {
  video: YouTubeVideoRow;
  index: number;
}) {
  const utils = trpc.useUtils();
  const [remakeRequested, setRemakeRequested] = useState(false);
  const [scriptId, setScriptId] = useState<number | null>(null);
  const [showScript, setShowScript] = useState(false);
  const [noTranscript, setNoTranscript] = useState(false);
  const [transcriptionFailed, setTranscriptionFailed] = useState(false);
  const [transcriptionError, setTranscriptionError] = useState<string | null>(
    null
  );

  const transcribeMutation = trpc.transcribe.start.useMutation({
    onError: (err) => {
      setTranscriptionFailed(true);
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly transcription limit reached.");
        setTranscriptionError("Monthly transcription limit reached.");
      } else {
        toast.error(err.message);
        setTranscriptionError(err.message);
      }
    },
  });

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

  const script = scriptQuery.data;
  const isFetchingTranscript = remakeRequested && transcribeMutation.isPending;
  const isGenerating =
    generateMutation.isPending ||
    (scriptId != null && script?.status === "processing");
  const isBusy = isFetchingTranscript || isGenerating;
  const generationFailed = script?.status === "failed";

  useEffect(() => {
    if (script?.status === "completed" && script.generatedScript) {
      setShowScript(true);
    }
  }, [script?.generatedScript, script?.status]);

  const startRemake = async () => {
    if (script?.status === "completed" && script.generatedScript) {
      setShowScript((current) => !current);
      return;
    }

    setRemakeRequested(true);
    setScriptId(null);
    setNoTranscript(false);
    setTranscriptionFailed(false);
    setTranscriptionError(null);
    setShowScript(false);

    try {
      const result = await transcribeMutation.mutateAsync({
        youtubeVideoId: video.id,
      });

      if (result.status !== "completed") {
        setTranscriptionFailed(true);
        setTranscriptionError("Transcription did not complete");
        toast.error("Transcription did not complete");
        return;
      }

      const transcription = await utils.transcribe.status.fetch({
        youtubeVideoId: video.id,
      });

      if (!transcription?.transcript?.trim()) {
        setNoTranscript(true);
        return;
      }

      await generateMutation.mutateAsync({
        youtubeVideoId: video.id,
        topic: "",
        gradeLevel: "auto",
      });
    } catch {
      // Errors surfaced via mutation onError handlers / toast above.
    }
  };

  let buttonLabel = LIBRARY_REMAKE_CTA_LABEL;
  if (isGenerating) buttonLabel = "Generating...";
  else if (noTranscript) buttonLabel = "No transcript available";
  else if (transcriptionFailed || generationFailed) buttonLabel = "Retry";
  else if (script?.status === "completed") {
    buttonLabel = showScript ? "Hide result" : "View result";
  }

  return (
    <WorkspaceReelGridTile
      index={index}
      thumbnailUrl={video.thumbnailUrl}
      videoUrl={null}
      engagementRate={video.engagementRate}
      duration={video.durationSec}
      reelUrl={video.videoPageUrl}
      caption={
        <p className="line-clamp-2 min-h-[2rem] text-xs text-foreground">
          {video.title || (
            <span className="italic text-muted-foreground">No title</span>
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
            onClick={() => {
              void startRemake();
            }}
            disabled={isBusy || noTranscript}
          >
            {isBusy ? (
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
              {transcriptionError || "Transcription failed"}
            </p>
          ) : null}
          {generationFailed ? (
            <p className="text-xs text-destructive">
              {script.errorMessage || "Script generation failed"}
            </p>
          ) : null}
          {noTranscript ? (
            <p className="text-xs text-muted-foreground">
              No transcript available for this Short, so a script was not
              generated.
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

export default function YouTubeResearch({
  initialJobId,
}: {
  initialJobId?: number;
}) {
  const [, setLocation] = useLocation();
  const [handle, setHandle] = useState("");
  const [activeJobId, setActiveJobId] = useState<number | null>(
    initialJobId ?? null
  );
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

    document.title = "YouTube Research | SpyReels";
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

  const startMutation = trpc.youtubeScrape.start.useMutation({
    onSuccess: (data) => {
      setLocation(`/youtube-scraping?jobId=${data.jobId}&from=research`);
    },
    onError: (err) => {
      if (err instanceof TRPCClientError && err.data?.code === "FORBIDDEN") {
        toast.error("Monthly research limit reached.");
      } else {
        toast.error(err.message);
      }
    },
  });

  const progressQuery = trpc.youtubeScrape.progress.useQuery(
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

  const videosQuery = trpc.youtubeScrape.videos.useQuery(
    { jobId: activeJobId! },
    { enabled: activeJobId != null && job?.status === "completed" }
  );

  const handleSubmit = () => {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setActiveJobId(null);
    startMutation.mutate({ handle: trimmed });
  };

  return (
    <div className="mt-5 space-y-5">
      {initialJobId == null ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            handleSubmit();
          }}
          className="space-y-5"
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="youtube-handle">YouTube channel handle</Label>
              <span className="rounded-full bg-primary/15 px-2 py-1 text-[10px] font-semibold text-primary">
                Paste handle here
              </span>
            </div>
            <div className="relative rounded-xl ring-1 ring-primary/70 shadow-[0_0_0_3px_hsl(var(--primary)/0.08),0_10px_30px_hsl(var(--primary)/0.12)] transition focus-within:ring-2 focus-within:ring-primary">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-semibold text-primary">
                @
              </span>
              <Input
                id="youtube-handle"
                value={handle}
                onChange={(event) => setHandle(event.target.value)}
                placeholder="e.g. starterstory"
                disabled={isRunning}
                className="h-12 border-primary/30 bg-primary/5 pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Paste the YouTube channel handle without the @ symbol. The channel
              must be public.
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
              "Start spying on YouTube"
            )}
          </Button>
        </form>
      ) : null}

      {isRunning ? (
        <div className="rounded-lg border border-border/40 bg-background/60 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {job?.videosFound ? (
              <span>Found {job.videosFound} Shorts...</span>
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

      {job?.status === "completed" && videosQuery.data ? (
        <div className="space-y-4 border-t border-border/50 pt-5">
          <div>
            <h3 className="font-semibold text-foreground">
              {videosQuery.data.videos.length} YouTube Shorts found
            </h3>
            <p className="text-xs text-muted-foreground">
              Remake any Short into a script. Transcripts load instantly when
              captions exist.
            </p>
          </div>
          <div className={WORKSPACE_REEL_GRID_CLASS}>
            {videosQuery.data.videos.map((video, index) => (
              <VideoCard key={video.id} video={video} index={index} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
