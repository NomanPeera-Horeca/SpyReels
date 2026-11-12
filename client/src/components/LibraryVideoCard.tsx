/**
 * A video from the creator's library (Creator Radar research, Saved Reels,
 * Collected Reels) on the shared Figma Result Card (288:666), the same card as
 * Home and Viral Posts: creator link, Share, ··· menu, in-card play.
 *
 * Pages keep their own data and remake logic; this only maps it onto the card.
 */
import type { ReactNode } from "react";
import { DashboardReelGridMedia } from "@/components/DashboardReelGridMedia";
import { YouTubeInlineEmbed } from "@/components/YouTubeInlineEmbed";
import type { OneClickRemakeAction } from "@/components/ReelActionButtons";
import { useTheme } from "@/contexts/ThemeContext";
import {
  ResultCard,
  ResultCardSkeleton,
  resultCardGridClass,
  type ResultCardMenuItem,
} from "@/design-system/ResultCard";
import { resolveYouTubeVideoId } from "@/lib/youtubeVideoId";
import { safeHttpUrl } from "@/lib/viralPostPlayback";
import { cn } from "@/lib/utils";

export type LibraryPlatform = "instagram" | "tiktok" | "youtube";

const PLATFORM_BADGE: Record<LibraryPlatform, string> = {
  instagram: "Reels",
  tiktok: "TikTok",
  youtube: "Shorts",
};

export type LibraryVideoCardProps = {
  platform: LibraryPlatform;
  thumbnailUrl: string | null | undefined;
  videoUrl?: string | null;
  shortcode?: string | null;
  /** Workspace reel/video id (lets the player refresh an expired file URL). */
  reelId?: number | null;
  /** The original post link (Open source, Share). */
  reelUrl?: string | null;
  caption: string | null | undefined;
  creatorHandle?: string | null;
  onOpenCreator?: () => void;
  metrics: string[];
  /** Where it is in the remake flow ("Script ready"). */
  statusLabel?: string | null;
  remake?: OneClickRemakeAction;
  saved: boolean;
  /** Absent: no save button. */
  onToggleSave?: () => void;
  saveBusy?: boolean;
  onViewDetails: () => void;
  /** Extra ··· items after View details / Open creator / Open source (e.g. Remove). */
  extraMenu?: ResultCardMenuItem[];
  inlinePlaying: boolean;
  onInlinePlayRequest: () => void;
  onInlinePlayStop: () => void;
  testId?: string;
};

export function LibraryVideoCard(p: LibraryVideoCardProps) {
  const originalUrl = safeHttpUrl(p.reelUrl ?? null);
  const handle = (p.creatorHandle ?? "").replace(/^@/, "").trim();
  const youtubeId =
    p.platform === "youtube"
      ? resolveYouTubeVideoId({ shortcode: p.shortcode ?? null, reelUrl: p.reelUrl ?? null })
      : null;
  const canPlayFile =
    p.platform !== "youtube" &&
    (Boolean((p.videoUrl ?? "").trim()) || Boolean((p.shortcode ?? "").trim()) || p.reelId != null);

  const inlineMedia: ReactNode = !p.inlinePlaying ? null : p.platform === "youtube" ? (
    youtubeId ? (
      <YouTubeInlineEmbed className="h-full w-full" videoId={youtubeId} onStop={p.onInlinePlayStop} />
    ) : null
  ) : (
    <DashboardReelGridMedia
      className="h-full w-full"
      thumbnailUrl={p.thumbnailUrl ?? null}
      videoUrl={p.videoUrl ?? null}
      shortcode={p.shortcode ?? undefined}
      reelId={p.reelId ?? undefined}
      platform={p.platform === "tiktok" ? "tiktok" : "instagram"}
      videoPageUrl={p.reelUrl ?? undefined}
      size="compact"
      autoStart
      onPlayingChange={playing => {
        if (!playing) p.onInlinePlayStop();
      }}
    />
  );

  const play = () => {
    if (p.platform === "youtube" ? youtubeId : canPlayFile) p.onInlinePlayRequest();
    else if (originalUrl) window.open(originalUrl, "_blank", "noopener,noreferrer");
    else p.onViewDetails();
  };

  const menu: ResultCardMenuItem[] = [
    { label: "View details", onSelect: p.onViewDetails },
    ...(handle && p.onOpenCreator ? [{ label: "Open creator", onSelect: p.onOpenCreator }] : []),
    ...(originalUrl ? [{ label: "Open source", href: originalUrl }] : []),
    ...(p.extraMenu ?? []),
  ];

  return (
    <ResultCard
      testId={p.testId ?? "library-result-card"}
      mediaFormat="portrait"
      platform={p.platform}
      platformLabel={PLATFORM_BADGE[p.platform]}
      thumbnailUrl={p.thumbnailUrl || null}
      title={p.caption?.trim() || "No caption"}
      creator={handle ? `@${handle}` : null}
      onOpenCreator={handle ? p.onOpenCreator : undefined}
      metrics={p.metrics}
      signal={p.statusLabel ? { kind: "status", label: p.statusLabel } : null}
      labels={{
        play: "Play video",
        expand: "View details",
        remake: p.remake?.label ?? "Remake",
        save: "Save",
        saved: "Saved",
        more: "More options",
      }}
      onPlay={play}
      inlineMedia={inlineMedia}
      onExpand={p.onViewDetails}
      onRemake={() => p.remake?.onClick()}
      remakeBusy={Boolean(p.remake?.loading)}
      remakeDisabled={!p.remake || Boolean(p.remake.disabled) || Boolean(p.saveBusy)}
      saved={p.saved}
      onToggleSave={p.onToggleSave}
      share={originalUrl ? { url: originalUrl, title: p.caption?.trim() || "A video for you" } : null}
      menu={menu}
    />
  );
}

/** Grid of library cards in the Figma theme scope (light or dark from the app theme). */
export function LibraryCardGrid({ children, className }: { children: ReactNode; className?: string }) {
  const { resolvedTheme } = useTheme();
  return (
    <div
      className={cn(resolvedTheme === "dark" ? "sr-scope-dark" : "sr-scope-light", "sr-mode-product", resultCardGridClass, className)}
      style={{ background: "transparent" }}
    >
      {children}
    </div>
  );
}

/** Loading state for a library grid. */
export function LibraryCardGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <LibraryCardGrid>
      {Array.from({ length: count }).map((_, i) => (
        <ResultCardSkeleton key={i} mediaFormat="portrait" />
      ))}
    </LibraryCardGrid>
  );
}
