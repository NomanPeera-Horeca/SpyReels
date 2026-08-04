-- Bug #63: apply manually in Railway SQL (or equivalent), one statement at a time.
-- Do NOT use drizzle migrate / drizzle journal for this change.
-- Persists B-roll generation results (beats + clips + theme) per saved script.

-- 1) Create table (one row per script; upsert on regenerate)
CREATE TABLE `broll_generations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `scriptId` int NOT NULL,
  `beatsJson` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_broll_generations_script` (`scriptId`),
  KEY `idx_broll_generations_workspace` (`workspaceId`),
  CONSTRAINT `broll_generations_scriptId_saved_scripts_id_fk` FOREIGN KEY (`scriptId`) REFERENCES `saved_scripts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `broll_generations_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
);
