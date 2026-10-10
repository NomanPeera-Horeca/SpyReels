-- Featured Accounts feature (Phase 1)
-- Four new tables: niches, featured_accounts, featured_account_niches, featured_reels.
-- Applied to staging via `drizzle-kit push` (see staging DATABASE_URL). This file
-- mirrors the DDL for source-of-truth / audit purposes and matches the style of
-- 0016b_password_reset_tokens.sql and 0020_add_transcription_reel_id.sql.

CREATE TABLE `niches` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(64) NOT NULL,
  `slug` VARCHAR(64) NOT NULL,
  `groupName` VARCHAR(32) NOT NULL,
  `iconName` VARCHAR(32) NOT NULL,
  `description` TEXT,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `niches_slug_unique` (`slug`)
);

CREATE TABLE `featured_accounts` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `handle` VARCHAR(128) NOT NULL,
  `displayName` VARCHAR(256) DEFAULT NULL,
  `followerCount` INT NOT NULL DEFAULT 0,
  `avgEngagementRate` DECIMAL(5,2) NOT NULL DEFAULT '0.00',
  `profilePicUrl` TEXT,
  `bio` TEXT,
  `totalReelsEver` INT NOT NULL DEFAULT 0,
  `lastIncrementalScrape` TIMESTAMP NULL DEFAULT NULL,
  `lastFullScrape` TIMESTAMP NULL DEFAULT NULL,
  `isActive` BOOLEAN NOT NULL DEFAULT TRUE,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `featured_accounts_handle_unique` (`handle`)
);

CREATE TABLE `featured_account_niches` (
  `accountId` INT NOT NULL,
  `nicheId` INT NOT NULL,
  `isPrimary` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`accountId`, `nicheId`),
  KEY `featured_account_niches_nicheId_idx` (`nicheId`),
  CONSTRAINT `featured_account_niches_accountId_featured_accounts_id_fk`
    FOREIGN KEY (`accountId`) REFERENCES `featured_accounts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `featured_account_niches_nicheId_niches_id_fk`
    FOREIGN KEY (`nicheId`) REFERENCES `niches` (`id`) ON DELETE CASCADE
);

CREATE TABLE `featured_reels` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `featuredAccountId` INT NOT NULL,
  `reelShortcode` VARCHAR(64) NOT NULL,
  `caption` TEXT,
  `viewCount` INT NOT NULL DEFAULT 0,
  `likeCount` INT NOT NULL DEFAULT 0,
  `commentCount` INT NOT NULL DEFAULT 0,
  `engagementRate` DECIMAL(5,2) DEFAULT NULL,
  `thumbnailUrl` TEXT,
  `videoUrl` TEXT,
  `duration` INT DEFAULT NULL,
  `postedAt` TIMESTAMP NOT NULL,
  `rank` INT DEFAULT NULL,
  `scrapedAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `featured_reels_account_shortcode_unique` (`featuredAccountId`, `reelShortcode`),
  CONSTRAINT `featured_reels_featuredAccountId_featured_accounts_id_fk`
    FOREIGN KEY (`featuredAccountId`) REFERENCES `featured_accounts` (`id`) ON DELETE CASCADE
);
