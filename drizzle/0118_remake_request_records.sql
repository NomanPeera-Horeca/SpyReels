-- Remake request records (PR 3). Additive and idempotent; apply after a backup.
--
-- recreated_scripts gains what the creator chose in the Remake popup:
--   sourceKind (user/featured/tiktok/youtube/collected/library),
--   libraryCandidateId, choice, prismFormat, idea (the full typed idea),
--   clientRequestId (duplicate guard: the same request within 10 minutes
--   returns the existing remake instead of starting and charging a new one).
-- remake_publications: one row per saved remake draft, status 'draft' for now
--   (published / measured come later, when results are tracked).
-- own_winner_formats: ranked format list per own-winner library video (PR 4).
--
-- Nothing existing is changed or dropped. Until this runs the app keeps
-- working exactly as before and simply does not write these records.
-- Rollback:
--   DROP TABLE IF EXISTS `own_winner_formats`; DROP TABLE IF EXISTS `remake_publications`;
--   ALTER TABLE `recreated_scripts` DROP INDEX `idx_recreated_scripts_client_request`,
--     DROP COLUMN `clientRequestId`, DROP COLUMN `idea`, DROP COLUMN `prismFormat`,
--     DROP COLUMN `choice`, DROP COLUMN `libraryCandidateId`, DROP COLUMN `sourceKind`;

SET @db := DATABASE();

SET @has_sourceKind := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'recreated_scripts' AND COLUMN_NAME = 'sourceKind'
);
SET @sql_sourceKind := IF(@has_sourceKind = 0, 'ALTER TABLE `recreated_scripts` ADD COLUMN `sourceKind` varchar(16) NULL', 'SELECT 1');
PREPARE stmt_sourceKind FROM @sql_sourceKind;
EXECUTE stmt_sourceKind;
DEALLOCATE PREPARE stmt_sourceKind;

SET @has_libraryCandidateId := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'recreated_scripts' AND COLUMN_NAME = 'libraryCandidateId'
);
SET @sql_libraryCandidateId := IF(@has_libraryCandidateId = 0, 'ALTER TABLE `recreated_scripts` ADD COLUMN `libraryCandidateId` int NULL', 'SELECT 1');
PREPARE stmt_libraryCandidateId FROM @sql_libraryCandidateId;
EXECUTE stmt_libraryCandidateId;
DEALLOCATE PREPARE stmt_libraryCandidateId;

SET @has_choice := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'recreated_scripts' AND COLUMN_NAME = 'choice'
);
SET @sql_choice := IF(@has_choice = 0, 'ALTER TABLE `recreated_scripts` ADD COLUMN `choice` varchar(32) NULL', 'SELECT 1');
PREPARE stmt_choice FROM @sql_choice;
EXECUTE stmt_choice;
DEALLOCATE PREPARE stmt_choice;

SET @has_prismFormat := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'recreated_scripts' AND COLUMN_NAME = 'prismFormat'
);
SET @sql_prismFormat := IF(@has_prismFormat = 0, 'ALTER TABLE `recreated_scripts` ADD COLUMN `prismFormat` varchar(48) NULL', 'SELECT 1');
PREPARE stmt_prismFormat FROM @sql_prismFormat;
EXECUTE stmt_prismFormat;
DEALLOCATE PREPARE stmt_prismFormat;

SET @has_idea := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'recreated_scripts' AND COLUMN_NAME = 'idea'
);
SET @sql_idea := IF(@has_idea = 0, 'ALTER TABLE `recreated_scripts` ADD COLUMN `idea` text NULL', 'SELECT 1');
PREPARE stmt_idea FROM @sql_idea;
EXECUTE stmt_idea;
DEALLOCATE PREPARE stmt_idea;

SET @has_clientRequestId := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'recreated_scripts' AND COLUMN_NAME = 'clientRequestId'
);
SET @sql_clientRequestId := IF(@has_clientRequestId = 0, 'ALTER TABLE `recreated_scripts` ADD COLUMN `clientRequestId` varchar(64) NULL', 'SELECT 1');
PREPARE stmt_clientRequestId FROM @sql_clientRequestId;
EXECUTE stmt_clientRequestId;
DEALLOCATE PREPARE stmt_clientRequestId;

SET @has_idx := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @db AND TABLE_NAME = 'recreated_scripts' AND INDEX_NAME = 'idx_recreated_scripts_client_request'
);
SET @sql_idx := IF(@has_idx = 0, 'ALTER TABLE `recreated_scripts` ADD INDEX `idx_recreated_scripts_client_request` (`userId`, `clientRequestId`)', 'SELECT 1');
PREPARE stmt_idx FROM @sql_idx;
EXECUTE stmt_idx;
DEALLOCATE PREPARE stmt_idx;

CREATE TABLE IF NOT EXISTS `remake_publications` (`id` int NOT NULL AUTO_INCREMENT, `savedScriptId` int NOT NULL, `recreatedScriptId` int NULL, `workspaceId` varchar(36) NOT NULL, `userId` int NOT NULL, `socialProfileId` varchar(36) NULL, `libraryCandidateId` int NULL, `status` enum('draft','published','measured') NOT NULL DEFAULT 'draft', `publishedUrl` varchar(512) NULL, `publishedAt` timestamp NULL, `viewsObservedAt` timestamp NULL, `multiple` decimal(10,2) NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`id`), UNIQUE KEY `uniq_remake_publications_saved_script` (`savedScriptId`), KEY `idx_remake_publications_workspace` (`workspaceId`), KEY `idx_remake_publications_profile` (`socialProfileId`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `own_winner_formats` (`libraryCandidateId` int NOT NULL, `formats` json NOT NULL, `computedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`libraryCandidateId`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
