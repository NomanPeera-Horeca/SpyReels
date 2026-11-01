-- Shared viral library: creator usual views, per-video viral status, and
-- which research jobs were copied into the library.
--
-- Additive only. Creates three new tables; does not alter or drop anything.
-- viral_post_candidates (the library rows) is unchanged, so the app keeps
-- working before and after this runs. Safe to re-run (IF NOT EXISTS).
-- Rollback: DROP TABLE IF EXISTS `viral_library_ingests`, `viral_library_status`,
-- `viral_creator_baselines`; (the app then skips the library quietly).

CREATE TABLE IF NOT EXISTS `viral_creator_baselines` (
  `platform` varchar(16) NOT NULL,
  `handle` varchar(128) NOT NULL,
  `usualViews` bigint NOT NULL,
  `sampleSize` int NOT NULL,
  `followers` bigint NULL,
  `source` varchar(32) NOT NULL,
  `measuredAt` timestamp NOT NULL,
  PRIMARY KEY (`platform`, `handle`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `viral_library_status` (
  `candidateId` int NOT NULL,
  `platform` varchar(16) NOT NULL,
  `status` varchar(16) NOT NULL,
  `basis` varchar(16) NULL,
  `multiple` decimal(12,2) NULL,
  `views` bigint NULL,
  `source` varchar(32) NOT NULL,
  `checkedAt` timestamp NOT NULL,
  `nextCheckAt` timestamp NULL,
  PRIMARY KEY (`candidateId`),
  KEY `idx_viral_library_status_status` (`status`, `platform`),
  KEY `idx_viral_library_status_next_check` (`nextCheckAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `viral_library_ingests` (
  `source` varchar(16) NOT NULL,
  `jobId` int NOT NULL,
  `videoCount` int NOT NULL,
  `ingestedAt` timestamp NOT NULL,
  PRIMARY KEY (`source`, `jobId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
