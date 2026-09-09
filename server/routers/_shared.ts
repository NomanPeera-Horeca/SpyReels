import type { Reel } from "../../drizzle/schema";
import { classifyTranscript } from "../_core/classifyTranscript";
import { analyzeHook } from "../analyzeHook";
import { updateTranscription, getReelById, updateFeaturedReelTranscription, getFeaturedReelById } from "../db";
import { fetchReelByShortcode } from "../instagram";
import { isDurableReelVideoUrl } from "../reelVideoR2";
import { acquireTranscriptionSlot, releaseTranscriptionSlot } from "../transcriptionSemaphore";
import { not } from "drizzle-orm";
import { mirrorReelThumbnailsBounded } from "../discovery/mediaMirror";

/**
 * First day of the next calendar month in UTC, as an ISO string.
 * Used to compute when monthly quotas reset for messaging.
 */
export function firstDayOfNextMonthUtc(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  return new Date(Date.UTC(year, month + 1, 1)).toISOString();
}

/**
 * Mirror Search Reels thumbnails to R2 (same shortcode keyspace as Discovery/scrape).
 * First SEARCH_THUMB_MIRROR_SYNC results await so the visible grid gets durable URLs;
 * the rest mirror in the background so repeat searches hit R2 head cache.
 * Never throws: on mirror failure, original CDN URLs are kept.
 */
const SEARCH_THUMB_MIRROR_SYNC = 20;

export async function withSearchReelThumbnailMirroring<
  T extends { shortcode: string; thumbnailUrl: string },
>(reels: T[]): Promise<T[]> {
  if (reels.length === 0) return reels;

  const syncItems = reels.slice(0, SEARCH_THUMB_MIRROR_SYNC);
  const restItems = reels.slice(SEARCH_THUMB_MIRROR_SYNC);

  let stable = new Map<string, string>();
  try {
    stable = await mirrorReelThumbnailsBounded(
      syncItems.map((r) => ({
        shortcode: r.shortcode,
        thumbnailUrl: r.thumbnailUrl,
      }))
    );
  } catch (err) {
    console.error("[search] thumbnail mirror failed; serving CDN URLs", err);
  }

  if (restItems.length > 0) {
    void mirrorReelThumbnailsBounded(
      restItems.map((r) => ({
        shortcode: r.shortcode,
        thumbnailUrl: r.thumbnailUrl,
      }))
    ).catch((err) => {
      console.error("[search] background thumbnail mirror failed", err);
    });
  }

  return reels.map((r) => ({
    ...r,
    thumbnailUrl: stable.get(r.shortcode) ?? r.thumbnailUrl,
  }));
}


export function extractHookTextFromSegments(
  segments: unknown,
  hookWindowSec = 3.6
): string | null {
  if (!Array.isArray(segments)) return null;
  const parts: string[] = [];
  for (const seg of segments) {
    if (!seg || typeof seg !== "object") continue;
    const s = seg as { start?: unknown; end?: unknown; text?: unknown };
    const end = typeof s.end === "number" ? s.end : Number(s.end);
    const text = typeof s.text === "string" ? s.text.trim() : "";
    if (!text || !Number.isFinite(end)) continue;
    if (end <= hookWindowSec + 0.25) parts.push(text);
  }
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  return joined.length > 0 ? joined.slice(0, 800) : null;
}


