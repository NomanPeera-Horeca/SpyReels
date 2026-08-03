import type { ReactNode } from "react";
import { ExternalLink, Play } from "lucide-react";
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { ReelGridThumbnail } from "@/components/ReelGridThumbnail";
import { cn } from "@/lib/utils";
import { formatWorkspaceReelDuration } from "@/lib/workspaceReelGridLayout";

export type WorkspaceReelGridTileProps = {
  className?: string;
  isActive?: boolean;
  index: number;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  shortcode?: string | null;
  reelId?: number;
  engagementRate?: number;
  duration?: number | null;
  reelUrl?: string | null;
  onMediaClick?: () => void;
  highlightBanner?: string | null;
  topRight?: ReactNode;
  mediaLabel?: ReactNode;
  statusChip?: ReactNode;
  badges?: ReactNode;
  caption: ReactNode;
  stats: ReactNode;
  actions: ReactNode;
  mediaFallback?: ReactNode;
  /**
   * Freeze-safe inline playback: only the actively playing tile mounts a
   * video player. Other tiles stay as lazy thumbnails.
   */
  interactiveMedia?: boolean;
  /** True when this tile is the one currently playing inline. */
  inlinePlaying?: boolean;
  /** User asked to play this tile (parent should set inlinePlaying to this reel). */
  onInlinePlayRequest?: () => void;
  /** Playback stopped/closed (parent should clear inlinePlaying if it matches). */
  onInlinePlayStop?: () => void;
};

/**
 * Canonical vertical reel tile used on Dashboard (Creator Radar drill-down).
 * Collected Reels, Saved Reels, and other grid views should use this shell
 * so rank overlays, stats, and action placement stay consistent.
 */
export function WorkspaceReelGridTile({
  className,
  isActive,
  index,
  thumbnailUrl,
  videoUrl,
  shortcode,
  reelId,
  engagementRate = 0,
  duration,
  reelUrl,
  onMediaClick,
  highlightBanner,
  topRight,
  mediaLabel,
  statusChip,
  badges,
  caption,
  stats,
  actions,
  mediaFallback,
  interactiveMedia = false,
  inlinePlaying = false,
  onInlinePlayRequest,
  onInlinePlayStop,
}: WorkspaceReelGridTileProps) {
  const showEngagement =
    engagementRate > 0 && !(highlightBanner && index === 0);
  const hasThumb = (thumbnailUrl ?? "").trim().length > 0;
  const showInlinePlayer = interactiveMedia && inlinePlaying && hasThumb;

  const handleMediaAreaClick = () => {
    if (interactiveMedia) {
      if (!inlinePlaying) onInlinePlayRequest?.();
      return;
    }
    onMediaClick?.();
  };

  return (
    <div
      className={cn(
        "workspace-reel-card group relative flex h-full flex-col overflow-hidden",
        isActive && "ring-2 ring-primary/35",
        className
      )}
    >
      <div
        className="relative aspect-[9/14] cursor-pointer overflow-hidden"
        onClick={handleMediaAreaClick}
      >
        {hasThumb ? (
          showInlinePlayer ? (
            <DashboardReelGridMedia
              className="relative h-full w-full"
              thumbnailUrl={thumbnailUrl}
              videoUrl={videoUrl}
              shortcode={shortcode}
              reelId={reelId}
              autoStart
              onPlayingChange={(playing) => {
                if (!playing) onInlinePlayStop?.();
              }}
            />
          ) : (
            <ReelGridThumbnail
              className="relative h-full w-full"
              thumbnailUrl={thumbnailUrl}
              width={360}
              height={560}
            />
          )
        ) : (
          mediaFallback
        )}

        {/* Play affordance: real click target when interactive; visual-only otherwise. */}
        {hasThumb && !showInlinePlayer ? (
          <div
            className={cn(
              "absolute left-1/2 top-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/55 text-white shadow-lg backdrop-blur transition-opacity duration-150",
              interactiveMedia
                ? "opacity-90 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
                : "pointer-events-none opacity-75 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
            )}
            aria-hidden={!interactiveMedia}
          >
            <Play className="h-5 w-5 translate-x-0.5 fill-current" />
          </div>
        ) : null}

        <div className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
          #{index + 1}
        </div>

        {mediaLabel ? (
          <div className="absolute left-2 top-10 max-w-[calc(100%-1rem)]">{mediaLabel}</div>
        ) : null}

        {highlightBanner ? (
          <div className="absolute inset-x-2 bottom-2 rounded bg-primary/90 px-2 py-1 text-center text-[10px] font-semibold text-primary-foreground">
            {highlightBanner}
          </div>
        ) : null}

        {showEngagement ? (
          <div className="absolute bottom-2 left-2 rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950">
            {engagementRate.toFixed(2)}%
          </div>
        ) : null}

        {topRight ? <div className="absolute right-2 top-2 z-30">{topRight}</div> : null}

        {reelUrl ? (
          <a
            href={reelUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2 right-2 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 p-0 text-white/90 backdrop-blur hover:bg-black/75"
            title="Open on Instagram"
            aria-label="Open on Instagram"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}

        {duration ? (
          <span className="absolute right-2 top-10 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
            {formatWorkspaceReelDuration(duration)}
          </span>
        ) : null}

        {statusChip ? (
          <div className="absolute left-2 top-[4.25rem] max-w-[calc(100%-1rem)]">{statusChip}</div>
        ) : null}
      </div>

      <div className="min-h-7 shrink-0 px-2.5 pb-0 pt-2">{badges ?? null}</div>

      <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-2">
        <div className="min-h-0 flex-1 space-y-2">
          {caption}
          {stats}
        </div>
        <div
          className="relative z-20 mt-auto min-h-10 shrink-0 pt-2"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      </div>
    </div>
  );
}
