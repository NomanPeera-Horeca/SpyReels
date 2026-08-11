-- Watermark render jobs for free/unpaid B-roll clip downloads.
-- Bug #63: apply via Railway MySQL console (or a one-off mysql2 script).
-- Do NOT drizzle-kit push / migrate journal this file until drift is resolved.

CREATE TABLE IF NOT EXISTS `watermark_jobs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `sourceClipUrl` text NOT NULL,
  `status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  `outputUrl` text,
  `userId` int,
  `sessionId` varchar(64),
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `watermark_jobs_id` PRIMARY KEY(`id`)
);

CREATE INDEX `idx_watermark_jobs_status_created` ON `watermark_jobs` (`status`,`createdAt`);
CREATE INDEX `idx_watermark_jobs_source_status` ON `watermark_jobs` (`sourceClipUrl`(255),`status`);
