-- Bug #63: apply manually in Railway / Render Shell SQL (or equivalent), one statement at a time.
-- Do NOT use drizzle migrate / drizzle journal for this change.
-- Video B-roll upload pipeline: transcribe + analyze uploaded video, suggest timed Pexels cuts.

-- 1) Create table
CREATE TABLE `video_broll_generations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `status` enum('pending','uploading','transcribing','analyzing','completed','failed') NOT NULL DEFAULT 'pending',
  `sourceVideoUrl` varchar(1024) NOT NULL,
  `durationSeconds` int DEFAULT NULL,
  `transcript` json DEFAULT NULL,
  `insertionPoints` json DEFAULT NULL,
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_video_broll_generations_workspace` (`workspaceId`),
  KEY `idx_video_broll_generations_user_created` (`userId`, `createdAt`),
  CONSTRAINT `video_broll_generations_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
);
