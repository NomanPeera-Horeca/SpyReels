-- Pre-research of the creators shown on Home (so clicking one opens instantly).
--
-- Additive only: one new table and one hidden system workspace. Nothing is
-- altered or dropped. Safe to re-run.
-- The workspace has no members, so it never shows in anyone's workspace list.
-- Research jobs created there are copied into a user's research instantly by
-- the existing "recent research" seeding.
--
-- BEFORE RUNNING statement 2: replace YOUR_EMAIL with the email of the
-- SpyReels admin account that should own the system workspace.
-- Rollback: DROP TABLE IF EXISTS `research_prefetch`;
--           DELETE FROM `workspaces` WHERE `id` = 'spyreels-system-prefetch';

CREATE TABLE IF NOT EXISTS `research_prefetch` (
  `platform` varchar(16) NOT NULL,
  `handle` varchar(128) NOT NULL,
  `status` varchar(16) NOT NULL,
  `requestedAt` timestamp NOT NULL,
  `startedAt` timestamp NULL,
  `finishedAt` timestamp NULL,
  `jobId` int NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `error` varchar(255) NULL,
  PRIMARY KEY (`platform`, `handle`),
  KEY `idx_research_prefetch_status` (`status`, `requestedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

INSERT IGNORE INTO `workspaces` (`id`, `name`, `ownerUserId`, `plan`, `includedSeats`, `isPersonal`, `createdAt`, `updatedAt`)
SELECT 'spyreels-system-prefetch', 'SpyReels pre-research (system)', `id`, 'free', 1, 0, NOW(), NOW()
FROM `users` WHERE `email` = 'YOUR_EMAIL' LIMIT 1;
