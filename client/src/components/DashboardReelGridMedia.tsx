import { useState, useEffect, useRef, useCallback, useId, useMemo } from "react";
import { usePostHog } from "@posthog/react";
import { Loader2, Maximize2, Play, X } from "lucide-react";
import { toast } from "sonner";
import { ReelPreviewLightbox } from "@/components/ReelPreviewLightbox";
import { cn } from "@/lib/utils";
import { needsVideoUrlRefresh } from "@shared/mediaUrl";
import { trpc } from "@/lib/trpc";
import { formatVideoPreviewError } from "@/lib/videoPreviewError";
import { lightboxMediaPhase } from "@/lib/lightboxA11y";
import {
  PlaybackSession,
  playbackResultIsCurrent,
} from "@/lib/playbackSession";
import { resolveGridPlayableUrl } from "@/lib/resolveGridPlayableUrl";
import {
  registerGridVideoPlayer,
  releaseGridVideoPlay,
  requestGridVideoPlay,
} from "@/lib/gridVideoPlaybackCoordinator";

type Size = "default" | "compact";

function safeExternalWatch(
  link: { href: string; label: string } | null | undefined
): { href: string; label: string } | null {
  const href = (link?.href ?? "").trim();
  const label = (link?.label ?? "").trim();
  if (!href || !label) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return { href: url.toString(), label };
  } catch {
    return null;
  }
}

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
  surface = "tile",
  externalWatch = null,
  onDismiss,
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
  /**
   * tile: thumbnail with inline playback (existing grids).
   * lightbox: open the existing enlarged preview immediately.
   */
  surface?: "tile" | "lightbox";
  /** Shown when in-app playback cannot start. http(s) only. */
  externalWatch?: { href: string; label: string } | null;
  /** Lightbox surface closed by the user. */
  onDismiss?: () => void;
}) {
  const lightboxOnly = surface === "lightbox";
  const posthog = usePostHog();
  const [playingLocal, setPlayingLocal] = useState(false);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState(() => (videoUrl ?? "").trim());
  const [videoFailed, setVideoFailed] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  /** False until the first lightbox attempt finishes, so the overlay never sits empty. */
  const [playbackSettled, setPlaybackSettled] = useState(!lightboxOnly);
  /** Portrait lightbox instead of native landscape fullscreen (native FS breaks 9:16 reels). */
  const [enlarged, setEnlarged] = useState(lightboxOnly);
  const videoRef = useRef<HTMLVideoElement>(null);
  const enlargedVideoRef = useRef<HTMLVideoElement>(null);
  const userPausedRef = useRef(false);
  const programmaticPauseRef = useRef(false);
  const mediaErrorRetryRef = useRef(false);
  const sessionRef = useRef<PlaybackSession | null>(null);
  if (sessionRef.current == null) sessionRef.current = new PlaybackSession();
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
  const utils = trpc.useUtils();
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
        sessionRef.current?.cancel();
        setIsPreparing(false);
        pauseVideoElement(true);
        releaseGridVideoPlay(playerId);
        userPausedRef.current = false;
        if (!lightboxOnly) setEnlarged(false);
      } else {
        userPausedRef.current = false;
      }
      if (isControlled) {
        onPlayingChange?.(next);
      } else {
        setPlayingLocal(next);
      }
    },
    [isControlled, lightboxOnly, onPlayingChange, playerId, pauseVideoElement]
  );
  const setPlayingRef = useRef(setPlaying);
  setPlayingRef.current = setPlaying;

  useEffect(() => {
    const session = sessionRef.current;
    return () => session?.cancel();
  }, []);

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
  // Lightbox keeps its own resolved URL and failure state until it unmounts.
  useEffect(() => {
    if (playing || lightboxOnly) return;
    setResolvedSrc((videoUrl ?? "").trim());
    setVideoFailed(false);
  }, [videoUrl, playing, lightboxOnly]);

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
        if (lightboxOnly) return;
        setVideoFailed(true);
        setPlaying(false);
      });
  }, [capturePreviewEvent, lightboxOnly, setPlaying, enlarged]);

  const reportRefreshFailure = useCallback(
    (err: unknown) => {
      const message = formatVideoPreviewError(err);
      capturePreviewEvent("reel_preview_play_failed", {
        reason: "refresh_failed",
        message: message.slice(0, 200),
      });
    },
    [capturePreviewEvent]
  );

  const startPlayback = useCallback(async (source: "user" | "retry" = "user") => {
    const session = sessionRef.current;
    if (!session) return;
    if (source === "user") mediaErrorRetryRef.current = false;
    setVideoFailed(false);
    userPausedRef.current = false;
    setIsPreparing(true);
    capturePreviewEvent("reel_preview_play_started");
    const outcome = await session.run((signal) =>
      resolveGridPlayableUrl({
        platform,
        videoUrl: resolvedSrc || videoUrl,
        shortcode,
        reelId,
        videoPageUrl,
        signal,
        refreshInstagram: async (body, refreshSignal) => {
          try {
            return await utils.client.reels.refreshVideoUrl.mutate(body, {
              signal: refreshSignal,
            });
          } catch (err) {
            if (!refreshSignal.aborted) reportRefreshFailure(err);
            throw err;
          }
        },
        refreshTikTok: async (body, refreshSignal) => {
          try {
            return await utils.client.tiktokScrape.refreshVideoUrl.mutate(body, {
              signal: refreshSignal,
            });
          } catch (err) {
            if (!refreshSignal.aborted) reportRefreshFailure(err);
            throw err;
          }
        },
      })
    );
    if (outcome.status === "stale" || !playbackResultIsCurrent(session.generation, outcome)) return;
    if (outcome.status === "failed") {
      capturePreviewEvent("reel_preview_play_failed", {
        reason: outcome.reason === "timeout" ? "refresh_timeout" : "no_playable_url",
      });
      setVideoFailed(true);
      setPlaybackSettled(true);
      setPlaying(false);
      if (!lightboxOnly) toast.error("Preview failed. Tap to try again.");
      return;
    }
    const src = outcome.value.url;
    requestGridVideoPlay(playerId);
    setResolvedSrc(src);
    if (outcome.value.refreshed) onVideoUrlResolved?.(src);
    setPlaying(true);
    setIsPreparing(false);
    setPlaybackSettled(true);
  }, [
    capturePreviewEvent,
    lightboxOnly,
    onVideoUrlResolved,
    platform,
    playerId,
    reelId,
    reportRefreshFailure,
    resolvedSrc,
    setPlaying,
    shortcode,
    utils,
    videoPageUrl,
    videoUrl,
  ]);

  useEffect(() => {
    if (!playing) pauseVideoElement(true);
  }, [playing, pauseVideoElement]);

  const shouldAutoStart = autoStart || lightboxOnly;
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (!shouldAutoStart || autoStartedRef.current) return;
    autoStartedRef.current = true;
    void startPlayback();
  }, [shouldAutoStart, startPlayback]);

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

  const dismissLightbox = useCallback(() => {
    sessionRef.current?.cancel();
    setIsPreparing(false);
    pauseVideoElement(true);
    releaseGridVideoPlay(playerId);
    onDismiss?.();
  }, [onDismiss, pauseVideoElement, playerId]);

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
        await startPlayback("retry");
      })();
      return;
    }
    capturePreviewEvent("reel_preview_play_failed", { reason: "video_element_error" });
    setVideoFailed(true);
    stopPlayback();
    if (!lightboxOnly) toast.error("Preview failed. Tap to try again.");
  };

  const handleVideoEnded = () => {
    stopPlayback();
  };

  const watchLink = safeExternalWatch(externalWatch);
  // Failure wins over a refresh that is still pending, so the overlay cannot spin forever.
  const lightboxPhase = lightboxMediaPhase({
    videoFailed,
    isPreparing,
    playbackSettled,
    hasPlayableSrc: Boolean(resolvedSrc),
  });
  const showLightbox = lightboxOnly || (enlarged && Boolean(resolvedSrc));
  const lightbox =
    showLightbox && typeof document !== "undefined" ? (
      <ReelPreviewLightbox
        onClose={lightboxOnly ? dismissLightbox : closeEnlarged}
        label={lightboxOnly ? "Video preview" : "Enlarged video preview"}
      >
        {lightboxOnly && lightboxPhase !== "video" ? (
          lightboxPhase === "loading" ? (
            <Loader2 className="h-8 w-8 animate-spin text-white" aria-label="Loading video" />
          ) : (
            <div className="flex max-w-xs flex-col items-center gap-3 px-4 text-center text-white">
              {thumb ? (
                <img src={thumb} alt="" className="max-h-48 w-full rounded-lg object-cover" />
              ) : null}
              <p className="text-sm font-medium" role="status">
                This video can't be played in SpyReels.
              </p>
              {hasResolvableVideo ? (
                <button
                  type="button"
                  className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-black"
                  onClick={() => void startPlayback()}
                >
                  Try again
                </button>
              ) : null}
              {watchLink ? (
                <a
                  href={watchLink.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-white underline"
                >
                  {watchLink.label}
                </a>
              ) : null}
            </div>
          )
        ) : (
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
            onLoadedData={lightboxOnly ? handleVideoLoadedData : undefined}
            onPause={handleVideoPause}
            onPlay={handleVideoPlay}
            onError={handleVideoError}
            onEnded={handleVideoEnded}
          />
        )}
      </ReelPreviewLightbox>
      ) : null;

  if (lightboxOnly) return lightbox;

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
              disabled={isPreparing}
              onClick={(e) => {
                e.stopPropagation();
                void startPlayback();
              }}
            >
              {isPreparing ? (
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
