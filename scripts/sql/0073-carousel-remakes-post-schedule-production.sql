-- Bug #63: apply manually in Railway SQL (or equivalent), one statement at a time.
-- Do NOT use drizzle migrate / drizzle journal for this change.
-- Adds planned post date/time on carousel remakes (user reference only; NOT Instagram auto-post).

-- 1) Planned post date
ALTER TABLE `carousel_remakes`
  ADD COLUMN `postDate` timestamp NULL DEFAULT NULL
  AFTER `imageUrlsJson`;

-- 2) Preferred posting time HH:MM
ALTER TABLE `carousel_remakes`
  ADD COLUMN `postTime` varchar(8) NULL DEFAULT NULL
  AFTER `postDate`;
