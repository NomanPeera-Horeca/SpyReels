-- Saved Reels canonical identity foundation.
-- Keep these columns nullable during the backfill and dedupe transition.
-- Do not add a unique constraint until existing duplicate logical saves are audited.

ALTER TABLE `saved_reels`
  ADD COLUMN `platform` varchar(16) NULL AFTER `youtubeVideoId`,
  ADD COLUMN `sourceId` varchar(128) NULL AFTER `platform`;

CREATE INDEX `idx_saved_reels_workspace_user_platform_source`
  ON `saved_reels` (`workspaceId`, `userId`, `platform`, `sourceId`);
