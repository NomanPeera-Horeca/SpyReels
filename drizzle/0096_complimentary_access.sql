-- Complimentary access is a separate entitlement layer from Stripe billing.
-- It lets admins grant a normal user a paid-plan experience without creating
-- a fake Stripe subscription. Grant history is retained for auditability.

CREATE TABLE IF NOT EXISTS `complimentary_access_grants` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `plan` enum('starter','pro','business','agency') NOT NULL,
  `status` enum('active','revoked') NOT NULL DEFAULT 'active',
  `reason` varchar(500) NOT NULL,
  `grantedByUserId` int NOT NULL,
  `startsAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expiresAt` timestamp NULL DEFAULT NULL,
  `revokedAt` timestamp NULL DEFAULT NULL,
  `revokedByUserId` int NULL DEFAULT NULL,
  `revokeReason` varchar(500) NULL DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `complimentary_access_grants_id` PRIMARY KEY (`id`)
);

CREATE INDEX `idx_comp_access_user_status`
  ON `complimentary_access_grants` (`userId`, `status`);
CREATE INDEX `idx_comp_access_expires_at`
  ON `complimentary_access_grants` (`expiresAt`);
CREATE INDEX `idx_comp_access_created_at`
  ON `complimentary_access_grants` (`createdAt`);
