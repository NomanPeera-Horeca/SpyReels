import { useEffect, useState } from "react";
import { Loader2, Heart, MessageCircle, Share2, Eye, Clock } from "lucide-react";
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

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function VideoCard({ video }: { video: TikTokVideoRow }) {
  const [transcriptionId, setTranscriptionId] = useState<number | null>(null);
  const [scriptId, setScriptId] = useState<number | null>(null);

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
      enabled: transcriptionId != null,
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
    transcriptionId != null &&
    transcription?.status !== "completed" &&
    transcription?.status !== "failed";
  const canGenerate =
    transcription?.status === "completed" && !!transcription.transcript;

  const script = scriptQuery.data;
  const isGenerating = scriptId != null && script?.status === "processing";

  return (
    <div className="rounded-lg border border-border/40 bg-card overflow-hidden flex flex-col">
      {video.thumbnailUrl ? (
        <img
          src={video.thumbnailUrl}
          alt=""
          className="w-full aspect-[9/16] object-cover bg-muted"
        />
      ) : (
        <div className="w-full aspect-[9/16] bg-muted" />
      )}
      <div className="p-3 space-y-2 flex-1 flex flex-col">
        <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
          {video.caption || "No caption"}
        </p>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> {formatCount(video.viewCount)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-3 w-3" /> {formatCount(video.likeCount)}
          </span>
          <span className="flex items-center gap-1">
            <MessageCircle className="h-3 w-3" /> {formatCount(video.commentCount)}
          </span>
          <span className="flex items-center gap-1">
            <Share2 className="h-3 w-3" /> {formatCount(video.shareCount)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {video.engagementRate.toFixed(2)}% engagement
        </p>

        <div className="mt-auto pt-2 space-y-2">
          {!transcriptionId ? (
            <Button
              size="sm"
              className="w-full"
              onClick={() => transcribeMutation.mutate({ tiktokVideoId: video.id })}
              disabled={transcribeMutation.isPending}
            >
              {transcribeMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Transcribe"
              )}
            </Button>
          ) : isTranscribing ? (
            <Button size="sm" className="w-full" disabled>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              Transcribing...
            </Button>
          ) : transcription?.status === "failed" ? (
            <p className="text-xs text-destructive">
              {transcription.errorMessage || "Transcription failed"}
            </p>
          ) : canGenerate && !scriptId ? (
            <Button
              size="sm"
              className="w-full"
              onClick={() =>
                generateMutation.mutate({
                  tiktokVideoId: video.id,
                  topic: "",
                  gradeLevel: "auto",
                })
              }
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Generate script"
              )}
            </Button>
          ) : null}

          {isGenerating ? (
            <Button size="sm" className="w-full" disabled>
              <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              Generating...
            </Button>
          ) : null}

          {script?.status === "completed" && script.generatedScript ? (
            <div className="rounded-md border border-border/40 bg-muted/50 p-2 text-xs whitespace-pre-wrap max-h-40 overflow-y-auto">
              {script.generatedScript}
            </div>
          ) : null}

          {script?.status === "failed" ? (
            <p className="text-xs text-destructive">
              {script.errorMessage || "Script generation failed"}
            </p>
          ) : null}

          {!transcription?.transcript && transcription?.status === "completed" ? (
            <p className="text-xs text-muted-foreground">
              No speech detected in this video.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function TikTokResearch() {
  const [handle, setHandle] = useState("");
  const [timeframe, setTimeframe] = useState<"30" | "90" | "180">("30");
  const [activeJobId, setActiveJobId] = useState<number | null>(null);
  const scrapeGate = useUsageGate("scrapeCount");

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

      {isRunning ? (
        <div className="rounded-lg border border-border/40 bg-background/60 p-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {job?.videosFound ? (
              <span>Found {job.videosFound} videos...</span>
            ) : (
              <span>Connecting to @{handle.replace(/^@/, "")}...</span>
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
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {videosQuery.data.videos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
