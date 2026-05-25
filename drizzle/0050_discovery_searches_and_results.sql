-- Discovery V1: search history and ranked creator results
CREATE TABLE `discovery_searches` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `userId` INT NOT NULL,
  `descriptionText` VARCHAR(500) NOT NULL,
  `routedNiche` VARCHAR(255) NULL,
  `routingConfidence` DECIMAL(3, 2) NULL,
  `clarified` BOOLEAN NOT NULL DEFAULT FALSE,
  `resultCount` INT NULL,
  `apifyCostUsd` DECIMAL(6, 2) NULL,
  `claudeCostUsd` DECIMAL(6, 2) NULL,
  `succeeded` BOOLEAN NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_discovery_user_month` (`userId`, `createdAt`),
  CONSTRAINT `fk_discovery_searches_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `discovery_results` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `searchId` INT NOT NULL,
  `rankPosition` INT NOT NULL,
  `instagramHandle` VARCHAR(255) NOT NULL,
  `followerCount` INT NULL,
  `engagementRate` DECIMAL(5, 2) NULL,
  `nicheFitScore` DECIMAL(3, 2) NULL,
  `whyMatchSummary` VARCHAR(500) NULL,
  KEY `idx_discovery_results_search` (`searchId`),
  CONSTRAINT `fk_discovery_results_search` FOREIGN KEY (`searchId`) REFERENCES `discovery_searches` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
