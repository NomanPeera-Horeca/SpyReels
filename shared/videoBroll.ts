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

/**
 * Background video upload tracking (independent of main pipeline status).
 * - pending: dual-upload path; video not confirmed yet
 * - uploading: client is PUTting video
 * - completed: video confirmed in R2
 * - failed: video PUT/confirm failed (main job may still succeed via audio)
 * - skipped: no separate audio extract; video is the sole transcription source
 */
export const VIDEO_BROLL_VIDEO_UPLOAD_STATUSES = [
  "pending",
  "uploading",
  "completed",
  "failed",
  "skipped",
] as const;

export type VideoBrollVideoUploadStatus =
  (typeof VIDEO_BROLL_VIDEO_UPLOAD_STATUSES)[number];

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

/** One suggested B-roll insertion cut from transcript analysis. */
export type VideoBrollInsertionPoint = {
  timestampSeconds: number;
  reason: string;
  searchQuery: string;
  pexelsClipUrl?: string | null;
  pexelsClipId?: string | number | null;
};

export const VIDEO_BROLL_MAX_BYTES = 200 * 1024 * 1024;

/** Cap for demuxed audio upload (AAC in MP4/.m4a). */
export const VIDEO_BROLL_AUDIO_MAX_BYTES = 20 * 1024 * 1024;

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

/** MIME types accepted for demuxed audio uploads. */
export const VIDEO_BROLL_ALLOWED_AUDIO_MIME = [
  "audio/mp4",
  "audio/m4a",
] as const;

export type VideoBrollAllowedAudioMime =
  (typeof VIDEO_BROLL_ALLOWED_AUDIO_MIME)[number];

export const VIDEO_BROLL_AUDIO_EXT_BY_MIME: Record<
  VideoBrollAllowedAudioMime,
  string
> = {
  "audio/mp4": ".m4a",
  "audio/m4a": ".m4a",
};
