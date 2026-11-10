-- Relevance ranking (Phase 1, off by default): one cached meaning embedding per
-- creator profile, made from niche, pillars, sub-topics, audience and goals.
--
-- Additive and idempotent: one new table, CREATE TABLE IF NOT EXISTS only,
-- nothing altered or dropped. Read and written only when RELEVANCE_RANKING=on.
-- Rollback: DROP TABLE IF EXISTS `viral_profile_relevance`;
CREATE TABLE IF NOT EXISTS `viral_profile_relevance` (`socialProfileId` varchar(36) NOT NULL, `textHash` varchar(64) NOT NULL, `embedding` json NOT NULL, `embeddingModel` varchar(64) NOT NULL, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`socialProfileId`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
