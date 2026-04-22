ALTER TABLE scrape_jobs
  ADD COLUMN classifiedNicheSlug VARCHAR(64) NULL,
  ADD COLUMN classifiedConfidence ENUM('high','medium','low') NULL,
  ADD COLUMN classifiedAt DATETIME NULL;
