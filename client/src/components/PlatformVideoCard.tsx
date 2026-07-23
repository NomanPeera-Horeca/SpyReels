import { Loader2, Play, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceReelGridTile } from "@/components/WorkspaceReelGridTile";
import { formatNumber } from "@/components/InlineWorkflow";
import { useVideoRemakeFlow } from "@/hooks/useVideoRemakeFlow";
import type {
  PlatformResearchConfig,
  PlatformVideoLike,
} from "@/lib/platformResearchConfigs";

export function PlatformVideoCard({
  video,
  index,
  config,
}: {
  video: PlatformVideoLike;
  index: number;
  config: PlatformResearchConfig;
}) {
  const flow = useVideoRemakeFlow(video, config);
  const captionText = config.getCaption(video);

  return (
    <WorkspaceReelGridTile
      index={index}
      thumbnailUrl={video.thumbnailUrl}
      videoUrl={config.getVideoUrl(video)}
      engagementRate={video.engagementRate}
      duration={video.durationSec}
      reelUrl={video.videoPageUrl}
      statusChip={
        flow.hasTranscription && flow.hasTranscriptText ? (
          <span className="rounded bg-emerald-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950">
            Transcribed
          </span>
        ) : flow.hasTranscription && !flow.hasTranscriptText ? (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
            No voice
          </span>
        ) : flow.isTranscribing ? (
          <span className="animate-pulse rounded bg-amber-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-amber-950">
            Processing
          </span>
        ) : null
      }
      caption={
        <p className="line-clamp-2 min-h-[2rem] text-xs text-foreground">
          {captionText || (
            <span className="italic text-muted-foreground">
              {config.emptyCaptionLabel}
            </span>
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
          {config.hasShares ? (
            <>
              <span aria-hidden>·</span>
              <span>{formatNumber(video.shareCount ?? 0)} shares</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <span>{new Date(video.postedAt).toLocaleDateString()}</span>
        </div>
      }
      actions={
        <div className="space-y-2">
          <Button
            variant={
              flow.script?.status === "completed" ? "default" : "outline"
            }
            size="sm"
            className={
              flow.script?.status === "completed"
                ? "min-h-9 h-auto w-full justify-center px-2.5 py-2 text-xs font-semibold leading-snug whitespace-normal text-center shadow-sm"
                : "min-h-9 h-auto w-full justify-center px-2.5 py-2 text-xs font-semibold leading-snug whitespace-normal text-center border-primary/30 text-primary hover:bg-primary/10"
            }
            onClick={flow.onButtonClick}
            disabled={flow.buttonDisabled}
          >
            {flow.isBusy ? (
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
            ) : flow.script?.status === "completed" && !flow.showScript ? (
              <Play className="mr-2 h-3.5 w-3.5 fill-current" />
            ) : (
              <Wand2 className="mr-2 h-3.5 w-3.5" />
            )}
            {flow.buttonLabel}
          </Button>

          {flow.transcriptionFailed ? (
            <p className="text-xs text-destructive">
              {flow.transcriptionErrorMessage || "Transcription failed"}
            </p>
          ) : null}
          {flow.generationFailed ? (
            <p className="text-xs text-destructive">
              {flow.script?.errorMessage || "Script generation failed"}
            </p>
          ) : null}
          {flow.noSpeechOrNoTranscript ? (
            <p className="text-xs text-muted-foreground">
              {config.emptyTranscriptCopy}
            </p>
          ) : null}
          {flow.showScript &&
          flow.script?.status === "completed" &&
          flow.script.generatedScript ? (
            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-md border border-border/40 bg-muted/50 p-3 text-xs">
              {flow.script.generatedScript}
            </div>
          ) : null}
        </div>
      }
      mediaFallback={<div className="h-full w-full bg-muted" />}
    />
  );
}
