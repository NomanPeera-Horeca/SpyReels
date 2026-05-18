-- V1.6 Path A: Public share links for saved scripts
CREATE TABLE `script_share_links` (
  `id` INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `token` VARCHAR(32) NOT NULL,
  `scriptId` INT NOT NULL,
  `workspaceId` VARCHAR(36) NOT NULL,
  `createdByUserId` INT NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `revokedAt` TIMESTAMP NULL,
  `viewCount` INT NOT NULL DEFAULT 0,
  `lastViewedAt` TIMESTAMP NULL,
  UNIQUE KEY `uniq_script_share_token` (`token`),
  KEY `idx_script_share_token` (`token`),
  KEY `idx_script_share_script` (`scriptId`),
  CONSTRAINT `fk_script_share_script` FOREIGN KEY (`scriptId`) REFERENCES `saved_scripts` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_script_share_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_script_share_user` FOREIGN KEY (`createdByUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
