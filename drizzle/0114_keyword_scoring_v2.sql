-- Keyword bank scoring v2 (disabled by default) and the scoring experiment.
--
-- Additive and idempotent: five new tables, CREATE TABLE IF NOT EXISTS only,
-- nothing altered or dropped, safe to re-run. Production keeps the current
-- scoring until KEYWORD_SCORING is changed; the experiment runs only when an
-- experiment row is set to 'ready' AND KEYWORD_EXPERIMENT_RUNNER=on.
-- Rollback: DROP TABLE IF EXISTS `viral_keyword_experiment_stats`, `viral_keyword_experiments`,
--   `viral_keyword_searches`, `viral_keyword_relevance`, `viral_topic_terms`;

-- Topic aliases and concept terms used to judge phrase relevance (normalized).
CREATE TABLE IF NOT EXISTS `viral_topic_terms` (`topicSlug` varchar(80) NOT NULL, `term` varchar(80) NOT NULL, `kind` varchar(12) NOT NULL, `source` varchar(12) NOT NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`topicSlug`, `term`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Relevance label per phrase: relevant | plausible | irrelevant, and where it came from.
CREATE TABLE IF NOT EXISTS `viral_keyword_relevance` (`keywordId` int NOT NULL, `label` varchar(12) NOT NULL, `source` varchar(12) NOT NULL, `checkedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`keywordId`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- One row per phrase per search: which scoring picked it, which lane, calls, results and the on-topic video ids.
CREATE TABLE IF NOT EXISTS `viral_keyword_searches` (`id` bigint NOT NULL AUTO_INCREMENT, `searchId` varchar(36) NOT NULL, `keywordId` int NOT NULL, `topicSlug` varchar(80) NOT NULL, `platform` varchar(16) NOT NULL, `phrase` varchar(160) NOT NULL, `scoring` varchar(8) NOT NULL, `lane` varchar(8) NOT NULL, `experimentId` int NULL, `calls` decimal(6,2) NULL, `found` int NOT NULL DEFAULT 0, `passed` int NOT NULL DEFAULT 0, `passedIds` json NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`), KEY `idx_vks_keyword` (`keywordId`, `createdAt`), KEY `idx_vks_experiment` (`experimentId`, `scoring`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Experiment definition; status draft | ready | running | done | stopped.
CREATE TABLE IF NOT EXISTS `viral_keyword_experiments` (`id` int NOT NULL AUTO_INCREMENT, `name` varchar(80) NOT NULL, `status` varchar(12) NOT NULL DEFAULT 'draft', `topicSlugs` json NOT NULL, `platforms` json NOT NULL, `minSearchesPerArm` int NOT NULL, `maxUsd` decimal(8,2) NOT NULL, `seed` int NOT NULL DEFAULT 1, `snapshotAt` timestamp NULL, `startedAt` timestamp NULL, `endedAt` timestamp NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- Phrase stats frozen at experiment start, so both arms score from the same history.
CREATE TABLE IF NOT EXISTS `viral_keyword_experiment_stats` (`experimentId` int NOT NULL, `keywordId` int NOT NULL, `runs` int NOT NULL, `found` int NOT NULL, `passed` int NOT NULL, `viral` int NOT NULL, `creatorsFound` int NOT NULL, `goodCreators` int NOT NULL, `retired` tinyint NOT NULL, PRIMARY KEY (`experimentId`, `keywordId`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
