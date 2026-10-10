import type { ReactNode } from "react";
import { ExternalLink, Play } from "lucide-react";
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { ReelGridThumbnail } from "@/components/ReelGridThumbnail";
import { ReelSourcePlatformMark } from "@/components/ReelSourcePlatformMark";
import { YouTubeInlineEmbed } from "@/components/YouTubeInlineEmbed";
import { cn } from "@/lib/utils";
import { formatWorkspaceReelDuration } from "@/lib/workspaceReelGridLayout";
import { resolveYouTubeVideoId } from "@/lib/youtubeVideoId";

export type WorkspaceReelGridTileProps = {
  className?: string;
  isActive?: boolean;
  index: number;
  thumbnailUrl?: string | null;
  videoUrl?: string | null;
  shortcode?: string | null;
  reelId?: number;
  /**
   * Inline playback platform. YouTube has no durable MP4, so tiles embed the
   * Short in-app instead of bouncing to youtube.com or faking an IG refresh.
   */
  mediaPlatform?: "instagram" | "tiktok" | "youtube";
  engagementRate?: number;
  duration?: number | null;
  reelUrl?: string | null;
  onMediaClick?: () => void;
  highlightBanner?: string | null;
  topRight?: ReactNode;
  mediaLabel?: ReactNode;
  statusChip?: ReactNode;
  badges?: ReactNode;
  /** Optional creator row between caption and stats (quiet mature card). */
  creator?: ReactNode;
  /**
   * Quiet-card meta block (caption / creator / stats). Opens details drawer.
   * Remake / star / more stay on `actions` and must not use this.
   */
  onMetaClick?: () => void;
  caption: ReactNode;
  stats: ReactNode;
  actions: ReactNode;
  mediaFallback?: ReactNode;
  /**
   * Quiet = approved mature SaaS card chrome (Viral Posts HTML).
   * Dense = legacy overlays (rank, eng chip, duration, external FAB).
   */
  chrome?: "dense" | "quiet";
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
 * Canonical vertical reel tile (quiet chrome by default).
 * Dashboard, Collected, Saved, and platform spy grids should share this shell
 * so caption, metrics, and Remake actions stay consistent.
 */
export function WorkspaceReelGridTile({
  className,
  isActive,
  index,
  thumbnailUrl,
  videoUrl,
  shortcode,
  reelId,
  mediaPlatform = "instagram",
  engagementRate = 0,
  duration,
  reelUrl,
  onMediaClick,
  highlightBanner,
  topRight,
  mediaLabel,
  statusChip,
  badges,
  creator,
  onMetaClick,
  caption,
  stats,
  actions,
  mediaFallback,
  chrome = "quiet",
  interactiveMedia = false,
  inlinePlaying = false,
  onInlinePlayRequest,
  onInlinePlayStop,
}: WorkspaceReelGridTileProps) {
  const quiet = chrome === "quiet";
  const showEngagement =
    !quiet && engagementRate > 0 && !(highlightBanner && index === 0);
  const hasThumb = (thumbnailUrl ?? "").trim().length > 0;
  const isYouTube = mediaPlatform === "youtube";
  const youtubeVideoId = isYouTube
    ? resolveYouTubeVideoId({ shortcode, reelUrl })
    : null;
  const canPlayYouTubeInline = Boolean(youtubeVideoId);
  const showInlinePlayer =
    interactiveMedia &&
    inlinePlaying &&
    (isYouTube ? canPlayYouTubeInline : hasThumb);

  const handleMediaAreaClick = () => {
    if (interactiveMedia) {
      if (isYouTube && !canPlayYouTubeInline) {
        onMediaClick?.();
        return;
      }
      if (!inlinePlaying) onInlinePlayRequest?.();
      return;
    }
    onMediaClick?.();
  };

  return (
    <div
      className={cn(
        "workspace-reel-card group relative flex h-full flex-col overflow-hidden",
        quiet && "rounded-[16px] border border-[#2b2739] bg-[#1a1821]",
        isActive && "ring-2 ring-primary/35",
        className
      )}
    >
      <div
        className="relative aspect-[9/14] cursor-pointer overflow-hidden bg-muted"
        onClick={handleMediaAreaClick}
      >
        {/*
          Absolute fill is required: percentage height on replaced elements does not
          resolve against an aspect-ratio box alone, so shorter TikTok covers
          (e.g. 300x400) leave a black gap under the image.
        */}
        <div className="absolute inset-0">
          {showInlinePlayer && isYouTube && youtubeVideoId ? (
            <YouTubeInlineEmbed
              className="h-full w-full"
              videoId={youtubeVideoId}
              onStop={onInlinePlayStop}
            />
          ) : hasThumb ? (
            showInlinePlayer ? (
              <DashboardReelGridMedia
                className="h-full w-full"
                thumbnailUrl={thumbnailUrl}
                videoUrl={videoUrl}
                shortcode={shortcode}
                reelId={reelId}
                platform={mediaPlatform === "tiktok" ? "tiktok" : "instagram"}
                videoPageUrl={reelUrl}
                autoStart
                onPlayingChange={(playing) => {
                  if (!playing) onInlinePlayStop?.();
                }}
              />
            ) : (
              <ReelGridThumbnail
                className="h-full w-full"
                thumbnailUrl={thumbnailUrl}
                width={360}
                height={560}
              />
            )
          ) : (
            mediaFallback
          )}
        </div>

        {hasThumb && !showInlinePlayer ? (
          <div
            className={cn(
              "pointer-events-none absolute left-1/2 top-1/2 z-20 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/55 text-white shadow-lg backdrop-blur transition-opacity duration-150",
              interactiveMedia
                ? "opacity-90 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
                : "opacity-75 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 [@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100"
            )}
            aria-hidden
          >
            <Play className="h-5 w-5 translate-x-0.5 fill-current" />
          </div>
        ) : null}

        {/* Keep source branding visible while playing (Shorts-style). */}
        {(hasThumb || showInlinePlayer) && !mediaLabel ? (
          <ReelSourcePlatformMark platform={mediaPlatform} />
        ) : null}

        {quiet && statusChip ? (
          <div className="absolute left-2.5 top-2.5 z-30 max-w-[calc(100%-1.25rem)]">
            {statusChip}
          </div>
        ) : null}

        {!quiet ? (
          <>
            <div className="absolute left-2 top-10 z-10 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
              #{index + 1}
            </div>

            {mediaLabel ? (
              <div className="absolute left-2 top-10 max-w-[calc(100%-1rem)]">
                {mediaLabel}
              </div>
            ) : null}

            {highlightBanner ? (
              <div className="absolute inset-x-2 bottom-2 rounded bg-primary/90 px-2 py-1 text-center text-[10px] font-semibold text-primary-foreground">
                {highlightBanner}
              </div>
            ) : null}

            {showEngagement ? (
              <div className="absolute bottom-2 left-2 z-10 rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-950">
                {engagementRate.toFixed(2)}%
              </div>
            ) : null}

            {topRight ? (
              <div className="absolute right-2 top-2 z-30">{topRight}</div>
            ) : null}

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
              <span className="absolute right-2 top-10 z-10 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white">
                {formatWorkspaceReelDuration(duration)}
              </span>
            ) : null}

            {statusChip ? (
              <div className="absolute left-2 top-[4.25rem] max-w-[calc(100%-1rem)]">
                {statusChip}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {!quiet ? (
        <div className="min-h-7 shrink-0 px-2.5 pb-0 pt-2">{badges ?? null}</div>
      ) : null}

      <div
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          quiet ? "gap-2 px-3 pb-3 pt-3" : "px-2.5 pb-2.5 pt-2"
        )}
      >
        <div
          className={cn(
            "min-h-0 flex-1",
            quiet ? "grid gap-2" : "space-y-2",
            onMetaClick && "cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          )}
          onClick={
            onMetaClick
              ? (e) => {
                  e.stopPropagation();
                  onMetaClick();
                }
              : undefined
          }
          onKeyDown={
            onMetaClick
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onMetaClick();
                  }
                }
              : undefined
          }
          role={onMetaClick ? "button" : undefined}
          tabIndex={onMetaClick ? 0 : undefined}
        >
          {caption}
          {creator}
          {stats}
        </div>
        <div
          className={cn(
            "relative z-20 mt-auto shrink-0",
            quiet ? "min-h-9 pt-1" : "min-h-10 pt-2"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      </div>
    </div>
  );
}
