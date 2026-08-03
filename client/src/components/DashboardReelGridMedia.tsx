import { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
import { usePostHog } from "@posthog/react";
import { Loader2, Play, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { needsVideoUrlRefresh } from "@shared/mediaUrl";
import { trpc } from "@/lib/trpc";
import { formatVideoPreviewError } from "@/lib/videoPreviewError";
import {
  registerGridVideoPlayer,
  releaseGridVideoPlay,
  requestGridVideoPlay,
} from "@/lib/gridVideoPlaybackCoordinator";

type Size = "default" | "compact";

/** Grid/list tile: thumbnail + optional inline playback when `videoUrl` exists (R2 or platform CDN). */
export function DashboardReelGridMedia({
  thumbnailUrl,
  videoUrl,
  shortcode,
  reelId,
  platform = "instagram",
  className,
  size = "default",
  playing: playingControlled,
  onPlayingChange,
  onVideoUrlResolved,
  fallbackLabel,
  autoStart = false,
}: {
  thumbnailUrl: string | null | undefined;
  videoUrl: string | null | undefined;
  /** Required to refresh expired Instagram CDN URLs on play. */
  shortcode?: string | null;
  reelId?: number;
  /** Instagram (default) or TikTok. YouTube has no downloadable MP4. */
  platform?: "instagram" | "tiktok";
  className?: string;
  size?: Size;
  playing?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  /** Called when a refreshed stable URL is fetched (parent can update cache). */
  onVideoUrlResolved?: (url: string) => void;
  fallbackLabel?: string;
  /** Start playback once on mount (used when only the active tile mounts a player). */
  autoStart?: boolean;
}) {
  const posthog = usePostHog();
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
    if (platform === "tiktok" && reelId != null) return `tiktok-${reelId}`;
    if (reelId != null) return `reel-${reelId}`;
    const code = (shortcode ?? "").trim();
    if (code) return `shortcode-${code}`;
    return fallbackId;
  }, [platform, reelId, shortcode, fallbackId]);
  const igRefreshMutation = trpc.reels.refreshVideoUrl.useMutation();
  const ttRefreshMutation = trpc.tiktokScrape.refreshVideoUrl.useMutation();
  const igMutateAsync = igRefreshMutation.mutateAsync;
  const ttMutateAsync = ttRefreshMutation.mutateAsync;
  const refreshPending =
    platform === "tiktok"
      ? ttRefreshMutation.isPending
      : igRefreshMutation.isPending;
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
    resolvedSrc.length > 0 ||
    Boolean((videoUrl ?? "").trim()) ||
    (platform === "tiktok"
      ? reelId != null
      : Boolean(shortcode?.trim()));

  // Do not overwrite the active preview URL while the inline player is open.
  useEffect(() => {
    if (playing) return;
    setResolvedSrc((videoUrl ?? "").trim());
    setVideoFailed(false);
  }, [videoUrl, playing]);

  useEffect(() => {
    setThumbFailed(false);
  }, [thumb]);

  const capturePreviewEvent = useCallback(
    (
      event: "reel_preview_play_started" | "reel_preview_play_success" | "reel_preview_play_failed",
      extra?: Record<string, string | number | boolean | null | undefined>
    ) => {
      posthog?.capture(event, {
        reel_id: reelId ?? null,
        shortcode: shortcode?.trim() || null,
        size,
        ...extra,
      });
    },
    [posthog, reelId, shortcode, size]
  );

  const tryPlay = useCallback(() => {
    if (userPausedRef.current) return;
    const v = videoRef.current;
    if (!v || v.paused === false) return;
    const p = v.play();
    void p
      .then(() => {
        capturePreviewEvent("reel_preview_play_success");
      })
      .catch(() => {
        capturePreviewEvent("reel_preview_play_failed", { reason: "play_promise_rejected" });
        setVideoFailed(true);
        setPlaying(false);
      });
  }, [capturePreviewEvent, setPlaying]);

  const resolvePlayableUrl = useCallback(async (): Promise<string | null> => {
    const current = resolvedSrc || (videoUrl ?? "").trim();
    const code = (shortcode ?? "").trim();
    if (platform === "tiktok") {
      if (reelId == null && !current) return null;
    } else if (!code && !current) {
      return null;
    }
    if (current && !needsVideoUrlRefresh(current)) return current;

    try {
      if (platform === "tiktok") {
        if (reelId == null) return current || null;
        const result = await ttMutateAsync({ videoId: reelId });
        const next = result.videoUrl.trim();
        if (!next) return null;
        setResolvedSrc(next);
        onVideoUrlResolved?.(next);
        return next;
      }
      if (!code) return current || null;
      const result = await igMutateAsync({
        shortcode: code,
        reelId,
      });
      const next = result.videoUrl.trim();
      if (!next) return null;
      setResolvedSrc(next);
      onVideoUrlResolved?.(next);
      return next;
    } catch (err) {
      const message = formatVideoPreviewError(err);
      capturePreviewEvent("reel_preview_play_failed", {
        reason: "refresh_failed",
        message: message.slice(0, 200),
      });
      return null;
    }
  }, [
    resolvedSrc,
    videoUrl,
    shortcode,
    reelId,
    platform,
    igMutateAsync,
    ttMutateAsync,
    onVideoUrlResolved,
    capturePreviewEvent,
  ]);

  const startPlayback = useCallback(async () => {
    if (isPreparing) return;
    setVideoFailed(false);
    userPausedRef.current = false;
    setIsPreparing(true);
    capturePreviewEvent("reel_preview_play_started");
    try {
      const src = await resolvePlayableUrl();
      if (!src) {
        capturePreviewEvent("reel_preview_play_failed", { reason: "no_playable_url" });
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
  }, [isPreparing, resolvePlayableUrl, setPlaying, playerId, capturePreviewEvent]);

  useEffect(() => {
    if (!playing) {
      pauseVideoElement(true);
    }
  }, [playing, pauseVideoElement]);

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startPlayback();
  }, [autoStart, startPlayback]);

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
    capturePreviewEvent("reel_preview_play_failed", { reason: "video_element_error" });
    setVideoFailed(true);
    stopPlayback();
  };

  const handleVideoEnded = () => {
    stopPlayback();
  };

  return (
    <div className={cn("relative h-full w-full", className)}>
      {playing && resolvedSrc && !videoFailed ? (
        <div className="absolute inset-0 bg-black" onClick={(e) => e.stopPropagation()}>
          <video
            ref={videoRef}
            key={playerId}
            src={resolvedSrc}
            poster={thumb || undefined}
            controls
            playsInline
            loop={false}
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
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
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              loading="lazy"
              onError={() => setThumbFailed(true)}
            />
          ) : (
            <div className="absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-2 bg-zinc-900 text-zinc-400">
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
          {hasResolvableVideo ? (
            <button
              type="button"
              className={cn(
                "absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-black/60 text-white shadow-lg backdrop-blur transition-colors hover:bg-black/80 disabled:opacity-70",
                isCompact ? "h-9 w-9" : "h-12 w-12",
                videoFailed && "ring-2 ring-amber-400/80"
              )}
              aria-label={videoFailed ? "Play video again" : "Play video"}
              title={videoFailed ? "Preview failed. Tap to try again." : "Play video"}
              disabled={isPreparing || refreshPending}
              onClick={(e) => {
                e.stopPropagation();
                void startPlayback();
              }}
            >
              {isPreparing || refreshPending ? (
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
