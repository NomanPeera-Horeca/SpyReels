import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  formatDuration,
  formatNumber,
  formatPostedTime,
} from "@/components/InlineWorkflow";
import { Film, Eye, Heart, MessageCircle, TrendingUp, Clock } from "lucide-react";

export type GridReelWorkflowPreview = {
  id: number;
  caption: string | null;
  thumbnailUrl: string | null;
  /** Direct MP4 URL when available (R2 or CDN). */
  videoUrl?: string | null;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  engagementRate: number;
  postedAt: string | Date;
  duration: number | null;
};

type GridReelWorkflowDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reel: GridReelWorkflowPreview | null;
  userTimezone: string;
  children: ReactNode;
};

/**
 * Full-width dialog for grid view: reel summary plus the same InlineWorkflow
 * as list expand (passed as children).
 */
export function GridReelWorkflowDialog({
  open,
  onOpenChange,
  reel,
  userTimezone,
  children,
}: GridReelWorkflowDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(90vh,880px)] max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Reel workflow</DialogTitle>
        </DialogHeader>
        {reel ? (
          <>
            <div className="flex shrink-0 gap-3 border-b border-border/40 p-4 sm:gap-4">
              <div className="relative h-36 w-24 shrink-0 overflow-hidden rounded-md bg-muted sm:h-44 sm:w-28">
                {reel.videoUrl?.trim() ? (
                  <video
                    key={reel.id}
                    src={reel.videoUrl.trim()}
                    poster={reel.thumbnailUrl ?? undefined}
                    controls
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : reel.thumbnailUrl ? (
                  <img
                    src={reel.thumbnailUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <Film className="h-6 w-6 text-muted-foreground/50" />
                  </div>
                )}
                {reel.duration != null && reel.duration > 0 && (
                  <span className="pointer-events-none absolute bottom-1 right-1 rounded bg-black/70 px-1 py-0.5 text-[10px] font-mono text-white">
                    {formatDuration(reel.duration)}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-sm leading-snug text-foreground line-clamp-4">
                  {reel.caption || (
                    <span className="text-muted-foreground italic">No caption</span>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="h-3 w-3 shrink-0" />
                    {formatNumber(reel.viewCount)}
                  </span>
                  <span className="flex items-center gap-1">
                    <Heart className="h-3 w-3 shrink-0" />
                    {formatNumber(reel.likeCount)}
                  </span>
                  <span className="flex items-center gap-1">
                    <MessageCircle className="h-3 w-3 shrink-0" />
                    {formatNumber(reel.commentCount)}
                  </span>
                  {reel.engagementRate > 0 && (
                    <span className="flex items-center gap-1 font-medium text-emerald-400">
                      <TrendingUp className="h-3 w-3 shrink-0" />
                      {reel.engagementRate.toFixed(2)}%
                    </span>
                  )}
                  <span className="flex items-center gap-1 text-amber-400/80">
                    <Clock className="h-3 w-3 shrink-0" />
                    {formatPostedTime(reel.postedAt, userTimezone)}
                  </span>
                </div>
              </div>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden p-4 pt-2">
              {children}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
