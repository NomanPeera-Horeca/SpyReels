-- Phase 3A.1: shared niche/pillar candidate pools + refresh tracking

CREATE TABLE IF NOT EXISTS `viral_post_pools` (
  `id` int AUTO_INCREMENT NOT NULL,
  `poolKey` varchar(191) NOT NULL,
  `platform` varchar(16) NOT NULL DEFAULT 'instagram',
  `niche` varchar(128) NOT NULL,
  `pillar` varchar(128) NOT NULL,
  `language` varchar(16) NOT NULL DEFAULT 'en',
  `region` varchar(32) NULL,
  `priority` int NOT NULL DEFAULT 100,
  `minFreshCandidates` int NOT NULL DEFAULT 40,
  `dailyCallBudget` int NOT NULL DEFAULT 60,
  `lastRefreshedAt` timestamp NULL,
  `lastRefreshStatus` varchar(32) NULL,
  `lastRefreshScCalls` int NOT NULL DEFAULT 0,
  `lastRefreshCandidateCount` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_viral_post_pools_key` (`poolKey`),
  KEY `idx_viral_post_pools_niche_pillar` (`niche`, `pillar`),
  KEY `idx_viral_post_pools_last_refreshed` (`lastRefreshedAt`)
);

CREATE TABLE IF NOT EXISTS `viral_post_pool_candidates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `poolId` int NOT NULL,
  `candidateId` int NOT NULL,
  `primaryPillar` varchar(128) NOT NULL,
  `secondaryPillar` varchar(128) NULL,
  `pillarConfidence` decimal(6,4) NOT NULL DEFAULT 0.5000,
  `pillarReason` text NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_viral_post_pool_candidates` (`poolId`, `candidateId`),
  KEY `idx_viral_post_pool_candidates_candidate` (`candidateId`),
  KEY `idx_viral_post_pool_candidates_pool_created` (`poolId`, `createdAt`),
  CONSTRAINT `viral_post_pool_candidates_pool_fk`
    FOREIGN KEY (`poolId`) REFERENCES `viral_post_pools`(`id`) ON DELETE CASCADE,
  CONSTRAINT `viral_post_pool_candidates_candidate_fk`
    FOREIGN KEY (`candidateId`) REFERENCES `viral_post_candidates`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `viral_post_pool_budget_days` (
  `id` int AUTO_INCREMENT NOT NULL,
  `poolId` int NOT NULL,
  `budgetDate` varchar(10) NOT NULL,
  `scCallsUsed` int NOT NULL DEFAULT 0,
  `refreshRuns` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_viral_post_pool_budget_day` (`poolId`, `budgetDate`),
  CONSTRAINT `viral_post_pool_budget_pool_fk`
    FOREIGN KEY (`poolId`) REFERENCES `viral_post_pools`(`id`) ON DELETE CASCADE
);
