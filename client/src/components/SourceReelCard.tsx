import { useState } from "react";
import { Copy, Maximize2, Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { SourceReelHashtagChips } from "@/components/SourceReelHashtagChips";
import { formatNumber, formatPostedTime } from "@/components/InlineWorkflow";
import { copyToClipboard } from "@/lib/copyToClipboard";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type SourceReelView = {
  id: number;
  shortcode: string;
  ownerHandle: string;
  caption: string | null;
  hashtags: string[];
  viewCount: number;
  likeCount: number;
  commentCount: number;
  postedAt: string | Date;
  thumbnailUrl: string | null;
  videoUrl: string | null;
};

function hasReelMedia(reel: SourceReelView): boolean {
  return Boolean((reel.thumbnailUrl ?? "").trim() || (reel.videoUrl ?? "").trim());
}

export function SourceReelCard({
  sourceReel,
  onExpand,
  className,
}: {
  sourceReel: SourceReelView;
  onExpand: () => void;
  className?: string;
}) {
  const [userTimezone] = useState(() =>
    Intl.DateTimeFormat().resolvedOptions().timeZone
  );
  const caption = sourceReel.caption ?? "";
  const handle = sourceReel.ownerHandle
    ? `@${sourceReel.ownerHandle.replace(/^@/, "")}`
    : "Unknown";
  const showVideo = hasReelMedia(sourceReel);

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
    <div
      className={cn(
        "relative rounded-lg border border-border bg-card p-3 space-y-2.5",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase text-muted-foreground">
          Source Reel
        </h4>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label="Expand source reel"
          onClick={onExpand}
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showVideo ? (
        <div className="relative mx-auto w-full max-w-[280px] overflow-hidden rounded-md border border-border aspect-[9/16] bg-black">
          <DashboardReelGridMedia
            thumbnailUrl={sourceReel.thumbnailUrl}
            videoUrl={sourceReel.videoUrl}
            className="absolute inset-0 h-full w-full"
            size="compact"
          />
        </div>
      ) : (
        <div className="flex items-center justify-center rounded-md border border-dashed border-border bg-muted/30 py-6">
          <Film className="h-5 w-5 text-muted-foreground/50" />
        </div>
      )}

      <p className="text-xs font-medium truncate">{handle}</p>
      <p className="text-[10px] text-muted-foreground">
        {formatNumber(sourceReel.viewCount)} views ·{" "}
        {formatNumber(sourceReel.likeCount)} likes ·{" "}
        {formatPostedTime(sourceReel.postedAt, userTimezone)}
      </p>

      {caption ? (
        <p className="text-xs leading-relaxed text-foreground/90 line-clamp-3 whitespace-pre-line">
          {caption}
        </p>
      ) : null}

      <SourceReelHashtagChips hashtags={sourceReel.hashtags} />

      <div className="flex flex-col gap-1.5 pt-0.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-full text-[10px] gap-1"
          onClick={copyCaption}
          disabled={!caption}
        >
          <Copy className="h-3 w-3" />
          Copy caption
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 w-full text-[10px] gap-1"
          onClick={copyAllHashtags}
          disabled={sourceReel.hashtags.length === 0}
        >
          <Copy className="h-3 w-3" />
          Copy all hashtags
        </Button>
      </div>
    </div>
  );
}
