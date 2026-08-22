-- Phase 3A: Viral Posts Instagram daily feed + feedback persistence

CREATE TABLE IF NOT EXISTS `viral_post_candidates` (
  `id` int AUTO_INCREMENT NOT NULL,
  `platform` varchar(16) NOT NULL DEFAULT 'instagram',
  `sourceId` varchar(128) NOT NULL,
  `sourceUrl` varchar(512) NOT NULL,
  `creatorId` varchar(128),
  `creatorName` varchar(255) NOT NULL,
  `creatorHandle` varchar(128),
  `creatorAvatarUrl` text,
  `creatorFollowers` int,
  `thumbnailUrl` text,
  `videoUrl` text,
  `caption` text,
  `transcript` text,
  `hashtags` json,
  `publishedAt` timestamp NULL,
  `views` int,
  `likes` int,
  `comments` int,
  `shares` int,
  `saves` int,
  `reachMultiplier` decimal(12,4),
  `engagementRate` decimal(12,6),
  `viewsPerHour` decimal(14,4),
  `trendStatus` varchar(32) NOT NULL DEFAULT 'unknown',
  `rawProviderPayload` json,
  `discoveredAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `refreshedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_viral_post_candidates_platform_source` (`platform`, `sourceId`),
  KEY `idx_viral_post_candidates_discovered` (`discoveredAt`)
);

CREATE TABLE IF NOT EXISTS `viral_post_daily_feeds` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `localDate` varchar(10) NOT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'UTC',
  `generatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `status` varchar(20) NOT NULL DEFAULT 'ready',
  `generationReason` varchar(64),
  `errorMessage` text,
  `scCallCount` int NOT NULL DEFAULT 0,
  `costEstimateUsd` decimal(10,4),
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_viral_post_daily_feeds_user_date` (`userId`, `localDate`),
  KEY `idx_viral_post_daily_feeds_user_created` (`userId`, `createdAt`),
  CONSTRAINT `viral_post_daily_feeds_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `viral_post_daily_feed_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `feedId` int NOT NULL,
  `candidateId` int NOT NULL,
  `rank` int NOT NULL,
  `contentPillar` varchar(128),
  `relevanceScore` decimal(8,4),
  `relevanceLabel` varchar(255) NOT NULL,
  `relevanceReason` text NOT NULL,
  `adaptabilityScore` decimal(8,4),
  `finalScore` decimal(10,4) NOT NULL DEFAULT 0,
  `shownAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_viral_post_daily_feed_items_feed_candidate` (`feedId`, `candidateId`),
  KEY `idx_viral_post_daily_feed_items_feed_rank` (`feedId`, `rank`),
  CONSTRAINT `viral_post_daily_feed_items_feed_fk`
    FOREIGN KEY (`feedId`) REFERENCES `viral_post_daily_feeds`(`id`) ON DELETE CASCADE,
  CONSTRAINT `viral_post_daily_feed_items_candidate_fk`
    FOREIGN KEY (`candidateId`) REFERENCES `viral_post_candidates`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `viral_post_saves` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `candidateId` int NOT NULL,
  `savedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_viral_post_saves_user_candidate` (`userId`, `candidateId`),
  KEY `idx_viral_post_saves_user` (`userId`, `savedAt`),
  CONSTRAINT `viral_post_saves_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `viral_post_saves_candidate_fk`
    FOREIGN KEY (`candidateId`) REFERENCES `viral_post_candidates`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `viral_post_feedback` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `candidateId` int NOT NULL,
  `feedbackType` varchar(32) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_viral_post_feedback_user_created` (`userId`, `createdAt`),
  KEY `idx_viral_post_feedback_user_type` (`userId`, `feedbackType`),
  CONSTRAINT `viral_post_feedback_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `viral_post_feedback_candidate_fk`
    FOREIGN KEY (`candidateId`) REFERENCES `viral_post_candidates`(`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `viral_post_hidden_creators` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `platform` varchar(16) NOT NULL DEFAULT 'instagram',
  `creatorKey` varchar(128) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_viral_post_hidden_creators_user_platform_key` (`userId`, `platform`, `creatorKey`),
  CONSTRAINT `viral_post_hidden_creators_user_fk`
    FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
