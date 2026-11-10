/**
 * Resolve Instagram / TikTok / YouTube URLs into carousel source text
 * (caption + spoken transcript when available).
 */

import { fetchCollectedReelMetadataForPlatform } from "../collectedReelFetch";
import { parseCollectedVideoUrl, type ParsedCollectedVideoUrl } from "../socialVideoUrl";
import { checkUsageLimit, incrementUsage } from "../stripe/stripe-service";
import { fetchPublicPageText } from "./fetchPublicPageText";

export class CarouselSourceUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CarouselSourceUrlError";
  }
}

function combineSourceParts(parts: {
  platform: string;
  url: string;
  owner?: string;
  caption?: string;
  transcript?: string;
}): string {
  const blocks: string[] = [
    `Source platform: ${parts.platform}`,
    `Source URL: ${parts.url}`,
  ];
  if (parts.owner?.trim()) {
    blocks.push(`Creator: @${parts.owner.replace(/^@/, "")}`);
  }
  const caption = parts.caption?.trim() ?? "";
  if (caption) {
    blocks.push(`Caption / title:\n${caption}`);
  }
  const transcript = parts.transcript?.trim() ?? "";
  if (transcript) {
    blocks.push(`Spoken transcript:\n${transcript}`);
  }
  return blocks.join("\n\n").trim();
}

async function fetchSpokenTranscript(opts: {
  parsed: ParsedCollectedVideoUrl;
  videoUrl: string;
  userId: number;
  openId: string;
}): Promise<string> {
  const { parsed, videoUrl, userId, openId } = opts;

  if (parsed.platform === "youtube") {
    const usageCheck = await checkUsageLimit(userId, "transcribeCount", openId);
    if (!usageCheck.allowed) {
      return "";
    }
    const { fetchYouTubeTranscript } = await import("../youtube");
    await incrementUsage(userId, "transcribeCount");
    const result = await fetchYouTubeTranscript(parsed.canonicalUrl);
    return result?.transcript?.trim() ?? "";
  }

  if (!videoUrl.trim()) return "";

  const usageCheck = await checkUsageLimit(userId, "transcribeCount", openId);
  if (!usageCheck.allowed) {
    return "";
  }

  await incrementUsage(userId, "transcribeCount");
  const { transcribeReel } = await import("../services/transcribeReel");
  const result = await transcribeReel({
    videoUrl,
    shortcode: parsed.externalId,
    cacheKey:
      parsed.platform === "instagram" || parsed.platform === "tiktok"
        ? { platform: parsed.platform, sourceId: parsed.externalId }
        : undefined,
  });
  if (!result.success) {
    console.warn(
      `[fetchSocialVideoSourceText] transcript failed ${parsed.platform}:${parsed.externalId}`,
      result.errorCode
    );
    return "";
  }
  return result.transcript.trim();
}

export type CarouselSourceFromUrl = {
  text: string;
  /** Reel/video cover when resolved from a social video URL (Path B). */
  thumbnailUrl?: string | null;
  /** Platform external id (IG shortcode / awemeId / YouTube id) for R2 thumb mirroring. */
  reelId?: string | null;
};

/**
 * Build carousel source text from a parsed social video URL.
 * Prefers caption + spoken transcript; caption alone is OK when long enough.
 */
export async function fetchSocialVideoSourceText(
  parsed: ParsedCollectedVideoUrl,
  opts: { userId: number; openId: string }
): Promise<CarouselSourceFromUrl> {
  const meta = await fetchCollectedReelMetadataForPlatform(
    parsed.platform,
    parsed.externalId,
    parsed.canonicalUrl
  );
  if (!meta.ok) {
    throw new CarouselSourceUrlError(
      meta.message ||
        "Could not load that video. Check it is public, or paste the caption / transcript instead."
    );
  }

  const caption = (meta.data.caption || "").trim();
  let transcript = "";
  try {
    transcript = await fetchSpokenTranscript({
      parsed,
      videoUrl: meta.data.videoUrl || "",
      userId: opts.userId,
      openId: opts.openId,
    });
  } catch (err) {
    console.warn("[fetchSocialVideoSourceText] transcript error", err);
  }

  const combined = combineSourceParts({
    platform: parsed.platform,
    url: parsed.canonicalUrl,
    owner: meta.data.ownerUsername,
    caption,
    transcript,
  });

  const bodyLen = `${caption}\n${transcript}`.trim().length;
  if (bodyLen < 40) {
    throw new CarouselSourceUrlError(
      "Not enough text from that video (caption/transcript too short). Paste the script or a blog URL instead."
    );
  }

  return {
    text: combined.slice(0, 12000),
    thumbnailUrl: (meta.data.thumbnailUrl || "").trim() || null,
    reelId: parsed.externalId || null,
  };
}

/**
 * URL mode resolver: social video first, otherwise public page HTML text.
 */
export async function resolveCarouselSourceFromUrl(
  rawUrl: string,
  opts: { userId: number; openId: string }
): Promise<CarouselSourceFromUrl> {
  const social = await parseCollectedVideoUrl(rawUrl);
  if (social) {
    return fetchSocialVideoSourceText(social, opts);
  }

  const fetched = await fetchPublicPageText(rawUrl);
  if (!fetched || fetched.length < 80) {
    throw new CarouselSourceUrlError(
      "Could not read enough text from that URL. Paste an Instagram / TikTok / YouTube link, a blog URL, or paste the content instead."
    );
  }
  return { text: fetched, thumbnailUrl: null, reelId: null };
}
