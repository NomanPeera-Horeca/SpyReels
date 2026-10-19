-- Pillar subtopic generation jobs (explicit, bounded, durable).
-- Additive. Requires 0104 (pillar_subtopics, including dismissedFromStatus) to exist.
-- Safe to re-run. There is no ALTER here: 0104 on main already has every column.
-- Rollback: DROP TABLE IF EXISTS `pillar_subtopic_jobs`;
-- Do not drop personalization_items or pillar_subtopics.

CREATE TABLE IF NOT EXISTS `pillar_subtopic_jobs` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `socialProfileId` varchar(36) NOT NULL,
  `pillarItemId` varchar(36) NOT NULL,
  `status` enum('running','succeeded','failed') NOT NULL,
  `attempts` tinyint NOT NULL DEFAULT 0,
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
