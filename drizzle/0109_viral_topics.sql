-- Viral library topics: the topic list, topics per video, and topics per
-- creator profile. Additive only: five new tables, nothing altered or dropped.
-- Safe to re-run (IF NOT EXISTS). The app skips topics quietly until applied.
-- Railway's query box runs one statement at a time: run each CREATE separately.
-- Rollback: DROP TABLE IF EXISTS `viral_profile_topic_runs`, `viral_profile_topics`,
-- `viral_video_tag_runs`, `viral_video_topics`, `viral_topics`;

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

CREATE TABLE IF NOT EXISTS `viral_video_tag_runs` (
  `candidateId` int NOT NULL,
  `topicCount` int NOT NULL,
  `taggedAt` timestamp NOT NULL,
  PRIMARY KEY (`candidateId`)
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
  `matchedAt` timestamp NOT NULL,
  PRIMARY KEY (`socialProfileId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
