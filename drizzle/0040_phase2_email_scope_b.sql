-- Phase 2 Scope B: transactional email observability + admin Users tab support.

ALTER TABLE `users`
  ADD COLUMN `isTestAccount` boolean NOT NULL DEFAULT false;

CREATE TABLE `email_templates` (
  `id` int NOT NULL AUTO_INCREMENT,
  `slug` varchar(64) NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email_templates_slug_unique` (`slug`)
);

CREATE TABLE `email_events` (
  `id` int NOT NULL AUTO_INCREMENT,
  `resendEmailId` varchar(128) DEFAULT NULL,
  `eventType` varchar(128) NOT NULL,
  `recipient` varchar(320) DEFAULT NULL,
  `templateSlug` varchar(64) DEFAULT NULL,
  `payload` json NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `email_events_resend_idx` (`resendEmailId`),
  KEY `email_events_type_idx` (`eventType`),
  KEY `email_events_template_idx` (`templateSlug`),
  KEY `email_events_created_idx` (`createdAt`)
);
