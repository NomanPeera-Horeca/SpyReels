-- DRAFT. NOT A MIGRATION. DO NOT APPLY TO PRODUCTION.
--
-- New onboarding + personalization tables. Mirrors drizzle/personalizationSchema.ts.
-- Becomes drizzle/<NNNN>_onboarding_v2_personalization.sql only after the CEO
-- confirms the next free number against production __drizzle_migrations.
--
-- Additive only: CREATE TABLE IF NOT EXISTS, no ALTER on existing tables.
-- Idempotent: safe to re-run.
-- Requires MySQL 8.0.16+ (CHECK constraints are enforced from 8.0.16).
-- Collation utf8mb4_0900_ai_ci matches `workspaces` and `workspace_members`
-- (drizzle/0042). MySQL rejects foreign keys between varchar columns with
-- different collations, so this must match production. Verify first:
--   SHOW CREATE TABLE workspaces;  SHOW CREATE TABLE workspace_members;
--
-- Isolation is enforced by the database, not only by app code:
-- * social_profiles has UNIQUE (id, workspaceId). Every child row references
--   (socialProfileId, workspaceId) together, so a child can never point at a
--   profile in another workspace, and its workspaceId can never disagree with
--   its profile's.
-- * An active-profile selection references workspace_members (workspaceId,
--   userId), so only a real member of that workspace can hold one, and it is
--   removed automatically if the member leaves.
-- * Items reference (analysisRunId, socialProfileId), so an item can only cite
--   an analysis run of its own profile.
--
-- History is protected by the database:
-- * Every foreign key between history tables (profiles, analysis runs, stages,
--   personalization items, progress) is ON DELETE RESTRICT. Deleting, retrying
--   or cleaning up an analysis run can never delete a confirmed goal, audience,
--   pillar, niche or language: the delete is refused while anything cites it.
-- * Profiles are soft deleted (deletedAt). Their history stays.
-- * Only non-history rows cascade: an active-profile selection disappears when
--   its member leaves or its profile row is purged.
-- * A soft-deleted profile cannot stay selected: the selection references
--   social_profiles (id, liveWorkspaceId), and liveWorkspaceId becomes NULL on
--   soft delete. Soft delete is refused until selections are cleared, and a
--   soft-deleted profile cannot be selected again.
-- * At most one queued/running analysis per profile (UNIQUE activeProfileSlot).
--
-- Full erasure (e.g. a data-deletion request) is an explicit ops procedure that
-- deletes in this order: selections, items, progress, stages, runs, profiles
-- (see PERSONALIZATION_PURGE_ORDER in server/personalization/lifecycle.ts).
--
-- Rollback (only while no deployed code reads these tables): see bottom.

