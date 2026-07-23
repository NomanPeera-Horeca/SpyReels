import { WorkspaceReelGridTile } from "@/components/WorkspaceReelGridTile";
import { formatNumber, formatPostedTime } from "@/components/InlineWorkflow";
import {
  ReelActionButtons,
  type OneClickRemakeAction,
  type ReelActionSource,
} from "@/components/ReelActionButtons";
import type {
  PlatformResearchConfig,
  PlatformVideoLike,
} from "@/lib/platformResearchConfigs";

export function PlatformVideoCard({
  video,
  index,
  config,
  isModalOpen,
  userTimezone,
  hasTranscription,
  isProcessing,
  isFailed,
  isNoSpeech,
  isSaved,
  recreateState,
  oneClickRemake,
  onMediaClick,
  onToggleSave,
  onTranscribe,
  onExpand,
  onMakeVersion,
  onOpenMyScript,
  saveBusy,
}: {
  video: PlatformVideoLike;
  index: number;
  config: PlatformResearchConfig;
  isModalOpen: boolean;
  userTimezone: string;
  hasTranscription: boolean;
  isProcessing: boolean;
  isFailed: boolean;
  isNoSpeech: boolean;
  isSaved: boolean;
  recreateState: "none" | "generating" | "ready" | "failed";
  oneClickRemake?: OneClickRemakeAction;
  onMediaClick: () => void;
  onToggleSave: () => void;
  onTranscribe: () => void;
  onExpand: () => void;
  onMakeVersion: () => void;
  onOpenMyScript: () => void;
  saveBusy?: boolean;
}) {
  const captionText = config.getCaption(video);
  const actionSource: ReelActionSource =
    config.platform === "tiktok"
      ? { source: "tiktok", tiktokVideoId: video.id }
      : { source: "youtube", youtubeVideoId: video.id };

  return (
    <WorkspaceReelGridTile
      index={index}
      isActive={isModalOpen}
      thumbnailUrl={video.thumbnailUrl}
      videoUrl={config.getVideoUrl(video)}
      engagementRate={video.engagementRate}
      duration={video.durationSec}
      reelUrl={video.videoPageUrl}
      onMediaClick={onMediaClick}
      statusChip={
        hasTranscription && !isNoSpeech ? (
          <span className="rounded bg-emerald-500/85 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950">
            Transcribed
          </span>
        ) : isNoSpeech ? (
          <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-medium text-white/90">
            No voice
          </span>
        ) : isProcessing ? (
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
          {video.engagementRate > 0 ? (
            <>
              <span aria-hidden>·</span>
              <span className="font-medium text-emerald-400">
                {video.engagementRate.toFixed(2)}%
              </span>
            </>
          ) : null}
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <span className="hidden sm:inline">
            {formatNumber(video.likeCount)} likes
          </span>
          <span className="hidden md:inline" aria-hidden>
            ·
          </span>
          <span className="hidden md:inline">
            {formatNumber(video.commentCount)} comments
          </span>
          {config.hasShares ? (
            <>
              <span className="hidden md:inline" aria-hidden>
                ·
              </span>
              <span className="hidden md:inline">
                {formatNumber(video.shareCount ?? 0)} shares
              </span>
            </>
          ) : null}
          <span className="hidden sm:inline" aria-hidden>
            ·
          </span>
          <span className="hidden sm:inline text-muted-foreground">
            {formatPostedTime(video.postedAt, userTimezone)}
          </span>
        </div>
      }
      actions={
        <ReelActionButtons
          source={actionSource}
          reelId={video.id}
          reelUrl={video.videoPageUrl}
          isSaved={isSaved}
          hasTranscription={hasTranscription}
          isProcessing={isProcessing}
          isFailed={isFailed}
          recreateState={recreateState}
          isNoSpeech={isNoSpeech}
          compact
          hideBookmark
          hideExternalLink
          oneClickRemake={oneClickRemake}
          onToggleSave={onToggleSave}
          onTranscribe={onTranscribe}
          onExpand={onExpand}
          onMakeVersion={onMakeVersion}
          onOpenMyScript={onOpenMyScript}
          saveBusy={saveBusy}
        />
      }
      mediaFallback={<div className="h-full w-full bg-muted" />}
    />
  );
}
