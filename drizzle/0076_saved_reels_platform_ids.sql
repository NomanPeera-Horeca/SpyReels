-- Additive TikTok / YouTube save support on saved_reels.
-- Railway console: run EACH statement separately (one paste per statement).

ALTER TABLE `saved_reels`
  ADD COLUMN `tiktokVideoId` INT NULL AFTER `featuredReelId`;

ALTER TABLE `saved_reels`
  ADD COLUMN `youtubeVideoId` INT NULL AFTER `tiktokVideoId`;

CREATE INDEX `idx_saved_reels_tiktok_video`
  ON `saved_reels` (`tiktokVideoId`);

CREATE INDEX `idx_saved_reels_youtube_video`
  ON `saved_reels` (`youtubeVideoId`);

ALTER TABLE `saved_reels`
  ADD UNIQUE KEY `uniq_saved_reels_workspace_user_tiktok` (`workspaceId`, `userId`, `tiktokVideoId`);

ALTER TABLE `saved_reels`
  ADD UNIQUE KEY `uniq_saved_reels_workspace_user_youtube` (`workspaceId`, `userId`, `youtubeVideoId`);
