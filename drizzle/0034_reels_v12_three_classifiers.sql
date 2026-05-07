-- V1.2 Section 13.1: niche, hook pattern, retention tactics, rates, viral flag on reels.
ALTER TABLE `reels`
  ADD COLUMN `niche` ENUM(
    'real_estate','fitness','food','beauty','business','finance','marketing','parenting','travel','fashion','tech','education','lifestyle','spirituality','hospitality'
  ) NULL DEFAULT NULL AFTER `classifiedAt`,
  ADD COLUMN `secondaryNiche` ENUM(
    'real_estate','fitness','food','beauty','business','finance','marketing','parenting','travel','fashion','tech','education','lifestyle','spirituality','hospitality'
  ) NULL DEFAULT NULL AFTER `niche`,
  ADD COLUMN `hookPattern` ENUM(
    'question','stat','contrarian','story','direct_promise','pov','confession','listicle','comparison','mistake_reveal'
  ) NULL DEFAULT NULL AFTER `secondaryNiche`,
  ADD COLUMN `retentionTactics` json NULL DEFAULT NULL AFTER `hookPattern`,
  ADD COLUMN `threeSecondHoldRate` decimal(5,2) NULL DEFAULT NULL AFTER `retentionTactics`,
  ADD COLUMN `completionRate` decimal(5,2) NULL DEFAULT NULL AFTER `threeSecondHoldRate`,
  ADD COLUMN `engagementRate` decimal(5,4) NULL DEFAULT NULL AFTER `completionRate`,
  ADD COLUMN `viralFlag` boolean NOT NULL DEFAULT false AFTER `engagementRate`;
