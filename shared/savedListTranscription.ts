/**
 * Lightweight transcription payload for saved.list and other list views.
 * Omits segment arrays and full transcript text to keep page loads fast.
 */

export type SavedListTranscriptionSummary = {
  status: "pending" | "processing" | "completed" | "failed";
  startedAt?: string | Date | null;
  hasSpeech: boolean;
  wordCount: number;
  musicHeavy: boolean;
};

type TranscriptionRowLike = {
  status?: string | null;
  transcript?: string | null;
  segments?: unknown;
  startedAt?: string | Date | null;
};

function combinedTranscriptText(t: TranscriptionRowLike): string {
  const text = String(t.transcript ?? "").trim();
  const segs = Array.isArray(t.segments)
    ? (t.segments as { text?: string }[])
    : [];
  const segmentText = segs.map((s) => String(s?.text ?? "")).join(" ").trim();
  return [text, segmentText].filter(Boolean).join(" ").trim();
}

function detectMusicHeavy(combined: string): boolean {
  const lower = combined.toLowerCase();
  return /\[music\]|\(music\)|♪|♫|background music|instrumental|no speech|no vocals|no voice|no narration|sound effect|sfx only|beat(s)? only|^\s*music\s*$/m.test(
    lower
  );
}

export function toSavedListTranscriptionSummary(
  tx: TranscriptionRowLike | null | undefined
): SavedListTranscriptionSummary | undefined {
  if (!tx?.status) return undefined;

  const status = tx.status as SavedListTranscriptionSummary["status"];
  const combined = combinedTranscriptText(tx);
  const wordCount = combined ? combined.split(/\s+/).filter(Boolean).length : 0;

  return {
    status,
    startedAt: tx.startedAt ?? null,
    hasSpeech: wordCount > 0,
    wordCount,
    musicHeavy: combined.length > 0 && detectMusicHeavy(combined),
  };
}
