-- Spark Deck: user-captured ideas (day=0) separate from SpyReels 30-day calendar picks.
-- Railway/production: run scripts/sql/0069-plan-cards-spark-deck-production.sql (one statement only).

ALTER TABLE plan_cards
  ADD COLUMN sourceType varchar(16) NOT NULL DEFAULT 'ai_pick' AFTER goal,
  ADD COLUMN sourceReelId int NULL AFTER sourceType,
  ADD COLUMN sourceFeaturedReelId int NULL AFTER sourceReelId,
  ADD COLUMN sourceReelHandle varchar(128) NULL AFTER sourceFeaturedReelId,
  ADD COLUMN userRawNote text NULL AFTER sourceReelHandle;

-- Optional local-only follow-up (do not paste with ALTER in Railway):
-- UPDATE plan_cards SET sourceType = 'ai_pick' WHERE day > 0;