export async function runTranscription(
  transcriptionId: number,
  reel: {
    id: number;
    shortcode: string;
    videoUrl: string | null;
    caption: string | null;
    thumbnailUrl: string | null;
  }
): Promise<void> {
  // Serialize with the same process-local semaphore that search.transcribe
  // uses. Prevents cascading Instagram CDN rate-limits when batch kickoffs
  // (e.g. "Transcribe All" on Saved Reels) fan out many reels in parallel
  // from our single Render IP.
  await acquireTranscriptionSlot();
  try {
    await updateTranscription(transcriptionId, { startedAt: new Date() });
    // Prefer a fresh Instagram URL; fall back to durable R2 when vendor refresh fails
    // (e.g. ScrapeCreators 402) so we can still transcribe mirrored reels.
    const initialFresh = await fetchReelByShortcode(reel.shortcode);
    let videoUrl = initialFresh?.videoUrl ?? null;
    if (!videoUrl && isDurableReelVideoUrl(reel.videoUrl)) {
      console.warn(
        `[runTranscription] fresh URL unavailable for ${reel.shortcode}; falling back to durable stored videoUrl`
      );
      videoUrl = reel.videoUrl!.trim();
    }
    if (!videoUrl) {
      throw new Error(
        "Could not retrieve video URL for this reel. The video may no longer be available."
      );
    }

    // Call the new Deepgram-based transcription pipeline
    const { transcribeReel } = await import("../services/transcribeReel.js");
    const result = await transcribeReel({
      videoUrl,
      shortcode: reel.shortcode,
    });

    if (!result.success) {
      // No-speech is a valid outcome (music/visual-only reel).
      // Save empty transcript + "no speech" marker so the UI can
      // render the appropriate state.
      if (result.errorCode === "NO_SPEECH_DETECTED") {
        await updateTranscription(transcriptionId, {
          transcript: "",
          segments: [],
          hookAnalysis: "",
          status: "completed",
        });
        return;
      }
      // All other errors: mark the job as failed with the friendly message
      throw new Error(result.userMessage);
    }

    const transcript = result.transcript;
    const segments = result.segments;

    const hookAnalysis = await analyzeHook(
      transcript,
      reel.caption || "",
      reel.thumbnailUrl || "",
      segments as any,
      "Instagram Reel"
    );

    await updateTranscription(transcriptionId, {
      transcript,
      segments: segments as any,
      hookAnalysis,
      status: "completed",
    });

    void Promise.resolve()
      .then(async () => {
        const row = await getReelById(reel.id);
        if (row?.classifiedAt) return;
        if (!transcript.trim()) return;
        await classifyTranscript({
          transcript,
          reelId: reel.id,
          table: "reels",
        });
      })
      .catch((err) => console.error("Classification failed:", err));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[runTranscription] ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    await updateTranscription(transcriptionId, {
      status: "failed",
      errorMessage: message,
    });
  } finally {
    releaseTranscriptionSlot();
  }
}


export async function runFeaturedReelTranscription(reel: {
  id: number;
  shortcode: string;
  videoUrl: string | null;
}): Promise<void> {
  await acquireTranscriptionSlot();
  try {
    // Prefer a fresh Instagram URL; fall back to durable R2 when vendor refresh fails.
    const initialFresh = await fetchReelByShortcode(reel.shortcode);
    let videoUrl = initialFresh?.videoUrl ?? null;
    if (!videoUrl && isDurableReelVideoUrl(reel.videoUrl)) {
      console.warn(
        `[runFeaturedReelTranscription] fresh URL unavailable for ${reel.shortcode}; falling back to durable stored videoUrl`
      );
      videoUrl = reel.videoUrl!.trim();
    }
    if (!videoUrl) {
      throw new Error(
        "Could not retrieve video URL for this reel. The video may no longer be available."
      );
    }

    const { transcribeReel } = await import("../services/transcribeReel.js");
    const result = await transcribeReel({ videoUrl, shortcode: reel.shortcode });

    if (!result.success) {
      if (result.errorCode === "NO_SPEECH_DETECTED") {
        await updateFeaturedReelTranscription(reel.id, {
          transcriptionStatus: "no_speech",
          transcript: "",
          transcriptSegments: [],
          transcribedAt: new Date(),
        });
        return;
      }
      throw new Error(result.userMessage);
    }

    await updateFeaturedReelTranscription(reel.id, {
      transcriptionStatus: "completed",
      transcript: result.transcript,
      transcriptSegments: result.segments as {
        start: number;
        end: number;
        text: string;
      }[],
      transcribedAt: new Date(),
    });

    void Promise.resolve()
      .then(async () => {
        const row = await getFeaturedReelById(reel.id);
        if (row?.classifiedAt) return;
        if (!result.transcript.trim()) return;
        await classifyTranscript({
          transcript: result.transcript,
          reelId: reel.id,
          table: "featured_reels",
        });
      })
      .catch((err) => console.error("Classification failed:", err));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[runFeaturedReelTranscription] ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    await updateFeaturedReelTranscription(reel.id, {
      transcriptionStatus: "failed",
    });
  } finally {
    releaseTranscriptionSlot();
  }
}

