/**
 * Background transcription for a video B-roll upload.
 * Mirrors runTranscription: acquire semaphore, call transcribeReel, update row.
 * No retry loop beyond what transcribeReel already does for transient errors.
 */

import { transcribeReel } from "../services/transcribeReel";
import {
  acquireTranscriptionSlot,
  releaseTranscriptionSlot,
} from "../transcriptionSemaphore";
import type { VideoBrollTranscript } from "../../shared/videoBroll";
import {
  getVideoBrollGenerationById,
  updateVideoBrollGeneration,
} from "./db";

export async function runVideoBrollTranscription(id: number): Promise<void> {
  await acquireTranscriptionSlot();
  try {
    const row = await getVideoBrollGenerationById(id);
    if (!row) {
      console.error(`[videoBroll] runTranscription: row ${id} not found`);
      return;
    }

    await updateVideoBrollGeneration(id, { status: "transcribing" });

    const result = await transcribeReel({
      videoUrl: row.sourceVideoUrl,
      shortcode: `vbg-${id}`,
    });

    if (!result.success) {
      await updateVideoBrollGeneration(id, {
        status: "failed",
        errorMessage: result.userMessage,
      });
      return;
    }

    const transcript: VideoBrollTranscript = {
      text: result.transcript,
      segments: result.segments,
    };

    // Phase 3 will pick up from analyzing (LLM insertion points).
    await updateVideoBrollGeneration(id, {
      status: "analyzing",
      durationSeconds: Math.round(result.durationSec),
      transcript,
      errorMessage: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[videoBroll] runTranscription ${id}: ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    try {
      await updateVideoBrollGeneration(id, {
        status: "failed",
        errorMessage: message,
      });
    } catch (updateErr) {
      console.error(`[videoBroll] failed to mark row ${id} failed:`, updateErr);
    }
  } finally {
    releaseTranscriptionSlot();
  }
}
