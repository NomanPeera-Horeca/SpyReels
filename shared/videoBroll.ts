/** Shared types for video B-roll upload + transcription pipeline. */

export const VIDEO_BROLL_STATUSES = [
  "pending",
  "uploading",
  "transcribing",
  "analyzing",
  "completed",
  "failed",
] as const;

export type VideoBrollStatus = (typeof VIDEO_BROLL_STATUSES)[number];

/** Utterance segment from Deepgram via transcribeReel. */
export type VideoBrollTranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

/** Stored in video_broll_generations.transcript JSON. */
export type VideoBrollTranscript = {
  text: string;
  segments: VideoBrollTranscriptSegment[];
};

export const VIDEO_BROLL_MAX_BYTES = 200 * 1024 * 1024;

export const VIDEO_BROLL_ALLOWED_MIME = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export type VideoBrollAllowedMime = (typeof VIDEO_BROLL_ALLOWED_MIME)[number];

export const VIDEO_BROLL_EXT_BY_MIME: Record<VideoBrollAllowedMime, string> = {
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
};
