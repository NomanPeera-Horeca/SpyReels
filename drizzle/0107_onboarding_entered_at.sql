-- Server record that an account has opened onboarding.
-- Null means first signup (setup never started). A timestamp means interrupted
-- until completed or skipped is set. Existing rows are stamped so customers
-- who already use the product are not pulled into onboarding. Accounts
-- created after this statement stay NULL until they open onboarding.
-- Idempotent. Apply through the normal production migration process only, after backup.

SET @db := DATABASE();

SET @has_entered := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'onboardingEnteredAt'
);
SET @sql_entered := IF(
  @has_entered = 0,
  'ALTER TABLE `users` ADD COLUMN `onboardingEnteredAt` DATETIME NULL AFTER `onboardingSkippedAt`',
  'SELECT 1'
);
PREPARE stmt_entered FROM @sql_entered;
EXECUTE stmt_entered;
DEALLOCATE PREPARE stmt_entered;

-- Backfill only on the run that adds the column. A later re-run must not
-- stamp accounts that signed up after this correction.
SET @sql_backfill := IF(
  @has_entered = 0,
  'UPDATE `users` SET `onboardingEnteredAt` = UTC_TIMESTAMP() WHERE `onboardingEnteredAt` IS NULL',
  'SELECT 1'
);
PREPARE stmt_backfill FROM @sql_backfill;
EXECUTE stmt_backfill;
DEALLOCATE PREPARE stmt_backfill;
