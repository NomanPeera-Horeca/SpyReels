-- SUPERSEDED by drizzle/0101_saved_reels_canonical_identity.sql.
-- Do not apply this file. It collides with 0094_carousel_remake_slot_style_overrides.sql
-- and was never recorded on production. Keep for history only.
--
-- Saved Reels canonical identity foundation.
-- Keep these columns nullable during the backfill and dedupe transition.
-- Do not add a unique constraint until existing duplicate logical saves are audited.

ALTER TABLE `saved_reels`
  ADD COLUMN `platform` varchar(16) NULL AFTER `youtubeVideoId`,
  ADD COLUMN `sourceId` varchar(128) NULL AFTER `platform`;

CREATE INDEX `idx_saved_reels_workspace_user_platform_source`
  ON `saved_reels` (`workspaceId`, `userId`, `platform`, `sourceId`);
