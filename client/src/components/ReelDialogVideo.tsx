import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Loader2, RefreshCw } from "lucide-react";
import { needsVideoUrlRefresh } from "@shared/mediaUrl";
import { trpc } from "@/lib/trpc";
import { formatVideoPreviewError } from "@/lib/videoPreviewError";
import { toast } from "sonner";

type ReelDialogVideoProps = {
  reelId?: number;
  shortcode?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  /**
   * Instagram (default) and TikTok refresh expired CDN URLs via platform APIs.
   * YouTube has no downloadable video file and is excluded.
   */
  platform?: "instagram" | "tiktok" | "youtube";
  className?: string;
};

/** Inline video for reel workflow dialogs with refresh on expired CDN URLs. */
export function ReelDialogVideo({
  reelId,
  shortcode,
  videoUrl,
  thumbnailUrl,
  platform,
  className,
}: ReelDialogVideoProps) {
  const [resolvedSrc, setResolvedSrc] = useState(() => (videoUrl ?? "").trim());
  const [videoFailed, setVideoFailed] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const igRefreshMutation = trpc.reels.refreshVideoUrl.useMutation();
  const ttRefreshMutation = trpc.tiktokScrape.refreshVideoUrl.useMutation();
  const code = (shortcode ?? "").trim();
  // Absent platform means Instagram (existing Dashboard call sites).
  const platformKind = platform ?? "instagram";
  const canRefresh = platformKind === "instagram" || platformKind === "tiktok";
  const refreshPending =
    platformKind === "tiktok"
      ? ttRefreshMutation.isPending
      : igRefreshMutation.isPending;
  // Depend on mutateAsync only (stable), not the whole mutation object.
  const igMutateAsync = igRefreshMutation.mutateAsync;
  const ttMutateAsync = ttRefreshMutation.mutateAsync;

  useEffect(() => {
    setResolvedSrc((videoUrl ?? "").trim());
    setVideoFailed(false);
  }, [videoUrl, reelId]);

  const fetchFreshUrl = useCallback(async (): Promise<string | null> => {
    const current = (videoUrl ?? "").trim();
    if (!canRefresh) return current || null;
    if (current && !needsVideoUrlRefresh(current)) return current;

    try {
      if (platformKind === "tiktok") {
        if (reelId == null) return current || null;
        const result = await ttMutateAsync({ videoId: reelId });
        return result.videoUrl.trim() || null;
      }
      if (!code) return current || null;
      const result = await igMutateAsync({
        shortcode: code,
        reelId,
      });
      return result.videoUrl.trim() || null;
    } catch (err) {
      const message = formatVideoPreviewError(err);
      toast.error("Video preview unavailable", { description: message });
      return null;
    }
  }, [
    videoUrl,
    code,
    reelId,
    canRefresh,
    platformKind,
    igMutateAsync,
    ttMutateAsync,
  ]);

  useEffect(() => {
    let cancelled = false;
    const initial = (videoUrl ?? "").trim();
    if (!canRefresh) return;
    if (platformKind === "tiktok") {
      if (reelId == null && !initial) return;
    } else if (!initial && !code) {
      return;
    }
    if (initial && !needsVideoUrlRefresh(initial)) return;

    setIsPreparing(true);
    void fetchFreshUrl()
      .then((next) => {
        if (cancelled) return;
        if (next) {
          setResolvedSrc(next);
          setVideoFailed(false);
        } else {
          setVideoFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setIsPreparing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [videoUrl, code, reelId, fetchFreshUrl, canRefresh, platformKind]);

  const thumb = (thumbnailUrl ?? "").trim();
  const showRetry =
    videoFailed &&
    canRefresh &&
    (platformKind === "tiktok" ? reelId != null : Boolean(code));

  if (isPreparing || refreshPending) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className ?? ""}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (resolvedSrc && !videoFailed) {
    return (
      <video
        ref={videoRef}
        key={reelId ?? code ?? resolvedSrc}
        src={resolvedSrc}
        poster={thumb || undefined}
        controls
        playsInline
        loop={false}
        preload="metadata"
        className={className}
        onError={() => setVideoFailed(true)}
        onEnded={() => {
          videoRef.current?.pause();
        }}
      />
    );
  }

  if (thumb) {
    return (
      <div className={`relative ${className ?? ""}`}>
        <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        {showRetry ? (
          <button
            type="button"
            className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/70 text-white"
            onClick={() => {
              setVideoFailed(false);
              setIsPreparing(true);
              void fetchFreshUrl()
                .then((next) => {
                  if (next) setResolvedSrc(next);
                  else setVideoFailed(true);
                })
                .finally(() => setIsPreparing(false));
            }}
          >
            <span className="text-[10px] font-medium">Preview unavailable</span>
            <span className="inline-flex items-center gap-1 text-[10px]">
              <RefreshCw className="h-3 w-3" />
              Retry
            </span>
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={`flex h-full w-full items-center justify-center ${className ?? ""}`}>
      <Film className="h-6 w-6 text-muted-foreground/50" />
    </div>
  );
}
