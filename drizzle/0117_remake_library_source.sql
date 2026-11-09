-- Remake from shared library videos without copying them into Collected Reels
-- (REMAKE_LIBRARY_SOURCE=on; off by default).
--
-- Additive and idempotent: two new tables, CREATE TABLE IF NOT EXISTS only,
-- nothing existing is altered or dropped. Only read/written when the flag is on.
-- library_transcripts: one spoken transcript per public library video
--   (viral_post_candidates.id), made once and reused by everyone.
-- library_remake_scripts: which library video a remake (recreated_scripts.id) came from.
-- Rollback: DROP TABLE IF EXISTS `library_remake_scripts`; DROP TABLE IF EXISTS `library_transcripts`;
CREATE TABLE IF NOT EXISTS `library_transcripts` (`candidateId` int NOT NULL, `platform` varchar(16) NOT NULL, `status` enum('processing','completed','failed') NOT NULL, `transcript` mediumtext NULL, `segments` json NULL, `errorMessage` varchar(500) NULL, `attempts` int NOT NULL DEFAULT 0, `startedAt` timestamp NULL, `completedAt` timestamp NULL, `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (`candidateId`), KEY `idx_library_transcripts_status` (`status`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
CREATE TABLE IF NOT EXISTS `library_remake_scripts` (`scriptId` int NOT NULL, `candidateId` int NOT NULL, `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`scriptId`), KEY `idx_library_remake_scripts_candidate` (`candidateId`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
