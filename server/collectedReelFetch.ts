/**
 * Collected Reels metadata fetch (Instagram / TikTok / YouTube).
 */

import {
  fetchReelByShortcodeResult,
  reelFetchFailureMessage,
  type ReelFetchFailureReason,
  type ReelFullData,
} from "./instagram";
import { fetchTikTokVideoDetails } from "./tiktok";
import { fetchYouTubeVideoDetails } from "./youtube";
import type { CollectedVideoPlatform } from "./socialVideoUrl";

export type CollectedReelFetchProvider =
  | "scrapecreators"
  | "scrapecreators_download"
  | "tiktok"
  | "youtube";

export type CollectedReelFetchOutcome =
  | { ok: true; data: ReelFullData; provider: CollectedReelFetchProvider }
  | { ok: false; reason: ReelFetchFailureReason; message: string };

export async function fetchCollectedReelMetadata(
  shortcode: string,
  preferUrl?: string
): Promise<CollectedReelFetchOutcome> {
  return fetchCollectedReelMetadataForPlatform("instagram", shortcode, preferUrl);
}

export async function fetchCollectedReelMetadataForPlatform(
  platform: CollectedVideoPlatform,
  externalId: string,
  preferUrl?: string
): Promise<CollectedReelFetchOutcome> {
  if (platform === "tiktok") {
    const url =
      preferUrl?.trim() ||
      `https://www.tiktok.com/@video/video/${externalId}`;
    const details = await fetchTikTokVideoDetails(url);
    if (!details || (!details.videoUrl && !details.thumbnailUrl)) {
      return {
        ok: false,
        reason: "not_found",
        message:
          "Could not load this TikTok. Check the link is public and try again.",
      };
    }
    return {
      ok: true,
      provider: "tiktok",
      data: {
        videoUrl: details.videoUrl,
        thumbnailUrl: details.thumbnailUrl,
        caption: details.caption,
        viewCount: details.viewCount,
        likeCount: details.likeCount,
        commentCount: details.commentCount,
        duration: Math.round(details.durationSec || 0),
        postedAt: details.postedAt || new Date(),
        ownerUsername: details.ownerUsername,
        ownerFullName: details.ownerFullName,
        ownerProfilePicUrl: details.ownerProfilePicUrl,
        ownerFollowerCount: 0,
      },
    };
  }

  if (platform === "youtube") {
    const url =
      preferUrl?.trim() || `https://www.youtube.com/shorts/${externalId}`;
    const details = await fetchYouTubeVideoDetails(url);
    if (!details) {
      return {
        ok: false,
        reason: "not_found",
        message:
          "Could not load this YouTube video. Check the link is public and try again.",
      };
    }
    return {
      ok: true,
      provider: "youtube",
      data: {
        // YouTube has no durable MP4 from ScrapeCreators; remake uses captions.
        videoUrl: "",
        thumbnailUrl: details.thumbnailUrl,
        caption: details.title || details.description || "",
        viewCount: details.viewCount,
        likeCount: details.likeCount,
        commentCount: details.commentCount,
        duration: details.durationSec,
        postedAt: details.postedAt || new Date(),
        ownerUsername: details.ownerUsername,
        ownerFullName: details.ownerFullName,
        ownerProfilePicUrl: "",
        ownerFollowerCount: 0,
      },
    };
  }

  const primary = await fetchReelByShortcodeResult(externalId, { preferUrl });
  if (primary.ok) {
    return { ok: true, data: primary.data, provider: "scrapecreators" };
  }

  const withMedia = await fetchReelByShortcodeResult(externalId, {
    preferUrl,
    downloadMedia: true,
  });
  if (withMedia.ok) {
    return { ok: true, data: withMedia.data, provider: "scrapecreators_download" };
  }

  return {
    ok: false,
    reason: primary.reason,
    message: reelFetchFailureMessage(primary.reason),
  };
}
