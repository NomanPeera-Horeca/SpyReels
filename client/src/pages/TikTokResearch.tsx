import { useEffect, useState } from "react";
import { Loader2, Clock } from "lucide-react";
import { toast } from "sonner";
import { TRPCClientError } from "@trpc/client";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
      enabled: remakeRequested && transcriptionId != null,
      refetchInterval: (query) => {
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

  const noSpeech =
    transcription?.status === "completed" && !transcription.transcript;
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
            size="sm"
            className="w-full"
            onClick={startRemake}
            disabled={isTranscribing || isGenerating || noSpeech}
          >
            {(isTranscribing || isGenerating) && (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
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
          {showScript && script?.status === "completed" && script.generatedScript ? (
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
  const [handle, setHandle] = useState("");
  const [timeframe, setTimeframe] = useState<"30" | "90" | "180">("30");
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
      setActiveJobId(data.jobId);
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
    activeJobId != null && job?.status !== "completed" && job?.status !== "failed";

  const videosQuery = trpc.tiktokScrape.videos.useQuery(
    { jobId: activeJobId! },
    { enabled: activeJobId != null && job?.status === "completed" }
  );

  const handleSubmit = () => {
    const trimmed = handle.trim().replace(/^@/, "");
    if (!trimmed) return;
    setActiveJobId(null);
    startMutation.mutate({ handle: trimmed, timeframe });
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

      {job?.status === "completed" && videosQuery.data ? (
        <div className="space-y-4 border-t border-border/50 pt-5">
          <div>
            <h3 className="font-semibold text-foreground">
              {videosQuery.data.videos.length} TikTok videos found
            </h3>
            <p className="text-xs text-muted-foreground">
              Transcribe any video, then generate a script from it.
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
