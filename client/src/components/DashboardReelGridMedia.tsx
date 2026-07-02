import { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
import { Loader2, Play, RefreshCw, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { needsVideoUrlRefresh } from "@shared/mediaUrl";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  registerGridVideoPlayer,
  releaseGridVideoPlay,
  requestGridVideoPlay,
} from "@/lib/gridVideoPlaybackCoordinator";

type Size = "default" | "compact";

/** Grid/list tile: thumbnail + optional inline playback when `videoUrl` exists (R2 or Instagram CDN). */
export function DashboardReelGridMedia({
  thumbnailUrl,
  videoUrl,
  shortcode,
  reelId,
  className,
  size = "default",
  playing: playingControlled,
  onPlayingChange,
  onVideoUrlResolved,
  fallbackLabel,
}: {
  thumbnailUrl: string | null | undefined;
  videoUrl: string | null | undefined;
  /** Required to refresh expired Instagram CDN URLs on play. */
  shortcode?: string | null;
  reelId?: number;
  className?: string;
  size?: Size;
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** Called when a refreshed stable URL is fetched (parent can update cache). */
  onVideoUrlResolved?: (url: string) => void;
  fallbackLabel?: string;
}) {
  const [playingLocal, setPlayingLocal] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState(() => (videoUrl ?? "").trim());
  const [videoFailed, setVideoFailed] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const programmaticPauseRef = useRef(false);
  const fallbackId = useId();
  const playerId = useMemo(() => {
    if (reelId != null) return `reel-${reelId}`;
    const code = (shortcode ?? "").trim();
    if (code) return `shortcode-${code}`;
    return fallbackId;
  }, [reelId, shortcode, fallbackId]);
  const refreshMutation = trpc.reels.refreshVideoUrl.useMutation();
  const isCompact = size === "compact";
  const isControlled = playingControlled !== undefined;
  const playing = isControlled ? playingControlled : playingLocal;

  const pauseVideoElement = useCallback((programmatic: boolean) => {
    programmaticPauseRef.current = programmatic;
    videoRef.current?.pause();
  }, []);

  const setPlaying = useCallback(
    (next: boolean) => {
      if (!next) {
        pauseVideoElement(true);
        releaseGridVideoPlay(playerId);
        userPausedRef.current = false;
      } else {
        userPausedRef.current = false;
      }
      if (isControlled) {
        onPlayingChange?.(next);
      } else {
        setPlayingLocal(next);
      }
    },
    [isControlled, onPlayingChange, playerId, pauseVideoElement]
  );
  const setPlayingRef = useRef(setPlaying);
  setPlayingRef.current = setPlaying;

  useEffect(() => {
    return registerGridVideoPlayer(playerId, {
      pause: () => {
        pauseVideoElement(true);
        setPlayingRef.current(false);
      },
    });
  }, [playerId, pauseVideoElement]);

  const stopPlayback = useCallback(() => {
    setPlaying(false);
  }, [setPlaying]);

  const thumb = (thumbnailUrl ?? "").trim();
  const showThumb = thumb.length > 0 && !thumbFailed;
  const hasResolvableVideo =
    resolvedSrc.length > 0 || Boolean(shortcode?.trim()) || Boolean((videoUrl ?? "").trim());

  // Do not overwrite the active preview URL while the inline player is open.
  useEffect(() => {
    if (playing) return;
    setResolvedSrc((videoUrl ?? "").trim());
    setVideoFailed(false);
  }, [videoUrl, playing]);

  useEffect(() => {
    setThumbFailed(false);
  }, [thumb]);

  const tryPlay = useCallback(() => {
    if (userPausedRef.current) return;
    const v = videoRef.current;
    if (!v || v.paused === false) return;
    const p = v.play();
    void p.catch(() => {
      setVideoFailed(true);
      setPlaying(false);
    });
  }, [setPlaying]);

  const resolvePlayableUrl = useCallback(async (): Promise<string | null> => {
    const current = resolvedSrc || (videoUrl ?? "").trim();
    const code = (shortcode ?? "").trim();
    if (!code && !current) return null;
    if (current && !needsVideoUrlRefresh(current)) return current;
    if (!code) return current || null;

    try {
      const result = await refreshMutation.mutateAsync({
        shortcode: code,
        reelId,
      });
      const next = result.videoUrl.trim();
      if (!next) return null;
      setResolvedSrc(next);
      onVideoUrlResolved?.(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview unavailable";
      toast.error("Video preview unavailable", { description: message });
      return null;
    }
  }, [resolvedSrc, videoUrl, shortcode, reelId, refreshMutation, onVideoUrlResolved]);

  const startPlayback = useCallback(async () => {
    if (isPreparing) return;
    setVideoFailed(false);
    userPausedRef.current = false;
    setIsPreparing(true);
    try {
      const src = await resolvePlayableUrl();
      if (!src) {
        setVideoFailed(true);
        setPlaying(false);
        return;
      }
      requestGridVideoPlay(playerId);
      setResolvedSrc(src);
      setPlaying(true);
    } finally {
      setIsPreparing(false);
    }
  }, [isPreparing, resolvePlayableUrl, setPlaying, playerId]);

  useEffect(() => {
    if (!playing) {
      pauseVideoElement(true);
    }
  }, [playing, pauseVideoElement]);

  const handleVideoLoadedData = () => {
    tryPlay();
  };

  const handleVideoPause = () => {
    if (programmaticPauseRef.current) {
      programmaticPauseRef.current = false;
      return;
    }
    userPausedRef.current = true;
  };

  const handleVideoPlay = () => {
    userPausedRef.current = false;
  };

  const handleVideoError = () => {
    setVideoFailed(true);
    stopPlayback();
  };

  const handleVideoEnded = () => {
    stopPlayback();
  };

  const handleRetry = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setVideoFailed(false);
    await startPlayback();
  };

  return (
    <div className={cn(className)}>
      {playing && resolvedSrc && !videoFailed ? (
        <div className="relative h-full w-full bg-black" onClick={(e) => e.stopPropagation()}>
          <video
            ref={videoRef}
            key={playerId}
            src={resolvedSrc}
            poster={thumb || undefined}
            controls
            playsInline
            loop={false}
            preload="metadata"
            className="h-full w-full object-cover"
            onLoadedData={handleVideoLoadedData}
            onPause={handleVideoPause}
            onPlay={handleVideoPlay}
            onError={handleVideoError}
            onEnded={handleVideoEnded}
          />
          <button
            type="button"
            className={cn(
              "absolute right-2 z-30 flex items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/90",
              isCompact ? "top-8 h-7 w-7" : "top-12 h-8 w-8"
            )}
            aria-label="Close video"
            title="Close video"
            onClick={stopPlayback}
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
          {videoFailed ? (
            <div
              className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/75 px-3 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-xs font-medium text-white">Preview unavailable</p>
              {shortcode?.trim() ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white hover:bg-white/25"
                  onClick={handleRetry}
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
          {hasResolvableVideo ? (
            <button
              type="button"
              className={cn(
                "absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/60 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/80 disabled:opacity-70",
                isCompact ? "h-9 w-9" : "h-12 w-12"
              )}
              aria-label="Play video"
              title="Play video"
              disabled={isPreparing || refreshMutation.isPending}
              onClick={(e) => {
                e.stopPropagation();
                void startPlayback();
              }}
            >
              {isPreparing || refreshMutation.isPending ? (
                <Loader2 className={cn("animate-spin", isCompact ? "h-4 w-4" : "h-5 w-5")} />
              ) : (
                <Play
                  className={cn(
                    "translate-x-0.5 fill-current",
                    isCompact ? "h-4 w-4" : "h-5 w-5"
                  )}
                />
              )}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
