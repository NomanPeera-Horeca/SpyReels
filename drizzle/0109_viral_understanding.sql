-- Viral library understanding: topic list, topics and summaries per video,
-- creators' usual topics, creator-profile topics, one shared transcript per
-- public video, and a daily spend counter.
--
-- Additive only: eight new tables, nothing altered or dropped. Safe to re-run
-- (IF NOT EXISTS). The app skips these features quietly until applied.
-- Railway's query box runs one statement at a time: run each CREATE separately.
-- Rollback: DROP TABLE IF EXISTS `viral_processing_spend`, `shared_transcripts`,
-- `viral_profile_topic_runs`, `viral_profile_topics`, `viral_creator_topics`,
-- `viral_video_insights`, `viral_video_topics`, `viral_topics`;

CREATE TABLE IF NOT EXISTS `viral_topics` (
  `slug` varchar(80) NOT NULL,
  `label` varchar(120) NOT NULL,
  `category` varchar(32) NOT NULL,
  `source` varchar(16) NOT NULL,
  `createdAt` timestamp NOT NULL,
  PRIMARY KEY (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `viral_video_topics` (
  `candidateId` int NOT NULL,
  `topicSlug` varchar(80) NOT NULL,
  `taggedAt` timestamp NOT NULL,
  PRIMARY KEY (`candidateId`, `topicSlug`),
  KEY `idx_viral_video_topics_topic` (`topicSlug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `viral_video_insights` (
  `candidateId` int NOT NULL,
  `status` varchar(16) NOT NULL,
  `summary` varchar(300) NULL,
  `format` varchar(32) NULL,
  `transcriptSource` varchar(24) NULL,
  `frameCount` int NOT NULL,
  `signals` varchar(255) NULL,
  `embedding` json NULL,
  `embeddingModel` varchar(64) NULL,
  `costUsd` decimal(10,5) NULL,
  `attempts` int NOT NULL,
  `error` varchar(200) NULL,
  `claimedAt` timestamp NOT NULL,
  `processedAt` timestamp NULL,
  PRIMARY KEY (`candidateId`),
  KEY `idx_viral_video_insights_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `viral_creator_topics` (
  `platform` varchar(16) NOT NULL,
  `handle` varchar(128) NOT NULL,
  `topicSlugs` json NOT NULL,
  `source` varchar(16) NOT NULL,
  `computedAt` timestamp NOT NULL,
  PRIMARY KEY (`platform`, `handle`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `viral_profile_topics` (
  `socialProfileId` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `topicSlug` varchar(80) NOT NULL,
  `matchedAt` timestamp NOT NULL,
  PRIMARY KEY (`socialProfileId`, `topicSlug`),
  KEY `idx_viral_profile_topics_topic` (`topicSlug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `viral_profile_topic_runs` (
  `socialProfileId` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `strategyHash` varchar(64) NOT NULL,
  `embedding` json NULL,
  `embeddingModel` varchar(64) NULL,
  `matchedAt` timestamp NOT NULL,
  PRIMARY KEY (`socialProfileId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `shared_transcripts` (
  `platform` varchar(16) NOT NULL,
  `sourceId` varchar(128) NOT NULL,
  `status` varchar(16) NOT NULL,
  `transcript` mediumtext NULL,
  `segments` json NULL,
  `durationSec` int NULL,
  `source` varchar(24) NOT NULL,
  `partial` tinyint NOT NULL,
  `createdAt` timestamp NOT NULL,
  PRIMARY KEY (`platform`, `sourceId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `viral_processing_spend` (
  `day` varchar(10) NOT NULL,
  `usd` decimal(10,4) NOT NULL,
  `videos` int NOT NULL,
  PRIMARY KEY (`day`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
