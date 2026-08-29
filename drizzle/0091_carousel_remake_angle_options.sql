-- Carousel Studio Phase 1: store angle options + selection on remake rows.
-- Railway console: run EACH statement separately (one paste per statement).

ALTER TABLE `carousel_remakes`
  ADD COLUMN `angleOptionsJson` json DEFAULT NULL AFTER `slotValuesJson`;

ALTER TABLE `carousel_remakes`
  ADD COLUMN `selectedAngleIndex` int DEFAULT NULL AFTER `angleOptionsJson`;
