CREATE TABLE `blog_posts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`authorId` int NOT NULL,
	`title` varchar(512) NOT NULL,
	`slug` varchar(512) NOT NULL,
	`excerpt` text,
	`content` text NOT NULL,
	`coverImageUrl` text,
	`tags` json DEFAULT ('[]'),
	`metaTitle` varchar(512),
	`metaDescription` text,
	`status` enum('draft','published') NOT NULL DEFAULT 'draft',
	`publishedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `blog_posts_id` PRIMARY KEY(`id`),
	CONSTRAINT `blog_posts_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `monthly_usage` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`usageMonth` varchar(7) NOT NULL,
	`scrapeCount` int NOT NULL DEFAULT 0,
	`searchCount` int NOT NULL DEFAULT 0,
	`transcribeCount` int NOT NULL DEFAULT 0,
	`recreateCount` int NOT NULL DEFAULT 0,
	`rewriteCount` int NOT NULL DEFAULT 0,
	`exportCount` int NOT NULL DEFAULT 0,
	`extensionSortCount` int NOT NULL DEFAULT 0,
	`extensionSaveCount` int NOT NULL DEFAULT 0,
	`extensionTranscribeCount` int NOT NULL DEFAULT 0,
	`extensionRecreateCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monthly_usage_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `subscriptions` MODIFY COLUMN `plan` enum('free','starter','pro','business','agency') NOT NULL DEFAULT 'free';--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `billingInterval` enum('monthly','yearly') DEFAULT 'monthly';--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `cancelAtPeriodEnd` int DEFAULT 0;