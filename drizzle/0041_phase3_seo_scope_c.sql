-- Phase 3 Scope C: SEO Hub — snapshots, search console caches, AI mentions, bot crawl, sitemap log.

CREATE TABLE `seo_health_snapshots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `snapshotDate` date NOT NULL,
  `pageSpeedScore` int DEFAULT NULL,
  `schemaStatus` varchar(32) DEFAULT NULL,
  `cwvStatus` varchar(32) DEFAULT NULL,
  `sslStatus` varchar(32) DEFAULT NULL,
  `indexabilityStatus` varchar(32) DEFAULT NULL,
  `recommendedAction` text,
  `raw` json DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `seo_health_snapshots_date_unique` (`snapshotDate`)
);

CREATE TABLE `gsc_daily_metrics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `metricDate` date NOT NULL,
  `clicks` int NOT NULL DEFAULT 0,
  `impressions` int NOT NULL DEFAULT 0,
  `ctr` decimal(8, 6) NOT NULL DEFAULT 0,
  `positionAvg` decimal(6, 2) DEFAULT NULL,
  `topQueries` json DEFAULT NULL,
  `raw` json DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `gsc_daily_metrics_date_unique` (`metricDate`),
  KEY `gsc_daily_metrics_created_idx` (`createdAt`)
);

CREATE TABLE `bing_daily_metrics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `metricDate` date NOT NULL,
  `clicks` int NOT NULL DEFAULT 0,
  `impressions` int NOT NULL DEFAULT 0,
  `ctr` decimal(8, 6) NOT NULL DEFAULT 0,
  `positionAvg` decimal(6, 2) DEFAULT NULL,
  `topQueries` json DEFAULT NULL,
  `raw` json DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `bing_daily_metrics_date_unique` (`metricDate`),
  KEY `bing_daily_metrics_created_idx` (`createdAt`)
);

CREATE TABLE `ai_mention_prompts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `sortOrder` int NOT NULL DEFAULT 0,
  `body` text NOT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ai_mention_prompts_sort_idx` (`sortOrder`)
);

CREATE TABLE `ai_mention_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `promptId` int NOT NULL,
  `engine` varchar(32) NOT NULL,
  `responseText` mediumtext,
  `parsedScore` tinyint DEFAULT NULL,
  `weekStartDate` date NOT NULL,
  `payload` json DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ai_mention_runs_prompt_week_idx` (`promptId`, `weekStartDate`),
  KEY `ai_mention_runs_created_idx` (`createdAt`),
  CONSTRAINT `ai_mention_runs_prompt_fk` FOREIGN KEY (`promptId`) REFERENCES `ai_mention_prompts` (`id`) ON DELETE CASCADE
);

CREATE TABLE `bot_crawl_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `botFamily` varchar(64) NOT NULL,
  `userAgent` varchar(512) NOT NULL,
  `path` varchar(512) NOT NULL,
  `method` varchar(16) NOT NULL DEFAULT 'GET',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `bot_crawl_log_family_created_idx` (`botFamily`, `createdAt`),
  KEY `bot_crawl_log_created_idx` (`createdAt`)
);

CREATE TABLE `sitemap_submissions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `channel` varchar(32) NOT NULL,
  `status` varchar(64) NOT NULL,
  `detail` text,
  `payload` json DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `sitemap_submissions_channel_created_idx` (`channel`, `createdAt`)
);
