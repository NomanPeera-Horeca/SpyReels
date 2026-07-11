CREATE TABLE `coach_script_feedback` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `coachScriptId` int NOT NULL,
  `rating` varchar(8) NOT NULL,
  `reason` varchar(32),
  `note` varchar(500),
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `coach_script_feedback_id` PRIMARY KEY(`id`),
  CONSTRAINT `coach_script_feedback_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `coach_script_feedback_workspaceId_workspaces_id_fk` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces`(`id`) ON DELETE cascade ON UPDATE no action,
  CONSTRAINT `coach_script_feedback_coachScriptId_coach_scripts_id_fk` FOREIGN KEY (`coachScriptId`) REFERENCES `coach_scripts`(`id`) ON DELETE cascade ON UPDATE no action
);

CREATE UNIQUE INDEX `uniq_coach_script_feedback_user_script` ON `coach_script_feedback` (`userId`, `coachScriptId`);
CREATE INDEX `idx_coach_script_feedback_created` ON `coach_script_feedback` (`createdAt`);
