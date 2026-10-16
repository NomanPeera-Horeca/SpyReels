-- DRAFT. NOT A MIGRATION. DO NOT APPLY.
--
-- New onboarding + personalization tables. Mirrors drizzle/personalizationSchema.ts.
-- Becomes drizzle/<NNNN>_onboarding_v2_personalization.sql only after the CEO
-- confirms the next free number against production __drizzle_migrations.
--
-- Additive only: CREATE TABLE IF NOT EXISTS, no ALTER on existing tables.
-- Idempotent: safe to re-run.
-- Apply AFTER backup via the normal production migration process
-- (docs/deploy-notes/manual-migrations.md).
-- Rollback (only while no code reads these tables): drop them in reverse order
-- (see bottom of file).

CREATE TABLE IF NOT EXISTS `social_profiles` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `platform` enum('instagram','tiktok','youtube') NOT NULL,
  `platformAccountId` varchar(128) NULL,
  `normalizedHandle` varchar(64) NOT NULL,
  `displayName` varchar(255) NULL,
  `avatarUrl` varchar(1000) NULL,
  `bio` text NULL,
  `followerCount` bigint unsigned NULL,
  `followingCount` bigint unsigned NULL,
  `postCount` bigint unsigned NULL,
  `publicFactsFetchedAt` timestamp NULL,
  `status` enum('pending_confirmation','confirmed','not_found','private','lookup_failed') NOT NULL DEFAULT 'pending_confirmation',
  `authorization` enum('none','authorized','reconnect_required') NOT NULL DEFAULT 'none',
  `createdByUserId` int NOT NULL,
  `confirmedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_social_profiles_ws_platform_handle` (`workspaceId`, `platform`, `normalizedHandle`),
  KEY `idx_social_profiles_workspace` (`workspaceId`, `deletedAt`),
  CONSTRAINT `fk_social_profiles_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workspace_member_active_profiles` (
  `workspaceId` varchar(36) NOT NULL,
  `userId` int NOT NULL,
  `socialProfileId` varchar(36) NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`workspaceId`, `userId`),
  KEY `idx_member_active_profile_profile` (`socialProfileId`),
  CONSTRAINT `fk_member_active_profile_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_member_active_profile_profile` FOREIGN KEY (`socialProfileId`) REFERENCES `social_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_onboarding_answers` (
  `userId` int NOT NULL,
  `primaryUseCase` enum('find_viral_videos','scripts_in_my_voice','analyze_creators','ideas_what_to_post') NULL,
  `primaryUseCaseAnsweredAt` timestamp NULL,
  `attributionSource` enum('google_search','chatgpt_ai_tools','instagram','tiktok','youtube','facebook','friend','other') NULL,
  `attributionAnsweredAt` timestamp NULL,
  `attributionSkippedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`userId`),
  CONSTRAINT `fk_user_onboarding_answers_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `profile_analysis_runs` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `socialProfileId` varchar(36) NOT NULL,
  `inputHash` varchar(64) NOT NULL,
  `idempotencyKey` varchar(191) NOT NULL,
  `durableJobId` bigint unsigned NULL,
  `status` enum('queued','running','partial','succeeded','failed') NOT NULL DEFAULT 'queued',
  `postsInWindow` int NULL,
  `windowStart` timestamp NULL,
  `windowEnd` timestamp NULL,
  `errorCode` varchar(64) NULL,
  `requestedByUserId` int NOT NULL,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_profile_analysis_runs_idempotency` (`idempotencyKey`),
  KEY `idx_profile_analysis_runs_profile` (`socialProfileId`, `createdAt`),
  KEY `idx_profile_analysis_runs_workspace` (`workspaceId`),
  CONSTRAINT `fk_profile_analysis_runs_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_profile_analysis_runs_profile` FOREIGN KEY (`socialProfileId`) REFERENCES `social_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `profile_analysis_stages` (
  `runId` varchar(36) NOT NULL,
  `stage` enum('published_content','strongest_performers','hooks_and_topics','niche_opportunities') NOT NULL,
  `status` enum('waiting','running','done','failed','skipped') NOT NULL DEFAULT 'waiting',
  `errorCode` varchar(64) NULL,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`runId`, `stage`),
  CONSTRAINT `fk_profile_analysis_stages_run` FOREIGN KEY (`runId`) REFERENCES `profile_analysis_runs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `personalization_items` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `socialProfileId` varchar(36) NOT NULL,
  `kind` enum('goal','audience','pillar','niche','language') NOT NULL,
  `payload` json NOT NULL,
  `source` enum('ai_suggested','user_entered','user_edited') NOT NULL,
  `status` enum('suggested','confirmed','dismissed','superseded') NOT NULL,
  `basedOnVersion` int NOT NULL,
  `supersedesItemId` varchar(36) NULL,
  `analysisRunId` varchar(36) NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdByUserId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_personalization_items_profile_kind_status` (`socialProfileId`, `kind`, `status`),
  KEY `idx_personalization_items_workspace` (`workspaceId`),
  CONSTRAINT `fk_personalization_items_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_personalization_items_profile` FOREIGN KEY (`socialProfileId`) REFERENCES `social_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `personalization_progress` (
  `socialProfileId` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `personalizationVersion` int NOT NULL DEFAULT 1,
  `goalStatus` enum('pending','suggested','confirmed','skipped','not_applicable') NOT NULL DEFAULT 'pending',
  `audienceStatus` enum('pending','suggested','confirmed','skipped','not_applicable') NOT NULL DEFAULT 'pending',
  `pillarsStatus` enum('pending','suggested','confirmed','skipped','not_applicable') NOT NULL DEFAULT 'pending',
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`socialProfileId`),
  KEY `idx_personalization_progress_workspace` (`workspaceId`),
  CONSTRAINT `fk_personalization_progress_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_personalization_progress_profile` FOREIGN KEY (`socialProfileId`) REFERENCES `social_profiles` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ROLLBACK (manual, only while no deployed code reads these tables):
-- DROP TABLE IF EXISTS `personalization_progress`;
-- DROP TABLE IF EXISTS `personalization_items`;
-- DROP TABLE IF EXISTS `profile_analysis_stages`;
-- DROP TABLE IF EXISTS `profile_analysis_runs`;
-- DROP TABLE IF EXISTS `user_onboarding_answers`;
-- DROP TABLE IF EXISTS `workspace_member_active_profiles`;
-- DROP TABLE IF EXISTS `social_profiles`;
