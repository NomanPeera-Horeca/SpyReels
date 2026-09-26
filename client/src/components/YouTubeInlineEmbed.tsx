import { useEffect, useId, useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  registerGridVideoPlayer,
  releaseGridVideoPlay,
  requestGridVideoPlay,
} from "@/lib/gridVideoPlaybackCoordinator";
import { youtubeEmbedSrc } from "@/lib/youtubeVideoId";

/**
 * In-app YouTube Shorts playback. We do not mirror YouTube as MP4, so the
 * embed keeps the creator inside SpyReels instead of bouncing to youtube.com.
 */
export function YouTubeInlineEmbed({
  videoId,
  className,
  onStop,
}: {
  videoId: string;
  className?: string;
  onStop?: () => void;
}) {
  const fallbackId = useId();
  const playerId = useMemo(
    () => `youtube-${videoId || fallbackId}`,
    [videoId, fallbackId]
  );

  useEffect(() => {
    requestGridVideoPlay(playerId);
    return registerGridVideoPlayer(playerId, {
      pause: () => {
        onStop?.();
      },
    });
  }, [playerId, onStop]);

  useEffect(() => {
    return () => {
      releaseGridVideoPlay(playerId);
    };
  }, [playerId]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden bg-black", className)}>
      <iframe
        title="YouTube Short preview"
        src={youtubeEmbedSrc(videoId, true)}
        className="absolute inset-0 h-full w-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
      {onStop ? (
        <button
          type="button"
          className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/70 text-white backdrop-blur hover:bg-black/90"
          aria-label="Close preview"
          title="Close"
          onClick={(e) => {
            e.stopPropagation();
            onStop();
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
