-- Pillar subtopics for AI personalization.
-- Additive. Requires the personalization tables (personalization_items,
-- social_profiles) to exist already. Safe to re-run.
-- Rollback: DROP TABLE IF EXISTS `pillar_subtopics`;
-- Do not drop personalization_items. Dismissed rows are data, not leftovers.

CREATE TABLE IF NOT EXISTS `pillar_subtopics` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `socialProfileId` varchar(36) NOT NULL,
  `pillarItemId` varchar(36) NOT NULL,
  `label` varchar(80) NOT NULL,
  `normalizedLabel` varchar(80) NOT NULL,
  `normalizedPillarTitle` varchar(80) NOT NULL,
  `status` enum('suggested','confirmed','dismissed') NOT NULL,
  `dismissedFromStatus` enum('suggested','confirmed') NULL,
  `source` enum('ai_suggested','user_entered','user_edited') NOT NULL,
  `basedOnPillarHash` varchar(64) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pillar_subtopics_pillar_label` (`pillarItemId`, `normalizedLabel`),
  KEY `idx_pillar_subtopics_profile_title` (`socialProfileId`, `normalizedPillarTitle`, `status`),
  CONSTRAINT `fk_pillar_subtopics_profile` FOREIGN KEY (`socialProfileId`, `workspaceId`) REFERENCES `social_profiles` (`id`, `workspaceId`) ON DELETE RESTRICT,
  CONSTRAINT `fk_pillar_subtopics_pillar` FOREIGN KEY (`pillarItemId`) REFERENCES `personalization_items` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `chk_pillar_subtopics_dismiss_memory` CHECK (`dismissedFromStatus` IS NULL OR `status` = 'dismissed')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
