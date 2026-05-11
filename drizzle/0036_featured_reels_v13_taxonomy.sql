-- V1.3: per-reel taxonomy on featured catalog (nullable until backfill).
ALTER TABLE `featured_reels`
  ADD COLUMN `niche` ENUM(
    'real_estate','fitness','food','beauty','business','finance','marketing','parenting','travel','fashion','tech','education','lifestyle','spirituality','hospitality'
  ) NULL DEFAULT NULL AFTER `classifiedAt`,
  ADD COLUMN `hookPattern` ENUM(
    'question','stat','contrarian','story','direct_promise','pov','confession','listicle','comparison','mistake_reveal'
  ) NULL DEFAULT NULL AFTER `niche`,
  ADD COLUMN `confidence` TINYINT UNSIGNED NULL DEFAULT NULL AFTER `hookPattern`,
  ADD COLUMN `viralFlag` boolean NOT NULL DEFAULT false AFTER `confidence`;
