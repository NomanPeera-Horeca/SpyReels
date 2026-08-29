-- Carousel remake worker stage for Studio progress UI.
-- Railway console: run this statement by itself (one paste).

ALTER TABLE `carousel_remakes`
  ADD COLUMN `progressStage` varchar(32) DEFAULT NULL AFTER `status`;
