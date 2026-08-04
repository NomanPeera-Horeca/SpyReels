-- Bug #63: apply manually in Railway SQL (or equivalent), one statement at a time.
-- Do NOT use drizzle migrate / drizzle journal for this change.
-- Adds monthly B-roll generation counter (gates generation runs, NOT clip downloads).

-- 1) Add column with default 0 for existing rows
ALTER TABLE `monthly_usage`
  ADD COLUMN `brollGenerationCount` int NOT NULL DEFAULT 0
  AFTER `exportCount`;
