-- Bug #63 follow-up: apply manually in Railway / Render Shell SQL (or equivalent), one statement at a time.
-- Do NOT use drizzle migrate / drizzle journal for this change.
-- Stores technical failure detail separately from the friendly errorMessage.

-- 1) Add internalErrorDetail column
ALTER TABLE `video_broll_generations` ADD COLUMN `internalErrorDetail` TEXT NULL;