CREATE TABLE IF NOT EXISTS `social_profiles` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `platform` enum('instagram','tiktok','youtube') NULL,
  `platformAccountId` varchar(128) NULL,
  `normalizedHandle` varchar(64) NULL,
  `displayName` varchar(255) NULL,
  `avatarUrl` varchar(1000) NULL,
  `bio` text NULL,
  `followerCount` bigint unsigned NULL,
  `followingCount` bigint unsigned NULL,
  `postCount` bigint unsigned NULL,
  `publicFactsFetchedAt` timestamp NULL,
  `status` enum('pending_confirmation','confirmed','not_found','private','lookup_failed','not_posting_yet','unlinked') NOT NULL DEFAULT 'pending_confirmation',
  `authorization` enum('none','authorized','reconnect_required') NOT NULL DEFAULT 'none',
  `createdByUserId` int NULL,
  `confirmedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL,
  `liveWorkspaceId` varchar(36) GENERATED ALWAYS AS (IF(`deletedAt` IS NULL, `workspaceId`, NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_social_profiles_id_workspace` (`id`, `workspaceId`),
  UNIQUE KEY `uniq_social_profiles_id_live_workspace` (`id`, `liveWorkspaceId`),
  UNIQUE KEY `uniq_social_profiles_ws_platform_handle` (`workspaceId`, `platform`, `normalizedHandle`),
  KEY `idx_social_profiles_workspace` (`workspaceId`, `deletedAt`),
  CONSTRAINT `fk_social_profiles_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE RESTRICT,
  CONSTRAINT `fk_social_profiles_created_by` FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_social_profiles_identity` CHECK (
    (`status` IN ('not_posting_yet','unlinked') AND `normalizedHandle` IS NULL)
    OR (`status` NOT IN ('not_posting_yet','unlinked') AND `platform` IS NOT NULL AND `normalizedHandle` IS NOT NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `workspace_member_active_profiles` (
  `workspaceId` varchar(36) NOT NULL,
  `userId` int NOT NULL,
  `socialProfileId` varchar(36) NOT NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`workspaceId`, `userId`),
  KEY `idx_member_active_profile_profile` (`socialProfileId`, `workspaceId`),
  CONSTRAINT `fk_member_active_profile_member` FOREIGN KEY (`workspaceId`, `userId`) REFERENCES `workspace_members` (`workspaceId`, `userId`) ON DELETE CASCADE,
  CONSTRAINT `fk_member_active_profile_profile` FOREIGN KEY (`socialProfileId`, `workspaceId`) REFERENCES `social_profiles` (`id`, `liveWorkspaceId`) ON DELETE CASCADE ON UPDATE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
  CONSTRAINT `fk_user_onboarding_answers_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_user_onboarding_attribution` CHECK (`attributionSource` IS NULL OR `attributionSkippedAt` IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `profile_analysis_runs` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `socialProfileId` varchar(36) NOT NULL,
  `inputHash` varchar(64) NOT NULL,
  `idempotencyKey` varchar(191) NOT NULL,
  `requestKind` enum('initial','user_refresh','background') NOT NULL,
  `refreshSequence` int NULL,
  `durableJobId` bigint unsigned NULL,
  `status` enum('queued','running','partial','succeeded','failed') NOT NULL DEFAULT 'queued',
  `postsInWindow` int NULL,
  `sourceSnapshot` json NULL,
  `sourceFetchedAt` timestamp NULL,
  `providerCallCount` int NULL,
  `providerAttempts` json NULL,
  `windowStart` timestamp NULL,
  `windowEnd` timestamp NULL,
  `errorCode` varchar(64) NULL,
  `requestedByUserId` int NULL,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `activeProfileSlot` varchar(36) GENERATED ALWAYS AS (IF(`status` IN ('queued','running'), `socialProfileId`, NULL)) STORED,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_profile_analysis_runs_idempotency` (`idempotencyKey`),
  UNIQUE KEY `uniq_profile_analysis_runs_active_slot` (`activeProfileSlot`),
  UNIQUE KEY `uniq_profile_analysis_runs_id_profile` (`id`, `socialProfileId`),
  KEY `idx_profile_analysis_runs_profile` (`socialProfileId`, `workspaceId`, `createdAt`),
  KEY `idx_profile_analysis_runs_workspace` (`workspaceId`),
  CONSTRAINT `fk_profile_analysis_runs_profile` FOREIGN KEY (`socialProfileId`, `workspaceId`) REFERENCES `social_profiles` (`id`, `workspaceId`) ON DELETE RESTRICT,
  CONSTRAINT `fk_profile_analysis_runs_requested_by` FOREIGN KEY (`requestedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_profile_analysis_runs_posts` CHECK (`postsInWindow` IS NULL OR `postsInWindow` >= 0),
  CONSTRAINT `chk_profile_analysis_runs_provider_calls` CHECK (`providerCallCount` IS NULL OR `providerCallCount` >= 0),
  CONSTRAINT `chk_profile_analysis_runs_refresh_sequence` CHECK (
    (`requestKind` = 'user_refresh' AND `refreshSequence` IS NOT NULL AND `refreshSequence` >= 1)
    OR (`requestKind` <> 'user_refresh' AND `refreshSequence` IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `profile_analysis_stages` (
  `runId` varchar(36) NOT NULL,
  `stage` enum('published_content','strongest_performers','hooks_and_topics','niche_opportunities') NOT NULL,
  `status` enum('waiting','running','done','failed','skipped') NOT NULL DEFAULT 'waiting',
  `errorCode` varchar(64) NULL,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`runId`, `stage`),
  CONSTRAINT `fk_profile_analysis_stages_run` FOREIGN KEY (`runId`) REFERENCES `profile_analysis_runs` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `personalization_items` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `socialProfileId` varchar(36) NOT NULL,
  `kind` enum('goal','audience','pillar','niche','language','brand_description') NOT NULL,
  `payload` json NOT NULL,
  `source` enum('ai_suggested','user_entered','user_edited') NOT NULL,
  `status` enum('suggested','confirmed','dismissed','superseded') NOT NULL,
  `evidence` enum('performance_backed','profile_inferred','user_provided') NOT NULL,
  `basedOnVersion` int NOT NULL,
  `dismissedAtVersion` int NULL,
  `supersedesItemId` varchar(36) NULL,
  `analysisRunId` varchar(36) NULL,
  `basedOnInputsHash` varchar(64) NULL,
  `confidence` enum('high','medium','low') NULL,
  `generationMeta` json NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdByUserId` int NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_personalization_items_profile_kind_status` (`socialProfileId`, `workspaceId`, `kind`, `status`),
  KEY `idx_personalization_items_workspace` (`workspaceId`),
  KEY `idx_personalization_items_run` (`analysisRunId`, `socialProfileId`),
  KEY `idx_personalization_items_supersedes` (`supersedesItemId`),
  CONSTRAINT `fk_personalization_items_profile` FOREIGN KEY (`socialProfileId`, `workspaceId`) REFERENCES `social_profiles` (`id`, `workspaceId`) ON DELETE RESTRICT,
  CONSTRAINT `fk_personalization_items_run` FOREIGN KEY (`analysisRunId`, `socialProfileId`) REFERENCES `profile_analysis_runs` (`id`, `socialProfileId`) ON DELETE RESTRICT,
  CONSTRAINT `fk_personalization_items_created_by` FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `chk_personalization_items_performance_run` CHECK (`evidence` <> 'performance_backed' OR `analysisRunId` IS NOT NULL),
  CONSTRAINT `chk_personalization_items_no_invented_numbers` CHECK (
    `kind` <> 'pillar'
    OR `evidence` = 'performance_backed'
    OR JSON_TYPE(JSON_EXTRACT(`payload`, '$.viewSharePercent')) IS NULL
    OR JSON_TYPE(JSON_EXTRACT(`payload`, '$.viewSharePercent')) = 'NULL'
  ),
  CONSTRAINT `chk_personalization_items_dismissed` CHECK ((`status` = 'dismissed') = (`dismissedAtVersion` IS NOT NULL)),
  CONSTRAINT `chk_personalization_items_confidence` CHECK (`confidence` IS NULL OR `source` = 'ai_suggested')
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `personalization_progress` (
  `socialProfileId` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `personalizationVersion` int NOT NULL DEFAULT 1,
  `goalStatus` enum('pending','suggested','confirmed','skipped') NOT NULL DEFAULT 'pending',
  `audienceStatus` enum('pending','suggested','confirmed','skipped') NOT NULL DEFAULT 'pending',
  `pillarsStatus` enum('pending','suggested','confirmed','skipped') NOT NULL DEFAULT 'pending',
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`socialProfileId`),
  KEY `idx_personalization_progress_workspace` (`workspaceId`),
  KEY `idx_personalization_progress_profile_ws` (`socialProfileId`, `workspaceId`),
  CONSTRAINT `fk_personalization_progress_profile` FOREIGN KEY (`socialProfileId`, `workspaceId`) REFERENCES `social_profiles` (`id`, `workspaceId`) ON DELETE RESTRICT,
  CONSTRAINT `chk_personalization_progress_version` CHECK (`personalizationVersion` >= 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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
  CONSTRAINT `fk_pillar_subtopics_pillar` FOREIGN KEY (`pillarItemId`) REFERENCES `personalization_items` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

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

-- ROLLBACK (manual, only while no deployed code reads these tables):
-- DROP TABLE IF EXISTS `pillar_subtopic_jobs`;
-- DROP TABLE IF EXISTS `pillar_subtopics`;
-- DROP TABLE IF EXISTS `personalization_progress`;
-- DROP TABLE IF EXISTS `personalization_items`;
-- DROP TABLE IF EXISTS `profile_analysis_stages`;
-- DROP TABLE IF EXISTS `profile_analysis_runs`;
-- DROP TABLE IF EXISTS `user_onboarding_answers`;
-- DROP TABLE IF EXISTS `workspace_member_active_profiles`;
-- DROP TABLE IF EXISTS `social_profiles`;
