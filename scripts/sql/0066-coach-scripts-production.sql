-- Run on production as a single query after 0065-plan-cards-production.sql.

CREATE TABLE `coach_scripts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `planCardId` int,
  `title` varchar(256) NOT NULL,
  `hook` text NOT NULL,
  `body` text NOT NULL,
  `callToAction` text NOT NULL,
  `platform` varchar(32) NOT NULL DEFAULT 'both',
  `tone` varchar(64) NOT NULL DEFAULT 'conversational',
  `estimatedDuration` varchar(64),
  `contentType` varchar(64),
  `contentFormat` varchar(64),
  `formatLabel` varchar(128),
  `productionNotes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_coach_scripts_workspace` (`workspaceId`),
  CONSTRAINT `coach_scripts_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
