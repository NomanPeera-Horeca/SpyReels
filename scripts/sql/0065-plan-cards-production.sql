-- Run on production as a single query (Railway SQL tab).

CREATE TABLE `plan_cards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `day` int NOT NULL,
  `funnelStage` varchar(16) NOT NULL,
  `contentFormat` varchar(32) NOT NULL,
  `platform` varchar(32) NOT NULL,
  `title` text NOT NULL,
  `hook` text NOT NULL,
  `angle` text NOT NULL,
  `filmingLocation` text NOT NULL,
  `researchSignal` text,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `goal` varchar(32),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_plan_cards_workspace` (`workspaceId`),
  CONSTRAINT `plan_cards_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
