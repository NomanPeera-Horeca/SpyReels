-- Bug #63: apply manually in Railway SQL (or equivalent), one statement at a time.
-- Do NOT use drizzle migrate / drizzle journal for this change.
-- Soft-delete column for carousel remakes (Your Carousels hide + delete).

-- 1) Soft delete timestamp (NULL = active)
ALTER TABLE `carousel_remakes`
  ADD COLUMN `deletedAt` timestamp NULL DEFAULT NULL
  AFTER `errorMessage`;
