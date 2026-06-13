-- Run on production as a single query (Railway SQL tab).

ALTER TABLE `export_jobs`
  ADD COLUMN `exportScope` enum('all','top_viral_30') NOT NULL DEFAULT 'all' AFTER `reelCountAtExport`;
