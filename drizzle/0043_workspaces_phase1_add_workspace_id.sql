-- Phase 1, Step 3: Add nullable workspaceId to user-owned tables.
-- Backfill in Step 4. NOT NULL enforcement in Step 5 (except transcriptions).
-- workspaceId charset/collation matches workspaces.id for FK compatibility.

-- 1. scrape_jobs
ALTER TABLE `scrape_jobs`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER `userId`,
  ADD KEY `idx_scrape_jobs_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_scrape_jobs_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;

-- 2. reels
ALTER TABLE `reels`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER `jobId`,
  ADD KEY `idx_reels_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_reels_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;

-- 3. saved_reels
ALTER TABLE `saved_reels`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER `userId`,
  ADD KEY `idx_saved_reels_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_saved_reels_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  ADD UNIQUE KEY `uniq_saved_reels_workspace_user_reel` (`workspaceId`, `userId`, `reelId`),
  ADD UNIQUE KEY `uniq_saved_reels_workspace_user_featured` (`workspaceId`, `userId`, `featuredReelId`);

-- 4. saved_scripts
ALTER TABLE `saved_scripts`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER `userId`,
  ADD KEY `idx_saved_scripts_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_saved_scripts_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  ADD UNIQUE KEY `uniq_saved_scripts_workspace_user_reel` (`workspaceId`, `userId`, `reelId`),
  ADD UNIQUE KEY `uniq_saved_scripts_workspace_user_recreated` (`workspaceId`, `userId`, `recreatedScriptId`);

-- 5. script_versions
ALTER TABLE `script_versions`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER `scriptId`,
  ADD KEY `idx_script_versions_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_script_versions_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;

-- 6. script_tags
ALTER TABLE `script_tags`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER `userId`,
  ADD KEY `idx_script_tags_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_script_tags_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;

-- 7. script_tag_assignments
ALTER TABLE `script_tag_assignments`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER `scriptId`,
  ADD KEY `idx_script_tag_assignments_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_script_tag_assignments_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;

-- 8. script_ideas
ALTER TABLE `script_ideas`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER `userId`,
  ADD KEY `idx_script_ideas_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_script_ideas_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;

-- 9. recreated_scripts
ALTER TABLE `recreated_scripts`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER `userId`,
  ADD KEY `idx_recreated_scripts_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_recreated_scripts_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;

-- 10. collected_reels
ALTER TABLE `collected_reels`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL AFTER `userId`,
  ADD KEY `idx_collected_reels_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_collected_reels_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;

-- 11. transcriptions
-- workspaceId stays NULLABLE permanently (Step 5 does not enforce NOT NULL here).
-- Backfill sets workspaceId from parent reels.workspaceId when reelId IS NOT NULL.
-- Featured-catalog rows (reelId NULL, featuredReelId set) keep workspaceId NULL.
ALTER TABLE `transcriptions`
  ADD COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NULL COMMENT 'Nullable forever. Set from reels.workspaceId when reelId IS NOT NULL; NULL for featured-only catalog rows.' AFTER `featuredReelId`,
  ADD KEY `idx_transcriptions_workspace` (`workspaceId`),
  ADD CONSTRAINT `fk_transcriptions_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE;
