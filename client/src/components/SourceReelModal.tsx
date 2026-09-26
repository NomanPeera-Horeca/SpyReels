import { useState } from "react";
import { Copy, ExternalLink, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { ReelSourcePlatformMark } from "@/components/ReelSourcePlatformMark";
import { SourceReelHashtagChips } from "@/components/SourceReelHashtagChips";
import { formatNumber, formatPostedTime } from "@/components/InlineWorkflow";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { toast } from "sonner";
import type { SourceReelView } from "@/components/SourceReelCard";

function hasReelMedia(reel: SourceReelView): boolean {
  return Boolean((reel.thumbnailUrl ?? "").trim() || (reel.videoUrl ?? "").trim());
}

export function SourceReelModal({
  sourceReel,
  open,
  onOpenChange,
}: {
  sourceReel: SourceReelView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [userTimezone] = useState(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const caption = sourceReel.caption ?? "";
  const handle = sourceReel.ownerHandle
    ? `@${sourceReel.ownerHandle.replace(/^@/, "")}`
    : "Unknown";
  const showVideo = hasReelMedia(sourceReel);
  const instagramUrl = `https://www.instagram.com/reel/${sourceReel.shortcode}/`;

  const copyCaption = async () => {
    if (!caption) return;
    const ok = await copyToClipboard(caption);
    if (ok) toast.success("Caption copied");
    else toast.error("Could not copy caption");
  };

  const copyAllHashtags = async () => {
    if (sourceReel.hashtags.length === 0) return;
    const text = sourceReel.hashtags.map(t => `#${t}`).join(" ");
    const ok = await copyToClipboard(text);
    if (ok) toast.success("Hashtags copied");
    else toast.error("Could not copy hashtags");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[min(92vh,900px)] max-h-[92vh] w-[min(96vw,1100px)] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 sm:max-w-[96vw]"
      >
        <DialogTitle className="sr-only">Source reel</DialogTitle>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-3 top-3 z-50 h-8 w-8 rounded-full bg-background/80 backdrop-blur"
          aria-label="Close"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <div className="flex shrink-0 items-center justify-center bg-black lg:w-[60%]">
            {showVideo ? (
              <div className="relative aspect-[9/16] h-[min(50vh,520px)] w-full max-w-md lg:h-full lg:max-h-none lg:min-h-[320px]">
                <DashboardReelGridMedia
                  thumbnailUrl={sourceReel.thumbnailUrl}
                  videoUrl={sourceReel.videoUrl}
                  shortcode={sourceReel.shortcode}
                  className="absolute inset-0 h-full w-full"
                />
                <ReelSourcePlatformMark platform="instagram" />
              </div>
            ) : (
              <div className="flex h-48 w-full items-center justify-center text-sm text-muted-foreground lg:h-full lg:min-h-[280px]">
                Video unavailable
              </div>
            )}
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto border-t border-border p-4 lg:w-[40%] lg:border-l lg:border-t-0">
            <div>
              <p className="text-sm font-semibold">{handle}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatNumber(sourceReel.viewCount)} views ·{" "}
                {formatNumber(sourceReel.likeCount)} likes ·{" "}
                {sourceReel.commentCount.toLocaleString()} comments
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Posted {formatPostedTime(sourceReel.postedAt, userTimezone)}
              </p>
            </div>

            <div className="min-h-0 flex-1">
              <p className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                Caption
              </p>
              <div className="max-h-[40vh] overflow-y-auto rounded-md border border-border bg-muted/30 p-3 text-sm leading-relaxed whitespace-pre-line lg:max-h-none">
                {caption || (
                  <span className="text-muted-foreground">No caption</span>
                )}
              </div>
            </div>

            <SourceReelHashtagChips hashtags={sourceReel.hashtags} />

            <div className="flex flex-col gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={copyCaption}
                disabled={!caption}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy caption
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={copyAllHashtags}
                disabled={sourceReel.hashtags.length === 0}
              >
                <Copy className="h-3.5 w-3.5" />
                Copy all hashtags
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                asChild
              >
                <a href={instagramUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  View on Instagram
                </a>
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
