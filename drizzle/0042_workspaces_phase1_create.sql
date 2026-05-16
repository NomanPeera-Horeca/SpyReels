-- Phase 1, Step 2: Create workspaces, workspace_members, workspace_invitations.
-- Additive only. No existing data touched.
-- Workspace primary keys use VARCHAR(36) UUIDs. User FKs use INT to match users.id.
-- Charset/collation matches staging users table: utf8mb4 / utf8mb4_0900_ai_ci.

CREATE TABLE `workspaces` (
  `id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `logoUrl` varchar(500) DEFAULT NULL,
  `ownerUserId` int NOT NULL,
  `plan` varchar(20) NOT NULL DEFAULT 'free',
  `stripeSubscriptionId` varchar(100) DEFAULT NULL,
  `includedSeats` int NOT NULL DEFAULT 1,
  `isPersonal` tinyint(1) NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deletedAt` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_workspaces_owner` (`ownerUserId`),
  KEY `idx_workspaces_stripe_sub` (`stripeSubscriptionId`),
  CONSTRAINT `fk_workspaces_owner` FOREIGN KEY (`ownerUserId`) REFERENCES `users` (`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `workspace_members` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `userId` int NOT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'member',
  `invitedByUserId` int DEFAULT NULL,
  `joinedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_workspace_user` (`workspaceId`, `userId`),
  KEY `idx_members_workspace` (`workspaceId`),
  KEY `idx_members_user` (`userId`),
  CONSTRAINT `fk_members_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_members_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_members_invited_by` FOREIGN KEY (`invitedByUserId`) REFERENCES `users` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE `workspace_invitations` (
  `id` varchar(36) NOT NULL,
  `workspaceId` varchar(36) NOT NULL,
  `invitedEmail` varchar(255) NOT NULL,
  `role` varchar(20) NOT NULL DEFAULT 'member',
  `token` varchar(64) NOT NULL,
  `invitedByUserId` int NOT NULL,
  `acceptedAt` timestamp NULL DEFAULT NULL,
  `expiresAt` timestamp NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_invitation_token` (`token`),
  KEY `idx_invitations_workspace` (`workspaceId`),
  KEY `idx_invitations_email` (`invitedEmail`),
  CONSTRAINT `fk_invitations_workspace` FOREIGN KEY (`workspaceId`) REFERENCES `workspaces` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_invitations_inviter` FOREIGN KEY (`invitedByUserId`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
