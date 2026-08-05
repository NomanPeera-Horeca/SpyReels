/**
 * Phase 3: after transcription leaves status=analyzing, run LLM insertion
 * analysis + Pexels matching, then write completed/failed.
 */

import type { VideoBrollTranscript } from "../../shared/videoBroll";
import { analyzeInsertionPoints } from "./analyzeInsertionPoints";
import {
  getVideoBrollGenerationById,
  updateVideoBrollGeneration,
} from "./db";
import { matchPexelsForInsertions } from "./matchPexelsForInsertions";

export async function runVideoBrollAnalysis(id: number): Promise<void> {
  try {
    const row = await getVideoBrollGenerationById(id);
    if (!row) {
      console.error(`[videoBroll] runAnalysis: row ${id} not found`);
      return;
    }

    if (row.status !== "analyzing") {
      console.warn(
        `[videoBroll] runAnalysis: row ${id} status is "${row.status}", expected analyzing`
      );
    }

    const transcript = row.transcript as VideoBrollTranscript | null;
    const segments = transcript?.segments;
    if (!Array.isArray(segments) || segments.length === 0) {
      await updateVideoBrollGeneration(id, {
        status: "failed",
        errorMessage: "No transcript segments available for analysis",
        internalErrorDetail:
          "No transcript segments available for analysis (transcript missing or empty segments)",
      });
      return;
    }

    const llmPoints = await analyzeInsertionPoints({
      segments,
      durationSeconds: row.durationSeconds,
    });

    const insertionPoints = await matchPexelsForInsertions(llmPoints);

    await updateVideoBrollGeneration(id, {
      status: "completed",
      insertionPoints,
      errorMessage: null,
      internalErrorDetail: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[videoBroll] runAnalysis ${id}: ${message}`);
    if (error instanceof Error && error.stack) {
      console.error(error.stack);
    }
    try {
      await updateVideoBrollGeneration(id, {
        status: "failed",
        errorMessage: message,
        internalErrorDetail:
          error instanceof Error ? error.stack ?? error.message : message,
      });
    } catch (updateErr) {
      console.error(`[videoBroll] failed to mark row ${id} failed:`, updateErr);
    }
  }
}
