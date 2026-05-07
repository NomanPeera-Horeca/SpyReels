import { useState, useEffect, useRef } from "react";
import { Film, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "default" | "compact";

/** Grid/list tile: thumbnail + optional inline playback when `videoUrl` exists (R2 or Instagram CDN). */
export function DashboardReelGridMedia({
  thumbnailUrl,
  videoUrl,
  className,
  size = "default",
}: {
  thumbnailUrl: string | null | undefined;
  videoUrl: string | null | undefined;
  className?: string;
  /** Smaller play/close controls for narrow list rows. */
  size?: Size;
}) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isCompact = size === "compact";

  const src = (videoUrl ?? "").trim();
  const hasVideo = src.length > 0;
  const thumb = (thumbnailUrl ?? "").trim();

  useEffect(() => {
    if (!playing) return;
    const v = videoRef.current;
    if (!v) return;
    const p = v.play();
    void p.catch(() => {});
  }, [playing]);

  return (
    <div className={cn(className)}>
      {playing && hasVideo ? (
        <div className="relative h-full w-full bg-black" onClick={(e) => e.stopPropagation()}>
          <video
            ref={videoRef}
            src={src}
            poster={thumb || undefined}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            className={cn(
              "absolute right-2 z-30 flex items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/90",
              isCompact ? "top-8 h-7 w-7" : "top-12 h-8 w-8"
            )}
            aria-label="Close video"
            title="Close video"
            onClick={() => setPlaying(false)}
          >
            <X className={isCompact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </button>
        </div>
      ) : (
        <>
          {thumb ? (
            <img
              src={thumb}
              alt=""
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted/40">
              <Film className={cn("text-muted-foreground/60", isCompact ? "h-4 w-4" : "h-5 w-5")} />
            </div>
          )}
          {hasVideo ? (
            <button
              type="button"
              className={cn(
                "absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/60 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/80",
                isCompact ? "h-9 w-9" : "h-12 w-12"
              )}
              aria-label="Play video"
              title="Play video"
              onClick={(e) => {
                e.stopPropagation();
                setPlaying(true);
              }}
            >
              <Play
                className={cn(
                  "translate-x-0.5 fill-current",
                  isCompact ? "h-4 w-4" : "h-5 w-5"
                )}
              />
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
