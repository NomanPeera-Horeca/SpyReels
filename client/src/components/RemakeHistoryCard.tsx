import { useEffect, useRef, useState } from "react";
import { Calendar, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const HOVER_ADVANCE_MS = 900;

function formatRemakeDate(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatScheduledBadge(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export type RemakeHistoryCardProps = {
  templateName: string;
  niche: string;
  status: "completed" | "failed" | string;
  createdAt: Date | string;
  postDate: Date | string | null;
  thumbnailUrl: string | null;
  /** Ordered per-slide image URLs for hover preview. */
  slideImageUrls: string[];
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  /** Opens delete confirmation; does not delete immediately. */
  onDeleteRequest?: () => void;
};

/**
 * Your Carousels grid card: hover cycles real slide images (900ms) with dots.
 * Click reopens the remake. Trash on hover requests delete confirmation.
 */
export function RemakeHistoryCard({
  templateName,
  niche,
  status,
  createdAt,
  postDate,
  thumbnailUrl,
  slideImageUrls,
  isActive,
  disabled,
  onClick,
  onDeleteRequest,
}: RemakeHistoryCardProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [isHovering, setIsHovering] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const previewUrls =
    slideImageUrls.length > 0
      ? slideImageUrls
      : thumbnailUrl
        ? [thumbnailUrl]
        : [];
  const slideCount = previewUrls.length;
  const activeIndex = Math.min(slideIndex, Math.max(slideCount - 1, 0));
  const activeUrl = previewUrls[activeIndex] ?? null;
  const isFailed = status === "failed";

  useEffect(() => {
    if (!isHovering || slideCount <= 1) {
      if (hoverTimerRef.current) {
        clearInterval(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
      return;
    }

    hoverTimerRef.current = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % slideCount);
    }, HOVER_ADVANCE_MS);

    return () => {
      if (hoverTimerRef.current) {
        clearInterval(hoverTimerRef.current);
        hoverTimerRef.current = null;
      }
    };
  }, [isHovering, slideCount]);

  function handleMouseEnter() {
    setIsHovering(true);
  }

  function handleMouseLeave() {
    setIsHovering(false);
    setSlideIndex(0);
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-colors",
        "hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        isActive && "ring-2 ring-primary/35",
        isFailed ? "border-destructive/30" : "border-border/50",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
        {activeUrl ? (
          <img
            src={activeUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground">
            {templateName}
          </div>
        )}
        {isFailed ? (
          <span className="absolute left-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-medium text-destructive-foreground">
            Failed
          </span>
        ) : postDate ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-medium text-primary-foreground">
            <Calendar className="h-2.5 w-2.5" />
            {formatScheduledBadge(postDate)}
          </span>
        ) : null}

        {onDeleteRequest ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={`Delete ${templateName}`}
            className={cn(
              "absolute right-2 top-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full",
              "bg-black/55 text-white shadow-sm backdrop-blur-[1px] transition-opacity",
              "opacity-100 [@media(hover:hover)_and_(pointer:fine)]:opacity-0",
              "[@media(hover:hover)_and_(pointer:fine)]:group-hover:opacity-100",
              "hover:bg-destructive focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            )}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              onDeleteRequest();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                e.preventDefault();
                onDeleteRequest();
              }
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </span>
        ) : null}

        {slideCount > 1 ? (
          <div
            className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/45 to-transparent px-2 pb-2 pt-6"
            role="tablist"
            aria-label="Preview slides"
            onClick={(e) => e.stopPropagation()}
          >
            {previewUrls.map((_, index) => (
              <button
                key={index}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                aria-label={`Slide ${index + 1} of ${slideCount}`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  setSlideIndex(index);
                }}
                onMouseEnter={(e) => {
                  e.stopPropagation();
                  setSlideIndex(index);
                }}
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full transition-colors",
                  index === activeIndex
                    ? "bg-white"
                    : "bg-white/40 hover:bg-white/65"
                )}
              />
            ))}
          </div>
        ) : null}
      </div>
      <div className="space-y-1 p-2.5">
        <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
          {templateName}
        </p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{niche}</p>
        <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
          <Calendar className="h-3 w-3 shrink-0" />
          {postDate
            ? `Scheduled ${formatRemakeDate(postDate)}`
            : formatRemakeDate(createdAt)}
        </p>
      </div>
    </button>
  );
}
