import { TRPCError } from "@trpc/server";
import {
  TRANSCRIPT_GENERATOR_COPY,
  type TranscriptGeneratorVariant,
} from "@shared/transcriptGeneratorLanding";
import { fetchCollectedReelMetadataForPlatform } from "./collectedReelFetch";
import { parseCollectedVideoUrl } from "./socialVideoUrl";
import { fetchYouTubeTranscript } from "./youtube";

const SESSION_TTL_MS = 1000 * 60 * 45;
const MAX_TRANSCRIPT_CHARS = 60_000;
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_LIMIT_PER_IP = 8;

export type TranscriptGeneratorSession = {
  url: string;
  platform: "instagram" | "tiktok" | "youtube";
  variant: TranscriptGeneratorVariant;
  transcript: string;
  title?: string;
  ts: number;
};

export type TranscriptGeneratorPreviewResult = {
  sessionToken: string;
  transcript: string;
  url: string;
  platform: "instagram" | "tiktok" | "youtube";
  title?: string;
  wordCount: number;
};

const rateByIp = new Map<string, { count: number; resetAt: number }>();

function assertRateLimit(ip: string) {
  const key = ip.trim() || "unknown";
  const now = Date.now();
  const row = rateByIp.get(key);
  if (!row || now >= row.resetAt) {
    rateByIp.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return;
  }
  if (row.count >= RATE_LIMIT_PER_IP) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many transcript requests from this network. Try again in an hour.",
    });
  }
  row.count += 1;
}

function encodeSession(session: TranscriptGeneratorSession): string {
  return Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
}

export function decodeTranscriptGeneratorSession(
  token: string
): TranscriptGeneratorSession {
  let parsed: TranscriptGeneratorSession;
  try {
    parsed = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8")
    ) as TranscriptGeneratorSession;
  } catch {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid session. Please generate the transcript again.",
    });
  }
  if (
    !parsed?.url ||
    !parsed?.transcript ||
    !parsed?.platform ||
    !parsed?.variant ||
    !parsed?.ts ||
    Date.now() - parsed.ts > SESSION_TTL_MS
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Session expired. Please generate the transcript again.",
    });
  }
  return parsed;
}

function countWords(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function assertVariantMatchesPlatform(
  variant: TranscriptGeneratorVariant,
  platform: "instagram" | "tiktok" | "youtube",
  canonicalUrl: string
) {
  const copy = TRANSCRIPT_GENERATOR_COPY[variant];
  if (copy.platform !== platform) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Paste a ${copy.platform === "youtube" ? "YouTube" : copy.platform === "tiktok" ? "TikTok" : "Instagram"} URL on this page.`,
    });
  }
  if (copy.shortsOnly && !/youtube\.com\/shorts\//i.test(canonicalUrl)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "This page is for YouTube Shorts. Use the YouTube Transcript Generator for long videos, or paste a /shorts/ URL.",
    });
  }
}

async function fetchSpokenTranscript(opts: {
  platform: "instagram" | "tiktok" | "youtube";
  externalId: string;
  canonicalUrl: string;
}): Promise<{ transcript: string; title?: string }> {
  if (opts.platform === "youtube") {
    const result = await fetchYouTubeTranscript(opts.canonicalUrl);
    const transcript = result?.transcript?.trim() ?? "";
    if (!transcript) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "No captions found for that YouTube video. Try another public video, or a Short with spoken audio.",
      });
    }
    return { transcript: transcript.slice(0, MAX_TRANSCRIPT_CHARS) };
  }

  const meta = await fetchCollectedReelMetadataForPlatform(
    opts.platform,
    opts.externalId,
    opts.canonicalUrl
  );
  if (!meta.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        meta.message ||
        "Could not load that video. Check it is public and try again.",
    });
  }

  const videoUrl = (meta.data.videoUrl || "").trim();
  if (!videoUrl) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Could not retrieve a playable video URL for transcription.",
    });
  }

  const { transcribeReel } = await import("./services/transcribeReel");
  const result = await transcribeReel({
    videoUrl,
    shortcode: opts.externalId,
  });
  if (!result.success) {
    throw new TRPCError({
      code:
        result.errorCode === "REEL_TOO_LONG" ||
        result.errorCode === "VIDEO_TOO_LARGE" ||
        result.errorCode === "NO_SPEECH_DETECTED"
          ? "BAD_REQUEST"
          : result.errorCode === "DEEPGRAM_RATE_LIMIT"
            ? "TOO_MANY_REQUESTS"
            : "INTERNAL_SERVER_ERROR",
      message: result.userMessage,
    });
  }

  const transcript = result.transcript.trim();
  if (!transcript) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "No spoken audio detected in that video.",
    });
  }

  return {
    transcript: transcript.slice(0, MAX_TRANSCRIPT_CHARS),
    title: meta.data.caption?.trim().slice(0, 160) || undefined,
  };
}

export async function previewTranscriptGenerator(opts: {
  url: string;
  variant: TranscriptGeneratorVariant;
  clientIp?: string;
}): Promise<TranscriptGeneratorPreviewResult> {
  assertRateLimit(opts.clientIp || "unknown");

  const parsed = await parseCollectedVideoUrl(opts.url);
  if (!parsed) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Could not parse that link. Paste a public Instagram Reel, TikTok, or YouTube URL.",
    });
  }

  assertVariantMatchesPlatform(opts.variant, parsed.platform, parsed.canonicalUrl);

  const spoken = await fetchSpokenTranscript({
    platform: parsed.platform,
    externalId: parsed.externalId,
    canonicalUrl: parsed.canonicalUrl,
  });

  const session: TranscriptGeneratorSession = {
    url: parsed.canonicalUrl,
    platform: parsed.platform,
    variant: opts.variant,
    transcript: spoken.transcript,
    title: spoken.title,
    ts: Date.now(),
  };

  return {
    sessionToken: encodeSession(session),
    transcript: spoken.transcript,
    url: parsed.canonicalUrl,
    platform: parsed.platform,
    title: spoken.title,
    wordCount: countWords(spoken.transcript),
  };
}
