import { LibraryVideoCard } from "@/components/LibraryVideoCard";
import { quietReelMetricParts } from "@/components/QuietWorkspaceReelChrome";
import { useOpenCreatorInApp } from "@/hooks/useOpenCreatorInApp";
import type { OneClickRemakeAction } from "@/components/ReelActionButtons";
import type {
  PlatformResearchConfig,
  PlatformVideoLike,
} from "@/lib/platformResearchConfigs";

export function PlatformVideoCard({
  video,
  config,
  creatorHandle,
  followerCount,
  isSaved,
  oneClickRemake,
  onMediaClick,
  onToggleSave,
  onExpand,
  saveBusy,
  interactiveMedia = false,
  inlinePlaying = false,
  onInlinePlayRequest,
  onInlinePlayStop,
}: {
  video: PlatformVideoLike;
  index: number;
  config: PlatformResearchConfig;
  isModalOpen: boolean;
  creatorHandle?: string | null;
  followerCount?: number | null;
  isSaved: boolean;
  oneClickRemake?: OneClickRemakeAction;
  onMediaClick: () => void;
  onToggleSave: () => void;
  onExpand: () => void;
  saveBusy?: boolean;
  /** When true, media click plays inline when a URL exists or TikTok can refresh via reel id. */
  interactiveMedia?: boolean;
  inlinePlaying?: boolean;
  onInlinePlayRequest?: () => void;
  onInlinePlayStop?: () => void;
}) {
  const { openCreator } = useOpenCreatorInApp(
    config.platform === "tiktok" ? "tiktok" : "youtube"
  );
  const platform = config.platform === "tiktok" ? "tiktok" : config.platform === "youtube" ? "youtube" : "instagram";
  const playableUrl = config.getVideoUrl(video);
  // TikTok plays even without a URL (the player refreshes it via the video id).
  const canPlayInline =
    interactiveMedia &&
    (Boolean(playableUrl?.trim()) || platform === "youtube" || (platform === "tiktok" && video.id != null));

  return (
    <LibraryVideoCard
      platform={platform}
      thumbnailUrl={video.thumbnailUrl}
      videoUrl={playableUrl}
      reelId={video.id}
      reelUrl={video.videoPageUrl}
      caption={config.getCaption(video) || config.emptyCaptionLabel}
      creatorHandle={creatorHandle}
      onOpenCreator={() =>
        void openCreator({
          handle: creatorHandle,
          platform: platform === "tiktok" ? "tiktok" : "youtube",
        })
      }
      metrics={quietReelMetricParts({
        views: video.viewCount,
        engagementPct: video.engagementRate,
        reachViews: video.viewCount,
        reachFollowers: followerCount && followerCount > 0 ? followerCount : null,
        postedAt:
          video.postedAt instanceof Date ? video.postedAt.toISOString() : String(video.postedAt ?? ""),
      })}
      remake={oneClickRemake}
      saved={isSaved}
      onToggleSave={onToggleSave}
      saveBusy={saveBusy}
      onViewDetails={onExpand}
      inlinePlaying={canPlayInline && inlinePlaying}
      onInlinePlayRequest={() => (canPlayInline ? onInlinePlayRequest?.() : onMediaClick())}
      onInlinePlayStop={() => onInlinePlayStop?.()}
    />
  );
}
