import { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePostHog } from "@posthog/react";
import { Loader2, Maximize2, Play, X } from "lucide-react";
import { toast } from "sonner";
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
  videoPageUrl,
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
  /** TikTok video page URL for refresh without tiktok_videos.id. */
  videoPageUrl?: string | null;
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
  /** Portrait lightbox instead of native landscape fullscreen (native FS breaks 9:16 reels). */
  const [enlarged, setEnlarged] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const enlargedVideoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const programmaticPauseRef = useRef(false);
  const mediaErrorRetryRef = useRef(false);
  const fallbackId = useId();
  const playerId = useMemo(() => {
    if (platform === "tiktok" && reelId != null) return `tiktok-${reelId}`;
    if (platform === "tiktok") {
      const page = (videoPageUrl ?? "").trim();
      if (page) return `tiktok-page-${page.slice(-48)}`;
    }
    if (reelId != null) return `reel-${reelId}`;
    const code = (shortcode ?? "").trim();
    if (code) return `shortcode-${code}`;
    return fallbackId;
  }, [platform, reelId, shortcode, videoPageUrl, fallbackId]);
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
    enlargedVideoRef.current?.pause();
  }, []);

  const setPlaying = useCallback(
    (next: boolean) => {
      if (!next) {
        pauseVideoElement(true);
        releaseGridVideoPlay(playerId);
        userPausedRef.current = false;
        setEnlarged(false);
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
      ? reelId != null || Boolean((videoPageUrl ?? "").trim())
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
    const v = enlarged ? enlargedVideoRef.current : videoRef.current;
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
  }, [capturePreviewEvent, setPlaying, enlarged]);

  const resolvePlayableUrl = useCallback(async (): Promise<string | null> => {
    const current = resolvedSrc || (videoUrl ?? "").trim();
    const code = (shortcode ?? "").trim();
    const pageUrl = (videoPageUrl ?? "").trim();
    if (platform === "tiktok") {
      if (reelId == null && !current && !pageUrl) return null;
    } else if (!code && !current) {
      return null;
    }
    if (current && !needsVideoUrlRefresh(current)) return current;

    try {
      if (platform === "tiktok") {
        const result = await ttMutateAsync(
          reelId != null
            ? { videoId: reelId }
            : { videoPageUrl: pageUrl || current }
        );
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
    videoPageUrl,
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
        toast.error("Preview failed. Tap to try again.");
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
      mediaErrorRetryRef.current = false;
    }
  }, [playing, pauseVideoElement]);

  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!autoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startPlayback();
  }, [autoStart, startPlayback]);

  const openEnlarged = useCallback(() => {
    const inline = videoRef.current;
    const t = inline?.currentTime ?? 0;
    const wasPaused = inline ? inline.paused : false;
    programmaticPauseRef.current = true;
    inline?.pause();
    setEnlarged(true);
    // Sync into lightbox after portal mounts
    window.setTimeout(() => {
      const enlargedEl = enlargedVideoRef.current;
      if (!enlargedEl) return;
      const seekAndMaybePlay = () => {
        try {
          enlargedEl.currentTime = t;
        } catch {
          // ignore seek errors before metadata
        }
        if (!wasPaused && !userPausedRef.current) {
          void enlargedEl.play().catch(() => undefined);
        }
      };
      if (enlargedEl.readyState >= 1) seekAndMaybePlay();
      else enlargedEl.addEventListener("loadedmetadata", seekAndMaybePlay, { once: true });
    }, 0);
  }, []);

  const closeEnlarged = useCallback(() => {
    const enlargedEl = enlargedVideoRef.current;
    const t = enlargedEl?.currentTime ?? 0;
    const wasPaused = enlargedEl ? enlargedEl.paused : true;
    setEnlarged(false);
    window.setTimeout(() => {
      const inline = videoRef.current;
      if (!inline) return;
      try {
        inline.currentTime = t;
      } catch {
        // ignore
      }
      if (!wasPaused && !userPausedRef.current) {
        void inline.play().catch(() => undefined);
      }
    }, 0);
  }, []);

  // Block native browser fullscreen (landscape letterboxing of vertical reels).
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing) return;

    const redirectNativeFullscreen = () => {
      const doc = document as Document & {
        webkitFullscreenElement?: Element | null;
      };
      const fsEl =
        document.fullscreenElement ?? doc.webkitFullscreenElement ?? null;
      if (fsEl === v) {
        const exit =
          document.exitFullscreen?.bind(document) ||
          (document as Document & { webkitExitFullscreen?: () => Promise<void> })
            .webkitExitFullscreen?.bind(document);
        void exit?.().catch(() => undefined);
        openEnlarged();
      }
    };

    const onWebkitBegin = (e: Event) => {
      e.preventDefault?.();
      openEnlarged();
    };

    v.addEventListener("fullscreenchange", redirectNativeFullscreen);
    document.addEventListener("fullscreenchange", redirectNativeFullscreen);
    v.addEventListener("webkitbeginfullscreen", onWebkitBegin as EventListener);
    return () => {
      v.removeEventListener("fullscreenchange", redirectNativeFullscreen);
      document.removeEventListener("fullscreenchange", redirectNativeFullscreen);
      v.removeEventListener(
        "webkitbeginfullscreen",
        onWebkitBegin as EventListener
      );
    };
  }, [playing, resolvedSrc, openEnlarged]);

  useEffect(() => {
    if (!enlarged) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeEnlarged();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [enlarged, closeEnlarged]);

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
    // One automatic remount / refresh helps with flaky CDN or transient network
    // errors. After that, show the tap-to-retry affordance.
    if (!mediaErrorRetryRef.current) {
      mediaErrorRetryRef.current = true;
      const previous = resolvedSrc;
      capturePreviewEvent("reel_preview_play_failed", {
        reason: "video_element_error_retrying",
      });
      stopPlayback();
      void (async () => {
        if (previous && needsVideoUrlRefresh(previous)) {
          setResolvedSrc("");
        }
        await startPlayback();
      })();
      return;
    }
    capturePreviewEvent("reel_preview_play_failed", { reason: "video_element_error" });
    setVideoFailed(true);
    stopPlayback();
    toast.error("Preview failed. Tap to try again.");
  };

  const handleVideoEnded = () => {
    stopPlayback();
  };

  const lightbox =
    enlarged && resolvedSrc && typeof document !== "undefined"
      ? createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 p-3 sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="Enlarged video preview"
            onClick={closeEnlarged}
          >
            <div
              className="relative flex h-full max-h-[100dvh] w-full max-w-[min(100vw,calc(100dvh*9/16))] items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <video
                ref={enlargedVideoRef}
                src={resolvedSrc}
                poster={thumb || undefined}
                controls
                playsInline
                controlsList="nofullscreen"
                disablePictureInPicture
                loop={false}
                preload="auto"
                className="max-h-[100dvh] max-w-full rounded-lg bg-black object-contain"
                onPause={handleVideoPause}
                onPlay={handleVideoPlay}
                onError={handleVideoError}
                onEnded={handleVideoEnded}
              />
              <button
                type="button"
                className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/90"
                aria-label="Close enlarged video"
                title="Close"
                onClick={closeEnlarged}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

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
            controlsList="nofullscreen"
            disablePictureInPicture
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
              "absolute z-30 flex items-center justify-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/90",
              isCompact ? "right-10 top-8 h-7 w-7" : "right-12 top-12 h-8 w-8"
            )}
            aria-label="Enlarge video"
            title="Enlarge"
            onClick={(e) => {
              e.stopPropagation();
              openEnlarged();
            }}
          >
            <Maximize2 className={isCompact ? "h-3.5 w-3.5" : "h-4 w-4"} />
          </button>
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
      {lightbox}
    </div>
  );
}
