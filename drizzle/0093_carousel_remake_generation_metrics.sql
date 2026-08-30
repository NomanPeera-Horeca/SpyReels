-- Carousel remake generation metrics (Phase 0 instrumentation).
-- Railway console: run this statement by itself (one paste).

ALTER TABLE `carousel_remakes`
  ADD COLUMN `generationMetricsJson` json DEFAULT NULL;
