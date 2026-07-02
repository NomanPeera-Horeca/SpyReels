import { useCallback, useEffect, useRef, useState } from "react";
import { Film, Loader2, RefreshCw } from "lucide-react";
import { needsVideoUrlRefresh } from "@shared/mediaUrl";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type ReelDialogVideoProps = {
  reelId?: number;
  shortcode?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
  className?: string;
};

/** Inline video for reel workflow dialogs with refresh on expired CDN URLs. */
export function ReelDialogVideo({
  reelId,
  shortcode,
  videoUrl,
  thumbnailUrl,
  className,
}: ReelDialogVideoProps) {
  const [resolvedSrc, setResolvedSrc] = useState(() => (videoUrl ?? "").trim());
  const [videoFailed, setVideoFailed] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const refreshMutation = trpc.reels.refreshVideoUrl.useMutation();
  const code = (shortcode ?? "").trim();

  useEffect(() => {
    setResolvedSrc((videoUrl ?? "").trim());
    setVideoFailed(false);
  }, [videoUrl, reelId]);

  const fetchFreshUrl = useCallback(async (): Promise<string | null> => {
    const current = (videoUrl ?? "").trim();
    if (current && !needsVideoUrlRefresh(current)) return current;
    if (!code) return current || null;
    try {
      const result = await refreshMutation.mutateAsync({
        shortcode: code,
        reelId,
      });
      return result.videoUrl.trim() || null;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Preview unavailable";
      toast.error("Video preview unavailable", { description: message });
      return null;
    }
  }, [videoUrl, code, reelId, refreshMutation]);

  useEffect(() => {
    let cancelled = false;
    const initial = (videoUrl ?? "").trim();
    if (!initial && !code) return;
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
  }, [videoUrl, code, reelId, fetchFreshUrl]);

  const thumb = (thumbnailUrl ?? "").trim();

  if (isPreparing || refreshMutation.isPending) {
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
        {videoFailed && code ? (
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
