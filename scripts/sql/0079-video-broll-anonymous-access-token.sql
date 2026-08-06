-- Free-tool B-roll landing: allow anonymous video previews (no login).
-- Apply manually in Railway / Render Shell SQL (or equivalent), one statement at a time.
-- Do NOT use drizzle migrate / drizzle journal for this change.

-- 1) Nullable owner columns for anonymous rows
ALTER TABLE `video_broll_generations` MODIFY COLUMN `userId` int NULL;
ALTER TABLE `video_broll_generations` MODIFY COLUMN `workspaceId` varchar(36) NULL;

-- 2) Opaque access token for anonymous poll/confirm (null for authenticated workspace rows)
ALTER TABLE `video_broll_generations` ADD COLUMN `accessToken` varchar(64) NULL;

-- 3) Lookup index for anonymous get/confirm
CREATE INDEX `idx_video_broll_generations_access_token` ON `video_broll_generations` (`accessToken`);
