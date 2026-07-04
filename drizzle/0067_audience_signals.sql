-- Run as a single query (Replit/Railway SQL tab does not allow multiple statements).

CREATE TABLE IF NOT EXISTS `audience_signals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `workspaceId` varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `nicheSlug` varchar(64) NOT NULL,
  `source` enum('reddit','quora','web') NOT NULL,
  `title` varchar(512) NOT NULL,
  `snippet` text,
  `sourceUrl` varchar(1024) NOT NULL,
  `score` int NOT NULL DEFAULT 0,
  `fetchedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_audience_signals_workspace_niche` (`workspaceId`, `nicheSlug`),
  CONSTRAINT `audience_signals_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
