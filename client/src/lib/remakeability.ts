/**
 * Bug #57 Tier 1: heuristic "not remakeable" from transcript text.
 * Bug #57 Tier 2: DB-first gating via classifier `suggestedAction` when present.
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
  startedAt?: string | Date | null;
  /** saved.list summary fields (no transcript/segments payload) */
  hasSpeech?: boolean;
  wordCount?: number;
  musicHeavy?: boolean;
} | null | undefined;

/** Tier 2 fields from reels / featured_reels (nullable until classified). */
export type ReelClassificationLike = {
  classifiedAt?: Date | string | null;
  suggestedAction?: string | null;
  contentType?: string | null;
  remakeabilityScore?: number | null;
  classificationReason?: string | null;
} | null | undefined;

function combinedTranscriptText(t: NonNullable<TranscriptionLike>): string {
  const text = String(t.transcript ?? "").trim();
  const segs = Array.isArray(t.segments)
    ? (t.segments as { text?: string }[])
    : [];
  const segmentText = segs.map((s) => String(s?.text ?? "")).join(" ").trim();
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

  if (typeof t.wordCount === "number") {
    if (t.wordCount === 0) return { notRemakeable: false };
    if (t.wordCount < 8) {
      return { notRemakeable: true, reason: "too_short" };
    }
    if (t.musicHeavy) {
      return { notRemakeable: true, reason: "music_heavy" };
    }
    return { notRemakeable: false };
  }

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

/**
 * Tier 2: when classifier has run (`classifiedAt` + `suggestedAction`), honor DB.
 * Otherwise callers should fall back to `transcriptionIsNotRemakeable`.
 */
export function remakeabilityFromClassification(
  c: ReelClassificationLike
): NotRemakeableResult | null {
  if (
    c == null ||
    c.classifiedAt == null ||
    !c.suggestedAction ||
    typeof c.suggestedAction !== "string"
  ) {
    return null;
  }
  const actionable = c.suggestedAction === "make_version";
  return { notRemakeable: !actionable };
}

/** Prefer Tier 2 when present; otherwise Tier 1 heuristics on transcript. */
export function mergeRemakeability(
  transcription: TranscriptionLike,
  classification?: ReelClassificationLike
): NotRemakeableResult {
  const fromDb = remakeabilityFromClassification(classification ?? null);
  if (fromDb != null) return fromDb;
  return transcriptionIsNotRemakeable(transcription);
}

export function inspirationPanelCopy(reason: NotRemakeableReason | undefined): {
  body: string;
} {
  if (reason === "too_short") {
    return {
      body:
        "This transcript is too short to build a full remake from. Use the reel as loose inspiration, or copy the link and save it for later.",
    };
  }
  if (reason === "music_heavy") {
    return {
      body:
        "This audio looks like music or non-narration, not enough spoken words to generate a fresh script. Keep the reel as visual or timing inspiration instead.",
    };
  }
  return {
    body:
      "We cannot generate a scripted remake from this transcript. Use the reel as inspiration instead.",
  };
}
