-- Pillar subtopics: exact undo and durable generation jobs.
-- Requires 0104 (pillar_subtopics) to be applied and verified first.
-- Run once. ALTER TABLE ADD COLUMN is not idempotent in MySQL 8; the
-- verifier (verifyPillarSubtopicStore) reports whether this ran.
-- Rollback: DROP TABLE IF EXISTS `pillar_subtopic_jobs`;
--           ALTER TABLE `pillar_subtopics` DROP COLUMN `dismissedFromStatus`;

ALTER TABLE `pillar_subtopics`
  ADD COLUMN `dismissedFromStatus` enum('suggested','confirmed') NULL AFTER `status`;

CREATE TABLE IF NOT EXISTS `pillar_subtopic_jobs` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `socialProfileId` varchar(36) NOT NULL,
  `pillarItemId` varchar(36) NOT NULL,
  `status` enum('running','succeeded','failed') NOT NULL,
  `attempts` tinyint unsigned NOT NULL DEFAULT 0,
  `lastError` varchar(200) NULL,
  `lockedUntil` timestamp NULL,
  `lastClaimedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pillar_subtopic_jobs_pillar` (`pillarItemId`),
  KEY `idx_pillar_subtopic_jobs_profile_claimed` (`socialProfileId`, `lastClaimedAt`),
  CONSTRAINT `fk_pillar_subtopic_jobs_profile` FOREIGN KEY (`socialProfileId`, `workspaceId`) REFERENCES `social_profiles` (`id`, `workspaceId`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pillar_subtopic_jobs_pillar` FOREIGN KEY (`pillarItemId`) REFERENCES `personalization_items` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
