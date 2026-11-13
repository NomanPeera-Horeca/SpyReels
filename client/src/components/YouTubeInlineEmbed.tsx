import { useEffect, useId, useMemo } from "react";
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
 * No close (X) button: YouTube's own player pauses on click (owner decision,
 * same as the file player). `onStop` still runs when another card starts.
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
    </div>
  );
}
