-- Carousel remake customization columns + user Instagram handle.
-- Railway console: run EACH statement separately (one paste per statement).

ALTER TABLE `carousel_remakes`
  ADD COLUMN `slideStructureJson` json DEFAULT NULL AFTER `slotValuesJson`;

ALTER TABLE `carousel_remakes`
  ADD COLUMN `designOverrideJson` json DEFAULT NULL AFTER `slideStructureJson`;

ALTER TABLE `carousel_remakes`
  ADD COLUMN `aspectRatioOverride` varchar(8) DEFAULT NULL AFTER `designOverrideJson`;

ALTER TABLE `users`
  ADD COLUMN `instagramHandle` varchar(64) DEFAULT NULL AFTER `targetAudience`;
