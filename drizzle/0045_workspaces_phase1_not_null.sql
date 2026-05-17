-- Phase 1, Step 5: Enforce NOT NULL on workspaceId after backfill (staging + production verified).
-- transcriptions.workspaceId stays NULLABLE forever (featured-only + orphan rows).

ALTER TABLE `scrape_jobs`
  MODIFY COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE `reels`
  MODIFY COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE `saved_reels`
  MODIFY COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE `saved_scripts`
  MODIFY COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE `script_versions`
  MODIFY COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE `script_tags`
  MODIFY COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE `script_tag_assignments`
  MODIFY COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE `script_ideas`
  MODIFY COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE `recreated_scripts`
  MODIFY COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;

ALTER TABLE `collected_reels`
  MODIFY COLUMN `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL;
