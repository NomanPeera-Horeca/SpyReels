import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { ReelPreviewLightbox } from "@/components/ReelPreviewLightbox";
import { YouTubeInlineEmbed } from "@/components/YouTubeInlineEmbed";
import { resolveViralPostPlayback } from "@/lib/viralPostPlayback";
import type { ViralPost } from "@shared/viralPosts";

/**
 * Opens the existing SpyReels preview for a ViralPost.
 * Instagram and TikTok use DashboardReelGridMedia. YouTube uses YouTubeInlineEmbed.
 * Restricted or unidentified videos keep an honest external link instead of a broken player.
 */
export function ViralPostPlayer({
  post,
  onClose,
}: {
  post: ViralPost;
  onClose: () => void;
}) {
  const playback = resolveViralPostPlayback(post);

  if (playback.kind === "file") {
    return (
      <DashboardReelGridMedia
        surface="lightbox"
        thumbnailUrl={playback.thumbnailUrl}
        videoUrl={playback.videoUrl}
        shortcode={playback.shortcode}
        reelId={playback.reelId}
        platform={playback.platform}
        videoPageUrl={playback.videoPageUrl}
        externalWatch={playback.external}
        onDismiss={onClose}
      />
    );
  }

  if (playback.kind === "youtube") {
    return (
      <ReelPreviewLightbox onClose={onClose} label="YouTube Short preview">
        <YouTubeInlineEmbed
          className="aspect-[9/16] h-auto max-h-[100dvh] w-full"
          videoId={playback.videoId}
        />
        {playback.external ? (
          <a
            href={playback.external.href}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur hover:bg-black/90"
          >
            {playback.external.label}
          </a>
        ) : null}
      </ReelPreviewLightbox>
    );
  }

  return (
    <ReelPreviewLightbox onClose={onClose} label="Video unavailable">
      <div className="flex max-w-xs flex-col items-center gap-3 px-4 text-center text-white">
        <p className="text-sm font-medium">This video can't be played in SpyReels.</p>
        {playback.external ? (
          <a
            href={playback.external.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-semibold text-white underline"
          >
            {playback.external.label}
          </a>
        ) : (
          <p className="text-xs text-white/70">No original link is available for this video.</p>
        )}
      </div>
    </ReelPreviewLightbox>
  );
}
