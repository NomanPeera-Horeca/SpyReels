-- Additive outside-spy-window flags for TikTok / YouTube min-sample backfill.
-- Railway console: run EACH statement separately (one paste per statement).

ALTER TABLE `tiktok_videos`
  ADD COLUMN `outsideSpyWindow` BOOLEAN NULL;

ALTER TABLE `youtube_videos`
  ADD COLUMN `outsideSpyWindow` BOOLEAN NULL;
