-- Commit 4a — shared transcription cache for featured reels (Path B).
-- Adds inline transcription columns to `featured_reels` so the shared
-- catalog can pre-transcribe every reel once and serve every user
-- instantly. Complements migration 0028 (which taught the per-user
-- `transcriptions` table about `featuredReelId`) but this commit
-- actually skips writing into `transcriptions` for featured reels —
-- the featured catalog owns its own cache so the transcript is
-- O(reels) in storage, not O(reels × users).
--
-- Apply against STAGING via the 0028-style workflow (drizzle-kit push
-- if it's clean, otherwise the custom apply script).
--
-- `transcriptionStatus`:
--   pending     — never attempted
--   processing  — Deepgram currently running (or crashed mid-flight)
--   completed   — transcript + segments populated
--   failed      — Deepgram / network error; retry possible
--   no_speech   — valid terminal state, music/visual-only reel,
--                 transcript = "" and segments = [] by convention

ALTER TABLE `featured_reels`
  ADD COLUMN `transcriptionStatus` ENUM('pending','processing','completed','failed','no_speech') NOT NULL DEFAULT 'pending' AFTER `scrapedAt`,
  ADD COLUMN `transcript` TEXT NULL AFTER `transcriptionStatus`,
  ADD COLUMN `transcriptSegments` JSON NULL AFTER `transcript`,
  ADD COLUMN `transcribedAt` TIMESTAMP NULL AFTER `transcriptSegments`;

-- Index for the backfill + cache-fill workers so `WHERE transcriptionStatus = 'pending'`
-- scans only the pending subset instead of the full catalog.
CREATE INDEX `idx_featured_reels_transcription_status`
  ON `featured_reels` (`transcriptionStatus`);
