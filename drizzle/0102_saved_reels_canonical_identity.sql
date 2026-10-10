-- Idempotent. Apply AFTER backup via normal production migration process.
-- Record in __drizzle_migrations (or applied-migrations log) when applied.

SET @db := DATABASE();

SET @has_platform := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'saved_reels' AND COLUMN_NAME = 'platform'
);
SET @sql_platform := IF(
  @has_platform = 0,
  'ALTER TABLE `saved_reels` ADD COLUMN `platform` varchar(16) NULL AFTER `youtubeVideoId`',
  'SELECT ''skip platform'''
);
PREPARE stmt FROM @sql_platform; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_source := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'saved_reels' AND COLUMN_NAME = 'sourceId'
);
SET @sql_source := IF(
  @has_source = 0,
  'ALTER TABLE `saved_reels` ADD COLUMN `sourceId` varchar(128) NULL AFTER `platform`',
  'SELECT ''skip sourceId'''
);
PREPARE stmt FROM @sql_source; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'saved_reels'
    AND INDEX_NAME = 'idx_saved_reels_workspace_user_platform_source'
);
SET @sql_idx := IF(
  @has_idx = 0,
  'CREATE INDEX `idx_saved_reels_workspace_user_platform_source` ON `saved_reels` (`workspaceId`, `userId`, `platform`, `sourceId`)',
  'SELECT ''skip index'''
);
PREPARE stmt FROM @sql_idx; EXECUTE stmt; DEALLOCATE PREPARE stmt;
