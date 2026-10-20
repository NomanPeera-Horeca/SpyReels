-- Remember the previous status when a personalization item is removed, so Undo
-- can restore it. The onboarding state read selects this column. Existing rows
-- stay NULL. Idempotent. Apply through the production migration process only,
-- after backup. Do not drop personalization_items.

SET @db := DATABASE();

SET @has_col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'personalization_items'
    AND COLUMN_NAME = 'dismissedFromStatus'
);
SET @sql_col := IF(
  @has_col = 0,
  'ALTER TABLE `personalization_items` ADD COLUMN `dismissedFromStatus` enum(''suggested'',''confirmed'') NULL AFTER `status`',
  'SELECT 1'
);
PREPARE stmt_col FROM @sql_col;
EXECUTE stmt_col;
DEALLOCATE PREPARE stmt_col;

SET @has_chk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = @db
    AND TABLE_NAME = 'personalization_items'
    AND CONSTRAINT_NAME = 'chk_personalization_items_restore_memory'
);
SET @sql_chk := IF(
  @has_chk = 0,
  'ALTER TABLE `personalization_items` ADD CONSTRAINT `chk_personalization_items_restore_memory` CHECK (`dismissedFromStatus` IS NULL OR `status` IN (''dismissed'', ''superseded''))',
  'SELECT 1'
);
PREPARE stmt_chk FROM @sql_chk;
EXECUTE stmt_chk;
DEALLOCATE PREPARE stmt_chk;
