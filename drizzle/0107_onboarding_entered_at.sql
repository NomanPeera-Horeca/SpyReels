-- Additive record that an account has opened onboarding.
--
-- NULL means first signup. A timestamp means the account already opened
-- onboarding (interrupted) until completed or skipped is set.
--
-- This file only adds users.onboardingEnteredAt. It does not change
-- onboardingCompletedAt, onboardingSkippedAt, niche selections,
-- descriptions, creators, or any personalization table.
--
-- Existing customers, created before this script captures its cutoff, are
-- stamped once so they are not sent through onboarding again. Accounts
-- created at or after that cutoff stay NULL and enter onboarding.
-- A later run stamps nobody when any onboardingEnteredAt is already set,
-- so a genuine new signup stays NULL and a real open time is not replaced.
-- If the stamp step fails, re-run this file before more signups. A late
-- re-run would treat accounts created before the new cutoff as existing.
--
-- Idempotent. Apply through the production migration process only, after backup.

SET @db := DATABASE();
SET @cutoff := UTC_TIMESTAMP();

SET @has_entered := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'users' AND COLUMN_NAME = 'onboardingEnteredAt'
);
SET @sql_entered := IF(
  @has_entered = 0,
  'ALTER TABLE `users` ADD COLUMN `onboardingEnteredAt` DATETIME NULL',
  'SELECT 1'
);
PREPARE stmt_entered FROM @sql_entered;
EXECUTE stmt_entered;
DEALLOCATE PREPARE stmt_entered;

-- 1 when the column has never been filled. Any existing stamp means a
-- previous run already protected current customers.
SET @needs_backfill := (
  SELECT IF(COUNT(*) = 0, 1, 0)
  FROM `users`
  WHERE `onboardingEnteredAt` IS NOT NULL
);
SET @cutoff_text := DATE_FORMAT(@cutoff, '%Y-%m-%d %H:%i:%s');
SET @sql_backfill := IF(
  @needs_backfill = 1,
  CONCAT(
    'UPDATE `users` SET `onboardingEnteredAt` = ''',
    @cutoff_text,
    ''' WHERE `onboardingEnteredAt` IS NULL AND `createdAt` < ''',
    @cutoff_text,
    ''''
  ),
  'SELECT 1'
);
PREPARE stmt_backfill FROM @sql_backfill;
EXECUTE stmt_backfill;
DEALLOCATE PREPARE stmt_backfill;
