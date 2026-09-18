import { and, desc, eq } from "drizzle-orm";
import { featuredReels, reels, transcriptions } from "../../../drizzle/schema";
import { fetchCollectedReelMetadata, type CollectedReelFetchProvider } from "../../collectedReelFetch";
import { getDb } from "../../db";
import {
  canonicalInstagramReelUrl,
  parseInstagramReelShortcode,
} from "../../instagramUrl";
import {
  checkUsageLimit,
  decrementUsage,
  incrementUsage,
} from "../../stripe/stripe-service";
import {
  transcribeReel,
  type Segment,
  type TranscriptionResult,
} from "../../services/transcribeReel";
import {
  acquireTranscriptionSlot,
  releaseTranscriptionSlot,
} from "../../transcriptionSemaphore";
import { AiGatewayError } from "../errors";
import type { AiGatewayActor } from "../types";

const METADATA_CACHE_TTL_MS = 5 * 60 * 1000;
const TRANSCRIPT_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;

export interface InspectedReel {
  platform: "instagram";
  shortcode: string;
  reelUrl: string;
  creator: {
    username: string;
    fullName: string;
    followerCount: number | null;
    profilePicUrl: string;
  };
  caption: string;
  metrics: {
    views: number;
    likes: number;
    comments: number;
  };
  durationSec: number;
  postedAt: string;
  thumbnailUrl: string;
  provider: CollectedReelFetchProvider;
}

export interface ReelTranscriptResult {
  reel: InspectedReel;
  transcript: string;
  segments: Segment[];
  durationSec: number;
  cache: {
    hit: boolean;
    source: "memory" | "featured_catalog" | "existing_transcription" | "live";
  };
}

type CachedMetadata = {
  expiresAt: number;
  value: InspectedReel;
  videoUrl: string;
};

type CachedTranscript = {
  expiresAt: number;
  transcript: string;
  segments: Segment[];
  durationSec: number;
};

const metadataCache = new Map<string, CachedMetadata>();
const transcriptCache = new Map<string, CachedTranscript>();

function pruneMap<T extends { expiresAt: number }>(
  map: Map<string, T>,
  now: number
): void {
  for (const [key, value] of map) {
    if (value.expiresAt <= now) map.delete(key);
  }
  while (map.size > CACHE_MAX_ENTRIES) {
    const oldest = map.keys().next().value as string | undefined;
    if (!oldest) break;
    map.delete(oldest);
  }
}

function parseExactInstagramReelUrl(rawUrl: string): {
  shortcode: string;
  canonicalUrl: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new AiGatewayError({
      code: "INVALID_INPUT",
      message: "Provide a valid Instagram Reel URL.",
      retryable: false,
    });
  }

  const host = parsed.hostname.toLowerCase();
  const allowedHost =
    host === "instagram.com" ||
    host.endsWith(".instagram.com") ||
    host === "instagr.am" ||
    host.endsWith(".instagr.am");

  if (parsed.protocol !== "https:" || !allowedHost) {
    throw new AiGatewayError({
      code: "INVALID_INPUT",
      message: "This tool currently supports public Instagram Reel URLs only.",
      retryable: false,
    });
  }

  const shortcode = parseInstagramReelShortcode(parsed.toString());
  if (!shortcode) {
    throw new AiGatewayError({
      code: "INVALID_INPUT",
      message: "SpyReels could not find an Instagram Reel shortcode in that URL.",
      retryable: false,
    });
  }

  return {
    shortcode,
    canonicalUrl: canonicalInstagramReelUrl(shortcode),
  };
}

async function loadMetadata(rawUrl: string): Promise<{
  inspected: InspectedReel;
  videoUrl: string;
}> {
  const { shortcode, canonicalUrl } = parseExactInstagramReelUrl(rawUrl);
  const now = Date.now();
  pruneMap(metadataCache, now);

  const cached = metadataCache.get(shortcode);
  if (cached && cached.expiresAt > now) {
    return { inspected: cached.value, videoUrl: cached.videoUrl };
  }

  const fetched = await fetchCollectedReelMetadata(shortcode, canonicalUrl);
  if (!fetched.ok) {
    throw new AiGatewayError({
      code: fetched.reason === "not_found" ? "NOT_FOUND" : "UPSTREAM_UNAVAILABLE",
      message: fetched.message,
      retryable: fetched.reason !== "not_found",
    });
  }

  const d = fetched.data;
  const inspected: InspectedReel = {
    platform: "instagram",
    shortcode,
    reelUrl: canonicalUrl,
    creator: {
      username: d.ownerUsername || "",
      fullName: d.ownerFullName || "",
      followerCount:
        Number.isFinite(d.ownerFollowerCount) && d.ownerFollowerCount > 0
          ? d.ownerFollowerCount
          : null,
      profilePicUrl: d.ownerProfilePicUrl || "",
    },
    caption: d.caption || "",
    metrics: {
      views: d.viewCount || 0,
      likes: d.likeCount || 0,
      comments: d.commentCount || 0,
    },
    durationSec: d.duration || 0,
    postedAt: d.postedAt.toISOString(),
    thumbnailUrl: d.thumbnailUrl || "",
    provider: fetched.provider,
  };

  metadataCache.set(shortcode, {
    expiresAt: now + METADATA_CACHE_TTL_MS,
    value: inspected,
    videoUrl: d.videoUrl || "",
  });
  pruneMap(metadataCache, now);

  return { inspected, videoUrl: d.videoUrl || "" };
}

export async function inspectReelUrl(url: string): Promise<InspectedReel> {
  const { inspected } = await loadMetadata(url);
  return inspected;
}

