CREATE TABLE IF NOT EXISTS `content_agent_runs` (
  `id` varchar(36) NOT NULL,
  `userId` int NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `request` text NOT NULL,
  `status` enum('running','waiting_for_input','completed','failed','cancelled') NOT NULL DEFAULT 'running',
  `currentArtifactKind` varchar(24),
  `currentArtifactId` int,
  `currentArtifactTitle` varchar(256),
  `pendingTool` varchar(64),
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_content_agent_runs_workspace_updated` (`workspaceId`, `updatedAt`),
  KEY `idx_content_agent_runs_workspace_status` (`workspaceId`, `status`),
  CONSTRAINT `content_agent_runs_workspace_fk`
    FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `content_agent_tool_runs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `runId` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `stepIndex` int NOT NULL DEFAULT 0,
  `tool` varchar(64) NOT NULL,
  `status` enum('running','waiting_for_input','completed','failed','cancelled') NOT NULL DEFAULT 'running',
  `argsJson` json,
  `resultJson` json,
  `errorMessage` text,
  `startedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_content_agent_tool_run_step` (`runId`, `stepIndex`),
  KEY `idx_content_agent_tool_runs_workspace` (`workspaceId`, `createdAt`),
  CONSTRAINT `content_agent_tool_runs_run_fk`
    FOREIGN KEY (`runId`) REFERENCES `content_agent_runs` (`id`) ON DELETE CASCADE,
  CONSTRAINT `content_agent_tool_runs_workspace_fk`
    FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE
);
