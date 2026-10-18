-- Account theme preference (light | dark | system). Nullable: existing rows stay NULL,
-- which keeps today's behavior. New accounts are written as 'light' by upsertUser.
-- Idempotent. Apply through the normal production migration process only, after backup.

SET @db := DATABASE();

SET @has_theme := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'user_preferences' AND COLUMN_NAME = 'theme'
);
SET @sql_theme := IF(
  @has_theme = 0,
  'ALTER TABLE `user_preferences` ADD COLUMN `theme` varchar(16) NULL AFTER `timezone`',
  'SELECT 1'
);
PREPARE stmt_theme FROM @sql_theme;
EXECUTE stmt_theme;
DEALLOCATE PREPARE stmt_theme;
