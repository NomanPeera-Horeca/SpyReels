-- Featured demo catalog: widen engagement counters past signed INT max.
-- Touches only featured_demo_items (the new catalog table). Do not drizzle-kit push.
-- Apply via Railway CLI / console (Bug #63).

ALTER TABLE `featured_demo_items`
  MODIFY COLUMN `viewCount` BIGINT NOT NULL DEFAULT 0,
  MODIFY COLUMN `likeCount` BIGINT NOT NULL DEFAULT 0,
  MODIFY COLUMN `commentCount` BIGINT NOT NULL DEFAULT 0,
  MODIFY COLUMN `shareCount` BIGINT NOT NULL DEFAULT 0;