async function findStoredTranscript(shortcode: string): Promise<
  | {
      transcript: string;
      segments: Segment[];
      durationSec: number;
      source: "featured_catalog" | "existing_transcription";
    }
  | null
> {
  const db = await getDb();
  if (!db) return null;

  const featured = await db
    .select({
      transcript: featuredReels.transcript,
      segments: featuredReels.transcriptSegments,
      duration: featuredReels.duration,
    })
    .from(featuredReels)
    .where(
      and(
        eq(featuredReels.reelShortcode, shortcode),
        eq(featuredReels.transcriptionStatus, "completed")
      )
    )
    .limit(1);

  const featuredRow = featured[0];
  if (featuredRow?.transcript?.trim()) {
    return {
      transcript: featuredRow.transcript.trim(),
      segments: Array.isArray(featuredRow.segments)
        ? (featuredRow.segments as Segment[])
        : [],
      durationSec: featuredRow.duration || 0,
      source: "featured_catalog",
    };
  }

  const existing = await db
    .select({
      transcript: transcriptions.transcript,
      segments: transcriptions.segments,
      duration: reels.duration,
    })
    .from(reels)
    .innerJoin(transcriptions, eq(transcriptions.reelId, reels.id))
    .where(
      and(
        eq(reels.shortcode, shortcode),
        eq(transcriptions.status, "completed")
      )
    )
    .orderBy(desc(transcriptions.updatedAt))
    .limit(1);

  const existingRow = existing[0];
  if (existingRow?.transcript?.trim()) {
    return {
      transcript: existingRow.transcript.trim(),
      segments: Array.isArray(existingRow.segments)
        ? (existingRow.segments as Segment[])
        : [],
      durationSec: existingRow.duration || 0,
      source: "existing_transcription",
    };
  }

  return null;
}

function mapTranscriptionFailure(result: Extract<TranscriptionResult, { success: false }>): never {
  if (result.errorCode === "NO_SPEECH_DETECTED") {
    throw new AiGatewayError({
      code: "NO_SPEECH",
      message:
        "SpyReels could not detect spoken audio in this Reel, so there is nothing to transcribe.",
      retryable: false,
    });
  }

  if (
    result.errorCode === "VIDEO_TOO_LARGE" ||
    result.errorCode === "REEL_TOO_LONG" ||
    result.errorCode === "AUDIO_EXTRACTION_FAILED"
  ) {
    throw new AiGatewayError({
      code: "UPSTREAM_UNAVAILABLE",
      message: result.userMessage,
      retryable: false,
    });
  }

  throw new AiGatewayError({
    code: "UPSTREAM_UNAVAILABLE",
    message: result.userMessage,
    retryable: true,
  });
}

export async function transcribeReelUrl(input: {
  actor: AiGatewayActor;
  url: string;
}): Promise<ReelTranscriptResult> {
  const { inspected, videoUrl } = await loadMetadata(input.url);
  const now = Date.now();
  pruneMap(transcriptCache, now);

  const memory = transcriptCache.get(inspected.shortcode);
  if (memory && memory.expiresAt > now) {
    return {
      reel: inspected,
      transcript: memory.transcript,
      segments: memory.segments,
      durationSec: memory.durationSec,
      cache: { hit: true, source: "memory" },
    };
  }

  const stored = await findStoredTranscript(inspected.shortcode);
  if (stored) {
    transcriptCache.set(inspected.shortcode, {
      expiresAt: now + TRANSCRIPT_CACHE_TTL_MS,
      transcript: stored.transcript,
      segments: stored.segments,
      durationSec: stored.durationSec,
    });
    pruneMap(transcriptCache, now);
    return {
      reel: inspected,
      transcript: stored.transcript,
      segments: stored.segments,
      durationSec: stored.durationSec,
      cache: { hit: true, source: stored.source },
    };
  }

  const usage = await checkUsageLimit(
    input.actor.userId,
    "transcribeCount",
    input.actor.openId ?? undefined,
    { email: input.actor.email, role: input.actor.role }
  );

  if (!usage.allowed) {
    throw new AiGatewayError({
      code: "USAGE_LIMIT_REACHED",
      message: `Your current SpyReels plan has reached its transcription limit (${usage.used}/${usage.limit}).`,
      retryable: false,
      upgradePlan: usage.planRequired,
    });
  }

  if (!videoUrl) {
    throw new AiGatewayError({
      code: "UPSTREAM_UNAVAILABLE",
      message:
        "SpyReels found the Reel but could not access its video stream for transcription. Please try again later.",
      retryable: true,
    });
  }

  await incrementUsage(input.actor.userId, "transcribeCount");

  let result: TranscriptionResult;
  await acquireTranscriptionSlot();
  try {
    result = await transcribeReel({
      videoUrl,
      shortcode: inspected.shortcode,
    });
  } catch (error) {
    await decrementUsage(input.actor.userId, "transcribeCount").catch(() => {});
    throw error;
  } finally {
    releaseTranscriptionSlot();
  }

  if (!result.success) {
    await decrementUsage(input.actor.userId, "transcribeCount").catch(() => {});
    return mapTranscriptionFailure(result);
  }

  transcriptCache.set(inspected.shortcode, {
    expiresAt: now + TRANSCRIPT_CACHE_TTL_MS,
    transcript: result.transcript,
    segments: result.segments,
    durationSec: result.durationSec,
  });
  pruneMap(transcriptCache, now);

  return {
    reel: inspected,
    transcript: result.transcript,
    segments: result.segments,
    durationSec: result.durationSec,
    cache: { hit: false, source: "live" },
  };
}

export function resetReelResearchCachesForTest(): void {
  metadataCache.clear();
  transcriptCache.clear();
}
