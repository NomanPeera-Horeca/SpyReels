import { useState, useEffect, useRef } from "react";
import { Play, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Size = "default" | "compact";

/** Grid/list tile: thumbnail + optional inline playback when `videoUrl` exists (R2 or Instagram CDN). */
export function DashboardReelGridMedia({
  thumbnailUrl,
  videoUrl,
  className,
  size = "default",
  playing: playingControlled,
  onPlayingChange,
  fallbackLabel,
}: {
  thumbnailUrl: string | null | undefined;
  videoUrl: string | null | undefined;
  className?: string;
  /** Smaller play/close controls for narrow list rows. */
  size?: Size;
  /** When set, parent controls play state (for one-at-a-time grids). */
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** Shown on placeholder when thumbnail is missing or failed to load. */
  fallbackLabel?: string;
}) {
  const [playingLocal, setPlayingLocal] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isCompact = size === "compact";
  const isControlled = playingControlled !== undefined;
  const playing = isControlled ? playingControlled : playingLocal;

  const setPlaying = (next: boolean) => {
    if (isControlled) {
      onPlayingChange?.(next);
    } else {
      setPlayingLocal(next);
    }
  };

  const src = (videoUrl ?? "").trim();
  const hasVideo = src.length > 0;
  const thumb = (thumbnailUrl ?? "").trim();
  const showThumb = thumb.length > 0 && !thumbFailed;

  useEffect(() => {
    setThumbFailed(false);
  }, [thumb]);

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
            autoPlay
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
          {showThumb ? (
            <img
              src={thumb}
              alt=""
              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              loading="lazy"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900 text-zinc-400">
              <Play
                className={cn(
                  "fill-current text-zinc-500",
                  isCompact ? "h-6 w-6" : "h-8 w-8"
                )}
              />
              {fallbackLabel ? (
                <span className="max-w-[90%] truncate px-2 text-xs font-medium text-zinc-400">
                  {fallbackLabel}
                </span>
              ) : null}
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
