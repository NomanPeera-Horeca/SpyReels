CREATE TABLE IF NOT EXISTS `ai_oauth_clients` (
  `id` int NOT NULL AUTO_INCREMENT,
  `clientId` varchar(128) NOT NULL,
  `clientSecretHash` varchar(64) DEFAULT NULL,
  `clientName` varchar(255) NOT NULL,
  `source` varchar(32) NOT NULL DEFAULT 'unknown',
  `redirectUris` json NOT NULL,
  `allowedScopes` json DEFAULT NULL,
  `isPublic` boolean NOT NULL DEFAULT true,
  `isActive` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_oauth_clients_client_id` (`clientId`),
  KEY `idx_ai_oauth_clients_source` (`source`)
);

CREATE TABLE IF NOT EXISTS `ai_oauth_authorization_codes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `codeHash` varchar(64) NOT NULL,
  `clientId` varchar(128) NOT NULL,
  `userId` int NOT NULL,
  `redirectUri` varchar(1024) NOT NULL,
  `scope` varchar(1000) NOT NULL,
  `codeChallenge` varchar(128) NOT NULL,
  `codeChallengeMethod` varchar(16) NOT NULL DEFAULT 'S256',
  `expiresAt` datetime NOT NULL,
  `consumedAt` datetime DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_oauth_authorization_codes_hash` (`codeHash`),
  KEY `idx_ai_oauth_authorization_codes_client_user` (`clientId`, `userId`),
  KEY `idx_ai_oauth_authorization_codes_expires` (`expiresAt`),
  CONSTRAINT `fk_ai_oauth_authorization_codes_client` FOREIGN KEY (`clientId`) REFERENCES `ai_oauth_clients` (`clientId`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_oauth_authorization_codes_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS `ai_oauth_refresh_tokens` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `tokenHash` varchar(64) NOT NULL,
  `familyId` varchar(64) NOT NULL,
  `clientId` varchar(128) NOT NULL,
  `userId` int NOT NULL,
  `source` varchar(32) NOT NULL DEFAULT 'unknown',
  `scope` varchar(1000) NOT NULL,
  `expiresAt` datetime NOT NULL,
  `revokedAt` datetime DEFAULT NULL,
  `replacedByHash` varchar(64) DEFAULT NULL,
  `lastUsedAt` datetime DEFAULT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_ai_oauth_refresh_tokens_hash` (`tokenHash`),
  KEY `idx_ai_oauth_refresh_tokens_family` (`familyId`),
  KEY `idx_ai_oauth_refresh_tokens_client_user` (`clientId`, `userId`),
  KEY `idx_ai_oauth_refresh_tokens_expires` (`expiresAt`),
  CONSTRAINT `fk_ai_oauth_refresh_tokens_client` FOREIGN KEY (`clientId`) REFERENCES `ai_oauth_clients` (`clientId`) ON DELETE CASCADE,
  CONSTRAINT `fk_ai_oauth_refresh_tokens_user` FOREIGN KEY (`userId`) REFERENCES `users` (`id`) ON DELETE CASCADE
);
