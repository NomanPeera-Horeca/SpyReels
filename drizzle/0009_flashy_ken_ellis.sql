CREATE TABLE `extension_tokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`token` varchar(256) NOT NULL,
	`lastUsedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `extension_tokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `extension_tokens_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `extension_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`usageDate` varchar(10) NOT NULL,
	`transcribeCount` int NOT NULL DEFAULT 0,
	`remakeCount` int NOT NULL DEFAULT 0,
	`saveCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `extension_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`plan` enum('free','pro') NOT NULL DEFAULT 'free',
	`stripeCustomerId` varchar(256),
	`stripeSubscriptionId` varchar(256),
	`status` enum('active','canceled','past_due','trialing') NOT NULL DEFAULT 'active',
	`currentPeriodEnd` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `subscriptions_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscriptions_userId_unique` UNIQUE(`userId`)
);
