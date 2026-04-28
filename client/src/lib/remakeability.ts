/**
 * Bug #57 Tier 1: client-only detection of transcripts that are not suitable
 * for "Make My Version" (music-heavy, too little speech, etc.). No DB/API.
 */

export type NotRemakeableReason = "music_heavy" | "too_short";

export type NotRemakeableResult = {
  notRemakeable: boolean;
  reason?: NotRemakeableReason;
};

export type TranscriptionLike = {
  status?: string | null;
  transcript?: string | null;
  segments?: unknown;
} | null | undefined;

function combinedTranscriptText(t: NonNullable<TranscriptionLike>): string {
  const text = String(t.transcript ?? "").trim();
  const segs = Array.isArray(t.segments)
    ? (t.segments as { text?: string }[])
    : [];
  const segmentText = segs.map(s => String(s?.text ?? "")).join(" ").trim();
  const combined = [text, segmentText].filter(Boolean).join(" ").trim();
  return combined;
}

/** Heuristic mirrors Dashboard `transcriptionIsNoSpeech`: empty completion stays out of this helper. */
export function transcriptionIsNotRemakeable(
  t: TranscriptionLike
): NotRemakeableResult {
  if (t == null) return { notRemakeable: false };
  const st = t.status;
  if (st === "processing" || st === "pending") return { notRemakeable: false };
  if (st === "failed") return { notRemakeable: false };
  if (st !== "completed") return { notRemakeable: false };

  const combined = combinedTranscriptText(t);
  if (!combined) return { notRemakeable: false };

  const wordCount = combined.split(/\s+/).filter(Boolean).length;
  if (wordCount < 8) {
    return { notRemakeable: true, reason: "too_short" };
  }

  const lower = combined.toLowerCase();
  const musicHeavy =
    /\[music\]|\(music\)|♪|♫|background music|instrumental|no speech|no vocals|no voice|no narration|sound effect|sfx only|beat(s)? only|^\s*music\s*$/m.test(
      lower
    );
  if (musicHeavy) {
    return { notRemakeable: true, reason: "music_heavy" };
  }

  return { notRemakeable: false };
}

export function inspirationPanelCopy(reason: NotRemakeableReason | undefined): {
  body: string;
} {
  if (reason === "too_short") {
    return {
      body: "This transcript is too short to build a full remake from. Use the reel as loose inspiration, or copy the link and save it for later.",
    };
  }
  if (reason === "music_heavy") {
    return {
      body: "This audio looks like music or non-narration, not enough spoken words to generate a fresh script. Keep the reel as visual or timing inspiration instead.",
    };
  }
  return {
    body: "We cannot generate a scripted remake from this transcript. Use the reel as inspiration instead.",
  };
}
