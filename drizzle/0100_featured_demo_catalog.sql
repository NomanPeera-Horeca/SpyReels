-- Platform-agnostic featured demo catalog (TikTok + YouTube first).
-- Apply via Railway MySQL console (Bug #63). Do not drizzle-kit push.

CREATE TABLE IF NOT EXISTS `featured_demo_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `platform` enum('instagram','tiktok','youtube') NOT NULL,
  `handle` varchar(128) NOT NULL,
  `displayName` varchar(256),
  `followerCount` int NOT NULL DEFAULT 0,
  `profilePicUrl` text,
  `isActive` boolean NOT NULL DEFAULT TRUE,
  `lastRefreshAt` timestamp NULL DEFAULT NULL,
  `lastSuccessAt` timestamp NULL DEFAULT NULL,
  `lastRefreshError` varchar(512),
  `refreshStatus` enum('idle','running','success','error') NOT NULL DEFAULT 'idle',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `featured_demo_accounts_id` PRIMARY KEY(`id`)
);

CREATE UNIQUE INDEX `featured_demo_accounts_platform_handle_unique`
  ON `featured_demo_accounts` (`platform`, `handle`);
CREATE INDEX `featured_demo_accounts_active_platform_idx`
  ON `featured_demo_accounts` (`isActive`, `platform`);

CREATE TABLE IF NOT EXISTS `featured_demo_items` (
  `id` int AUTO_INCREMENT NOT NULL,
  `accountId` int NOT NULL,
  `externalId` varchar(128) NOT NULL,
  `caption` text,
  `viewCount` int NOT NULL DEFAULT 0,
  `likeCount` int NOT NULL DEFAULT 0,
  `commentCount` int NOT NULL DEFAULT 0,
  `shareCount` int NOT NULL DEFAULT 0,
  `engagementRate` decimal(8,2),
  `thumbnailUrl` text,
  `durationSec` int,
  `postedAt` timestamp NULL,
  `videoPageUrl` text,
  `rank` int NOT NULL,
  `scrapedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `featured_demo_items_id` PRIMARY KEY(`id`),
  CONSTRAINT `featured_demo_items_accountId_featured_demo_accounts_id_fk`
    FOREIGN KEY (`accountId`) REFERENCES `featured_demo_accounts`(`id`)
    ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX `featured_demo_items_account_external_unique`
  ON `featured_demo_items` (`accountId`, `externalId`);
CREATE INDEX `featured_demo_items_account_rank_idx`
  ON `featured_demo_items` (`accountId`, `rank`);
