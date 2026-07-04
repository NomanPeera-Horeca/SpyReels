-- Run on production in Railway SQL tab: ONE statement only (no UPDATE in same paste).
-- The UPDATE below is optional; DEFAULT 'ai_pick' backfills existing rows automatically.

ALTER TABLE plan_cards
  ADD COLUMN sourceType varchar(16) NOT NULL DEFAULT 'ai_pick' AFTER goal,
  ADD COLUMN sourceReelId int NULL AFTER sourceType,
  ADD COLUMN sourceFeaturedReelId int NULL AFTER sourceReelId,
  ADD COLUMN sourceReelHandle varchar(128) NULL AFTER sourceFeaturedReelId,
  ADD COLUMN userRawNote text NULL AFTER sourceReelHandle;
