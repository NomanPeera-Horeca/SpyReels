import { useState } from "react";
import { WorkspaceReelGridTile } from "@/components/WorkspaceReelGridTile";
import {
  QuietCreatorButton,
  QuietReelCaption,
  QuietReelMetrics,
  QuietRemakeActions,
} from "@/components/QuietWorkspaceReelChrome";
import { useOpenCreatorInApp } from "@/hooks/useOpenCreatorInApp";
import type { OneClickRemakeAction } from "@/components/ReelActionButtons";
import type {
  PlatformResearchConfig,
  PlatformVideoLike,
} from "@/lib/platformResearchConfigs";

export function PlatformVideoCard({
  video,
  index,
  config,
  isModalOpen,
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
  const [moreOpen, setMoreOpen] = useState(false);
  const { openCreator } = useOpenCreatorInApp(
    config.platform === "tiktok" ? "tiktok" : "youtube"
  );
  const captionText = config.getCaption(video);
  const playableUrl = config.getVideoUrl(video);
  // TikTok: allow mount/play request with empty videoUrl; DashboardReelGridMedia refreshes via reelId.
  const canPlayInline =
    interactiveMedia &&
    (Boolean(playableUrl?.trim()) ||
      (config.platform === "tiktok" && video.id != null));
  const remake = oneClickRemake;

  return (
    <WorkspaceReelGridTile
      chrome="quiet"
      index={index}
      isActive={isModalOpen}
      thumbnailUrl={video.thumbnailUrl}
      videoUrl={playableUrl}
      reelId={video.id}
      mediaPlatform={config.platform === "tiktok" ? "tiktok" : "instagram"}
      duration={video.durationSec}
      reelUrl={video.videoPageUrl}
      onMediaClick={onMediaClick}
      interactiveMedia={canPlayInline}
      inlinePlaying={inlinePlaying}
      onInlinePlayRequest={onInlinePlayRequest}
      onInlinePlayStop={onInlinePlayStop}
      caption={
        <QuietReelCaption>
          {captionText || (
            <span className="italic text-[#a8a3b3]">{config.emptyCaptionLabel}</span>
          )}
        </QuietReelCaption>
      }
      creator={
        <QuietCreatorButton
          handle={creatorHandle}
          onOpen={() =>
            void openCreator({
              handle: creatorHandle,
              platform: config.platform === "tiktok" ? "tiktok" : "youtube",
            })
          }
        />
      }
      stats={
        <QuietReelMetrics
          views={video.viewCount}
          engagementPct={video.engagementRate}
          reachViews={video.viewCount}
          reachFollowers={followerCount && followerCount > 0 ? followerCount : null}
          postedAt={
            video.postedAt instanceof Date
              ? video.postedAt.toISOString()
              : String(video.postedAt ?? "")
          }
        />
      }
      actions={
        remake ? (
          <QuietRemakeActions
            remakeLabel={remake.label}
            remakeDisabled={remake.disabled || saveBusy}
            remakeBusy={remake.loading}
            onRemake={() => remake.onClick()}
            saved={isSaved}
            onToggleSave={onToggleSave}
            moreOpen={moreOpen}
            onToggleMore={() => setMoreOpen((open) => !open)}
            moreMenu={
              moreOpen ? (
                <div className="absolute bottom-11 right-0 z-30 grid min-w-[160px] gap-0.5 rounded-[12px] border border-[#2b2739] bg-[#1d1b24] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,.45)]">
                  <button
                    type="button"
                    className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
                    onClick={() => {
                      setMoreOpen(false);
                      onExpand();
                    }}
                  >
                    View details
                  </button>
                  {creatorHandle ? (
                    <button
                      type="button"
                      className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
                      onClick={() => {
                        setMoreOpen(false);
                        void openCreator({
                          handle: creatorHandle,
                          platform:
                            config.platform === "tiktok" ? "tiktok" : "youtube",
                        });
                      }}
                    >
                      Open creator
                    </button>
                  ) : null}
                  {video.videoPageUrl ? (
                    <a
                      href={video.videoPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-lg px-2.5 py-2 text-left text-xs text-[#a9a4b8] hover:bg-white/[0.06] hover:text-white"
                      onClick={() => setMoreOpen(false)}
                    >
                      Open source
                    </a>
                  ) : null}
                </div>
              ) : null
            }
          />
        ) : null
      }
      mediaFallback={<div className="absolute inset-0 h-full w-full bg-muted" />}
    />
  );
}
