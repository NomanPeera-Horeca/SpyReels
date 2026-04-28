-- Bug #57 Tier 2: AI transcript classification cache (nullable, idempotent additive columns).
ALTER TABLE `featured_reels`
  ADD COLUMN `contentType` ENUM(
    'educational','story','opinion','personal','reaction','skit','music','other'
  ) NULL DEFAULT NULL AFTER `transcribedAt`,
  ADD COLUMN `remakeabilityScore` TINYINT NULL DEFAULT NULL AFTER `contentType`,
  ADD COLUMN `suggestedAction` ENUM(
    'make_version','save_inspiration','view_only'
  ) NULL DEFAULT NULL AFTER `remakeabilityScore`,
  ADD COLUMN `classificationReason` VARCHAR(255) NULL DEFAULT NULL AFTER `suggestedAction`,
  ADD COLUMN `classifiedAt` TIMESTAMP NULL DEFAULT NULL AFTER `classificationReason`;

ALTER TABLE `reels`
  ADD COLUMN `contentType` ENUM(
    'educational','story','opinion','personal','reaction','skit','music','other'
  ) NULL DEFAULT NULL AFTER `createdAt`,
  ADD COLUMN `remakeabilityScore` TINYINT NULL DEFAULT NULL AFTER `contentType`,
  ADD COLUMN `suggestedAction` ENUM(
    'make_version','save_inspiration','view_only'
  ) NULL DEFAULT NULL AFTER `remakeabilityScore`,
  ADD COLUMN `classificationReason` VARCHAR(255) NULL DEFAULT NULL AFTER `suggestedAction`,
  ADD COLUMN `classifiedAt` TIMESTAMP NULL DEFAULT NULL AFTER `classificationReason`;
