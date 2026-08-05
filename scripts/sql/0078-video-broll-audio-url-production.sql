-- Bug #63 Phase 3 follow-up: apply manually in Railway / Render Shell SQL (or equivalent), one statement at a time.
-- Do NOT use drizzle migrate / drizzle journal for this change.
-- Client-side audio extract: store sourceAudioUrl + track background video upload separately from main pipeline status.

-- 1) Add sourceAudioUrl (R2 public URL for demuxed .m4a; null when fallback uses video only)
ALTER TABLE `video_broll_generations` ADD COLUMN `sourceAudioUrl` varchar(1024) NULL;

-- 2) Add videoUploadStatus (background video track; independent of main status)
-- pending: dual-upload path, video not confirmed yet
-- uploading: client is PUTting video (optional intermediate)
-- completed: video confirmed in R2
-- failed: video PUT/confirm failed (does not fail main job if audio transcribed)
-- skipped: no separate audio extract; video is the sole transcription source (fallback)
ALTER TABLE `video_broll_generations` ADD COLUMN `videoUploadStatus` enum('pending','uploading','completed','failed','skipped') NULL;
