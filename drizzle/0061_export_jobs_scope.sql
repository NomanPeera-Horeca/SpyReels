-- Export scope: all reels vs top 30 viral performers for the account
ALTER TABLE `export_jobs`
  ADD COLUMN `exportScope` enum('all','top_viral_30') NOT NULL DEFAULT 'all' AFTER `reelCountAtExport`;
