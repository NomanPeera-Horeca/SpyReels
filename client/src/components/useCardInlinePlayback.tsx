/**
 * Play a viral video inside its Result Card (shared by Home and Viral Posts).
 * Files play in the in-card player and YouTube in its embed; a video that
 * cannot play inside the card calls `onUnavailable` (the honest fallback).
 */
import { useState, type ReactNode } from "react";
import type { ViralPost } from "@shared/viralPosts";
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { YouTubeInlineEmbed } from "@/components/YouTubeInlineEmbed";
import { resolveViralPostPlayback } from "@/lib/viralPostPlayback";

export function useCardInlinePlayback(
  post: ViralPost,
  onUnavailable: () => void
): { inlineMedia: ReactNode; play: () => void } {
  const [playing, setPlaying] = useState(false);
  const playback = resolveViralPostPlayback(post);
  const stop = () => setPlaying(false);
  const inlineMedia = !playing ? null : playback.kind === "file" ? (
    <DashboardReelGridMedia
      className="h-full w-full"
      thumbnailUrl={playback.thumbnailUrl}
      videoUrl={playback.videoUrl}
      shortcode={playback.shortcode}
      reelId={playback.reelId}
      platform={playback.platform}
      videoPageUrl={playback.videoPageUrl}
      externalWatch={playback.external}
      size="compact"
      autoStart
      onPlayingChange={isPlaying => {
        if (!isPlaying) stop();
      }}
    />
  ) : playback.kind === "youtube" ? (
    <YouTubeInlineEmbed className="h-full w-full" videoId={playback.videoId} onStop={stop} />
  ) : null;
  const play = () => {
    if (playback.kind === "unavailable") onUnavailable();
    else setPlaying(true);
  };
  return { inlineMedia, play };
}
