CREATE TABLE IF NOT EXISTS `filming_reminders` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `coachScriptId` int NOT NULL,
  `savedScriptId` int,
  `title` varchar(256) NOT NULL,
  `filmingDate` date NOT NULL,
  `filmingTime` varchar(8) NOT NULL,
  `timezone` varchar(64) NOT NULL,
  `setup` varchar(32) NOT NULL,
  `setupLabel` varchar(128) NOT NULL,
  `openingVisual` text,
  `onScreenText` varchar(512),
  `notes` text,
  `status` enum('scheduled','completed','cancelled') NOT NULL DEFAULT 'scheduled',
  `reminderSentAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `filming_reminders_id` PRIMARY KEY(`id`),
  CONSTRAINT `uniq_filming_reminders_workspace_script` UNIQUE(`workspaceId`,`coachScriptId`),
  CONSTRAINT `filming_reminders_workspace_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
  CONSTRAINT `filming_reminders_coach_script_fk` FOREIGN KEY (`coachScriptId`) REFERENCES `coach_scripts`(`id`) ON DELETE CASCADE
);

CREATE INDEX `idx_filming_reminders_due`
  ON `filming_reminders` (`workspaceId`,`filmingDate`,`filmingTime`,`status`);
