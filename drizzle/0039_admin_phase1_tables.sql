-- Phase 1 admin: attribution columns, blog SEO fields, analytics + insights tables.

ALTER TABLE `users`
  ADD COLUMN `utmSource` varchar(255) NULL,
  ADD COLUMN `utmMedium` varchar(255) NULL,
  ADD COLUMN `utmCampaign` varchar(255) NULL,
  ADD COLUMN `utmTerm` varchar(255) NULL,
  ADD COLUMN `utmContent` varchar(255) NULL,
  ADD COLUMN `firstReferrer` text NULL;

ALTER TABLE `blog_posts`
  ADD COLUMN `canonicalUrl` varchar(1024) NULL,
  ADD COLUMN `ogImageUrl` text NULL,
  ADD COLUMN `noIndex` boolean NOT NULL DEFAULT false,
  ADD COLUMN `sourceKeyword` varchar(255) NULL,
  ADD COLUMN `generatedByAi` boolean NOT NULL DEFAULT false;

CREATE TABLE `blog_versions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `blogPostId` int NOT NULL,
  `title` varchar(512) NOT NULL,
  `slug` varchar(512) NOT NULL,
  `excerpt` text,
  `content` text NOT NULL,
  `metaTitle` varchar(512) DEFAULT NULL,
  `metaDescription` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `blog_versions_post_idx` (`blogPostId`)
);

CREATE TABLE `creator_view_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `creatorHandle` varchar(128) NOT NULL,
  `viewerUserId` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `creator_view_events_handle_idx` (`creatorHandle`),
  KEY `creator_view_events_created_idx` (`createdAt`)
);

CREATE TABLE `niche_view_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `nicheSlug` varchar(128) NOT NULL,
  `viewerUserId` int DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `niche_view_events_slug_idx` (`nicheSlug`),
  KEY `niche_view_events_created_idx` (`createdAt`)
);

CREATE TABLE `keyword_opportunities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `keyword` varchar(255) NOT NULL,
  `searchVolume` int DEFAULT NULL,
  `difficulty` int DEFAULT NULL,
  `cpc` decimal(8,2) DEFAULT NULL,
  `weekStartDate` datetime DEFAULT NULL,
  `raw` json DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `keyword_opportunities_week_idx` (`weekStartDate`)
);

CREATE TABLE `ai_insights` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(512) NOT NULL,
  `body` text NOT NULL,
  `ctaPath` varchar(512) DEFAULT NULL,
  `insightDate` datetime NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ai_insights_date_idx` (`insightDate`)
);
