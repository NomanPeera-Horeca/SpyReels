import type { ViralPost, ViralPostPlatform } from "@shared/viralPosts";
import { resolveYouTubeVideoId } from "@/lib/youtubeVideoId";

export type ExternalWatchLink = {
  href: string;
  label: string;
};

/**
 * Home and other ViralPost surfaces hand this to the existing players.
 * File playback is DashboardReelGridMedia. YouTube is YouTubeInlineEmbed.
 */
export type ViralPostPlayback =
  | {
      kind: "file";
      platform: "instagram" | "tiktok";
      videoUrl: string | null;
      thumbnailUrl: string | null;
      shortcode: string | null;
      reelId?: number;
      videoPageUrl: string | null;
      external: ExternalWatchLink | null;
    }
  | {
      kind: "youtube";
      videoId: string;
      external: ExternalWatchLink | null;
    }
  | {
      kind: "unavailable";
      external: ExternalWatchLink | null;
    };

const PLATFORM_NAME: Record<ViralPostPlatform, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
};

const IG_CODE = /^[A-Za-z0-9_-]{5,}$/;
const IG_REEL_URL = /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i;

export function watchOnLabel(platform: ViralPostPlatform): string {
  return `Watch on ${PLATFORM_NAME[platform]}`;
}

/** http(s) only. Rejects javascript:, data:, and other non-navigation URLs. */
export function safeHttpUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function instagramShortcode(post: ViralPost, sourceUrl: string | null): string | null {
  const id = post.sourceId.trim();
  if (IG_CODE.test(id)) return id;
  return sourceUrl?.match(IG_REEL_URL)?.[1] ?? null;
}

function externalLink(
  platform: ViralPostPlatform,
  href: string | null
): ExternalWatchLink | null {
  if (!href) return null;
  return { href, label: watchOnLabel(platform) };
}

/**
 * Map a ViralPost onto the existing in-app players.
 * TikTok must not send reels.id to tiktokScrape.refreshVideoUrl (that id is
 * tiktok_videos.id). Refresh uses the page URL, matching ViralPostPreview.
 */
export function resolveViralPostPlayback(post: ViralPost): ViralPostPlayback {
  const sourceUrl = safeHttpUrl(post.sourceUrl);
  const videoUrl = (post.videoUrl ?? "").trim() || null;
  const thumbnailUrl = (post.thumbnailUrl ?? "").trim() || null;

  if (post.platform === "youtube") {
    const videoId = resolveYouTubeVideoId({
      shortcode: post.sourceId,
      reelUrl: sourceUrl,
    });
    const href =
      sourceUrl ??
      (videoId ? `https://www.youtube.com/shorts/${encodeURIComponent(videoId)}` : null);
    if (!videoId) {
      return { kind: "unavailable", external: externalLink("youtube", href) };
    }
    return {
      kind: "youtube",
      videoId,
      external: externalLink("youtube", href),
    };
  }

  if (post.platform === "tiktok") {
    const external = externalLink("tiktok", sourceUrl);
    if (!videoUrl && !sourceUrl) {
      return { kind: "unavailable", external };
    }
    return {
      kind: "file",
      platform: "tiktok",
      videoUrl,
      thumbnailUrl,
      shortcode: null,
      videoPageUrl: sourceUrl,
      external,
    };
  }

  const shortcode = instagramShortcode(post, sourceUrl);
  const reelId =
    post.reelId != null && post.reelId > 0 ? post.reelId : undefined;
  const href =
    sourceUrl ??
    (shortcode ? `https://www.instagram.com/reel/${encodeURIComponent(shortcode)}/` : null);
  const external = externalLink("instagram", href);
  if (!videoUrl && !shortcode && reelId == null) {
    return { kind: "unavailable", external };
  }
  return {
    kind: "file",
    platform: "instagram",
    videoUrl,
    thumbnailUrl,
    shortcode,
    reelId,
    videoPageUrl: null,
    external,
  };
}
