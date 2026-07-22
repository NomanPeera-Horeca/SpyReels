import { analyzeHook } from "../analyzeHook";
import { updateTranscription } from "../db";
import { transcribeReel } from "../services/transcribeReel.js";
import { fetchTikTokVideoInfo } from "../tiktok";
import {
  isDurableTiktokVideoUrl,
  scheduleTiktokVideoMirror,
} from "../tiktokVideoR2";
import {
  acquireTranscriptionSlot,
  releaseTranscriptionSlot,
} from "../transcriptionSemaphore";

export async function runTikTokTranscription(
  transcriptionId: number,
  video: {
    id: number;
    awemeId: string;
    videoUrl: string | null;
    videoPageUrl: string;
    caption: string | null;
    thumbnailUrl: string | null;
  }
): Promise<void> {
  await acquireTranscriptionSlot();
  try {
    await updateTranscription(transcriptionId, { startedAt: new Date() });

    const fresh = await fetchTikTokVideoInfo(video.videoPageUrl);
    let videoUrl = fresh?.videoUrl ?? null;
    if (videoUrl) {
      scheduleTiktokVideoMirror(video.id, video.awemeId, videoUrl);
    }
    if (!videoUrl && isDurableTiktokVideoUrl(video.videoUrl)) {
      console.warn(
        `[runTikTokTranscription] fresh URL unavailable for ${video.awemeId}; falling back to durable stored videoUrl`
      );
      videoUrl = video.videoUrl!.trim();
    }
    if (!videoUrl) {
      throw new Error(
        "Could not retrieve video URL for this TikTok video. The video may no longer be available."
      );
    }

    const result = await transcribeReel({
      videoUrl,
      shortcode: video.awemeId,
    });

    if (!result.success) {
      if (result.errorCode === "NO_SPEECH_DETECTED") {
        await updateTranscription(transcriptionId, {
          transcript: "",
          segments: [],
          hookAnalysis: "",
          status: "completed",
        });
        return;
      }
      throw new Error(result.userMessage);
    }

    const transcript = result.transcript;
    const segments = result.segments;
    const hookAnalysis = await analyzeHook(
      transcript,
      video.caption || "",
      video.thumbnailUrl || "",
      segments,
      "TikTok video"
    );

    await updateTranscription(transcriptionId, {
      transcript,
      segments,
      hookAnalysis,
      status: "completed",
    });

    // TikTok transcript classification is intentionally deferred until its
    // source schema can be modeled without relying on Instagram reel fields.
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[runTikTokTranscription] ${message}`);
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
