import type { ReactNode, Ref } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Film,
  Heart,
  MessageCircle,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatNumber, formatPostedTime } from "@/components/InlineWorkflow";

export type WorkspaceReelListRowStats = {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  engagementRate: number;
  postedAt: string | Date;
};

export type WorkspaceReelListRowProps = {
  rowRef?: Ref<HTMLDivElement>;
  index: number;
  thumbnailUrl?: string | null;
  duration?: number | null;
  /** Caption or title line. Empty shows the emptyCaptionLabel italic. */
  caption: string | null | undefined;
  emptyCaptionLabel?: string;
  stats: WorkspaceReelListRowStats;
  userTimezone: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Optional classification / brand badges under the caption. */
  badges?: ReactNode;
  /** Status pills next to the caption (Transcribed, Processing, etc.). */
  statusChip?: ReactNode;
  /** Remake / save strip. Chevron is owned by this component when not onboarding. */
  actions: ReactNode;
  /** Inline expand panel (e.g. InlineWorkflow). Rendered only when isExpanded. */
  expandedContent?: ReactNode;
  /**
   * First-visit onboarding: primary border + "Start here" label.
   * Defaults off.
   */
  onboardingBorder?: boolean;
  /**
   * First-visit layout: stacked actions, no expand chevron.
   * Defaults off (standard list row with chevron).
   */
  onboardingLayout?: boolean;
};

/**
 * Canonical compact list row for workspace reels (Dashboard list view).
 * Markup and classes match the former Dashboard inline list row exactly.
 */
export function WorkspaceReelListRow({
  rowRef,
  index,
  thumbnailUrl,
  duration,
  caption,
  emptyCaptionLabel = "No caption",
  stats,
  userTimezone,
  isExpanded,
  onToggleExpand,
  badges,
  statusChip,
  actions,
  expandedContent,
  onboardingBorder = false,
  onboardingLayout = false,
}: WorkspaceReelListRowProps) {
  return (
    <div
      ref={rowRef}
      className={`workspace-reel-card overflow-hidden ${
        onboardingBorder ? "rounded-xl border-2 border-primary/40 bg-primary/5" : ""
      }`}
    >
      {/* Reel Row */}
      <div
        className={`${
          onboardingLayout
            ? "flex flex-col gap-3 p-3 hover:bg-accent/25 transition-colors cursor-pointer"
            : `flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-3 hover:bg-accent/25 transition-colors cursor-pointer ${
                isExpanded ? "bg-accent/20 border-b border-border/40" : ""
              }`
        }`}
        onClick={onToggleExpand}
      >
        <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center sm:gap-3">
          {/* Rank */}
          <span className="hidden w-5 shrink-0 text-right font-mono text-sm text-muted-foreground sm:block sm:w-6">
            {index + 1}
          </span>

          {/* Thumbnail */}
          <div className="relative h-[4.5rem] w-14 shrink-0 overflow-hidden rounded-md bg-muted">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt=""
                width={56}
                height={72}
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Film className="h-4 w-4 text-muted-foreground/50" />
              </div>
            )}
            {duration ? (
              <span className="absolute bottom-0.5 right-0.5 text-[9px] font-mono bg-black/70 text-white px-1 rounded">
                {Math.floor(duration / 60)}:{(duration % 60).toString().padStart(2, "0")}
              </span>
            ) : null}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            {onboardingBorder ? (
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-primary">
                Start here
              </p>
            ) : null}
            <div className="flex items-center gap-2 mb-0.5">
              <p className="text-sm text-foreground line-clamp-1 leading-snug">
                {caption || (
                  <span className="text-muted-foreground italic">{emptyCaptionLabel}</span>
                )}
              </p>
              {statusChip}
            </div>
            {badges ? (
              <div className="mt-1 flex flex-wrap items-center gap-1.5">{badges}</div>
            ) : null}
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <span className="flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {formatNumber(stats.viewCount)}
              </span>
              <span className="flex items-center gap-1">
                <Heart className="h-3 w-3" />
                {formatNumber(stats.likeCount)}
              </span>
              <span className="flex items-center gap-1">
                <MessageCircle className="h-3 w-3" />
                {formatNumber(stats.commentCount)}
              </span>
              {stats.engagementRate > 0 && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <TrendingUp className="h-3 w-3" />
                  {stats.engagementRate.toFixed(2)}%
                </span>
              )}
              {/* Competitor posting day & time in user timezone */}
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatPostedTime(stats.postedAt, userTimezone)}
              </span>
            </div>
          </div>
        </div>

        {!onboardingLayout ? (
          <div
            className="flex w-full shrink-0 flex-col items-stretch gap-1 sm:w-auto sm:min-w-[11rem] sm:self-center"
            onClick={(e) => e.stopPropagation()}
          >
            {actions}
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-8 w-8 shrink-0 p-0 text-muted-foreground sm:inline-flex"
              onClick={(e) => {
                e.stopPropagation();
                onToggleExpand();
              }}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        ) : null}

        {onboardingLayout ? (
          <div className="w-full" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        ) : null}
      </div>

      {isExpanded ? expandedContent : null}
    </div>
  );
}
