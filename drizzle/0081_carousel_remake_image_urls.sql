-- Resolved photo URLs for carousel remakes with image slots.
-- Railway console: run as a single statement.

ALTER TABLE `carousel_remakes`
  ADD COLUMN `imageUrlsJson` json DEFAULT NULL AFTER `aspectRatioOverride`;
