-- Keyword bank (Phase 1): real search phrases per topic and platform, and how
-- well each one finds on-topic viral videos and creators.
--
-- Additive only: two new tables, nothing altered or dropped. Safe to re-run.
-- Before this runs, discovery keeps using AI-written phrases as today.
-- Rollback: DROP TABLE IF EXISTS `viral_keyword_hits`, `viral_keywords`;

CREATE TABLE IF NOT EXISTS `viral_keywords` (
  `id` int NOT NULL AUTO_INCREMENT,
  `topicSlug` varchar(80) NOT NULL,
  `platform` varchar(16) NOT NULL,
  `phrase` varchar(160) NOT NULL,
  `source` varchar(24) NOT NULL,
  `demand` int NOT NULL DEFAULT 0,
  `runs` int NOT NULL DEFAULT 0,
  `found` int NOT NULL DEFAULT 0,
  `passed` int NOT NULL DEFAULT 0,
  `viral` int NOT NULL DEFAULT 0,
  `creatorsFound` int NOT NULL DEFAULT 0,
  `goodCreators` int NOT NULL DEFAULT 0,
  `retired` tinyint NOT NULL DEFAULT 0,
  `lastUsedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_viral_keywords_topic_platform_phrase` (`topicSlug`, `platform`, `phrase`),
  KEY `idx_viral_keywords_topic_platform` (`topicSlug`, `platform`, `retired`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `viral_keyword_hits` (
  `keywordId` int NOT NULL,
  `platform` varchar(16) NOT NULL,
  `sourceId` varchar(64) NOT NULL DEFAULT '',
  `creatorHandle` varchar(128) NOT NULL DEFAULT '',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`keywordId`, `sourceId`, `creatorHandle`),
  KEY `idx_viral_keyword_hits_video` (`platform`, `sourceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
