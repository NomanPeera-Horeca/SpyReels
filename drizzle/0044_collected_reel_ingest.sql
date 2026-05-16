-- Collected Reels durable ingest (retry scheduling, provider tracking)
ALTER TABLE `collected_reels`
  ADD COLUMN `fetchAttempts` int NOT NULL DEFAULT 0 AFTER `errorMessage`,
  ADD COLUMN `lastFetchAt` datetime NULL AFTER `fetchAttempts`,
  ADD COLUMN `nextFetchAt` datetime NULL AFTER `lastFetchAt`,
  ADD COLUMN `fetchProvider` varchar(64) NULL AFTER `nextFetchAt`;

CREATE INDEX `idx_collected_reels_ingest_due` ON `collected_reels` (`status`, `nextFetchAt`, `fetchAttempts`);
