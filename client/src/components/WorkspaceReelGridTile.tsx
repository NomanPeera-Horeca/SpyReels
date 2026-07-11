import type { ReactNode } from "react";
import { ExternalLink } from "lucide-react";
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
  /** When false (default), renders a lazy thumbnail only. Set true for inline grid playback. */
  interactiveMedia?: boolean;
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
}: WorkspaceReelGridTileProps) {
  const showEngagement =
    engagementRate > 0 && !(highlightBanner && index === 0);

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
        onClick={onMediaClick}
      >
        {(thumbnailUrl ?? "").trim() ? (
          interactiveMedia ? (
            <DashboardReelGridMedia
              className="relative h-full w-full"
              thumbnailUrl={thumbnailUrl}
              videoUrl={videoUrl}
              shortcode={shortcode}
              reelId={reelId}
            />
          ) : (
            <ReelGridThumbnail
              className="relative h-full w-full"
              thumbnailUrl={thumbnailUrl}
            />
          )
        ) : (
          mediaFallback
        )}

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

        {topRight ? <div className="absolute right-2 top-2">{topRight}</div> : null}

        {reelUrl ? (
          <a
            href={reelUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="absolute bottom-2 right-2 rounded-full bg-black/55 p-1.5 text-white/90 backdrop-blur hover:bg-black/75"
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

      {badges ? <div className="shrink-0 px-2.5 pb-0 pt-2">{badges}</div> : null}

      <div className="flex min-h-0 flex-1 flex-col px-2.5 pb-2.5 pt-2">
        <div className="min-h-0 flex-1 cursor-pointer space-y-2" onClick={onMediaClick}>
          {caption}
          {stats}
        </div>
        <div className="mt-auto shrink-0 pt-2">{actions}</div>
      </div>
    </div>
  );
}
