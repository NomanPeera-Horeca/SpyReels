-- Run on production as a single query (Railway SQL tab).

CREATE TABLE `export_jobs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `scrapeJobId` int NOT NULL,
  `status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  `currentStep` enum('pending','transcribing','analyzing','building_excel','complete','failed') NOT NULL DEFAULT 'pending',
  `progressPercent` int NOT NULL DEFAULT 0,
  `stepDone` int NOT NULL DEFAULT 0,
  `stepTotal` int NOT NULL DEFAULT 0,
  `progressLabel` varchar(255) DEFAULT NULL,
  `fileR2Key` text DEFAULT NULL,
  `filename` varchar(255) DEFAULT NULL,
  `fileSizeBytes` int DEFAULT NULL,
  `reelCountAtExport` int DEFAULT NULL,
  `errorMessage` text DEFAULT NULL,
  `expiresAt` timestamp NULL DEFAULT NULL,
  `completedAt` timestamp NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_export_jobs_scrape_job` (`scrapeJobId`),
  KEY `idx_export_jobs_workspace` (`workspaceId`),
  CONSTRAINT `export_jobs_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
