-- Brand Coach v2: replicability sub-score + prompt/rubric version gate.
-- Old rows keep scoreVersion = 1 so the app re-scores on next Score click.

ALTER TABLE brand_coach_scores ADD COLUMN replicabilityScore int DEFAULT NULL;
ALTER TABLE brand_coach_scores ADD COLUMN scoreVersion int NOT NULL DEFAULT 1;
