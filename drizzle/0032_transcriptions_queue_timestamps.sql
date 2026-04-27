-- Bug #24: distinguish "queued" (row created, waiting for a worker slot) from
-- "transcribing" (worker has started). Enables honest UI and zombie-sweeper logic.

ALTER TABLE `transcriptions`
  ADD COLUMN `queuedAt` TIMESTAMP NULL AFTER `errorMessage`,
  ADD COLUMN `startedAt` TIMESTAMP NULL AFTER `queuedAt`;

UPDATE `transcriptions`
SET `queuedAt` = `createdAt`
WHERE `queuedAt` IS NULL;
