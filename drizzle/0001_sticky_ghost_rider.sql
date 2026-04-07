CREATE TABLE `reels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`jobId` int NOT NULL,
	`shortcode` varchar(64) NOT NULL,
	`caption` text,
	`viewCount` bigint NOT NULL DEFAULT 0,
	`likeCount` int NOT NULL DEFAULT 0,
	`commentCount` int NOT NULL DEFAULT 0,
	`thumbnailUrl` text,
	`videoUrl` text,
	`reelUrl` varchar(512) NOT NULL,
	`duration` int,
	`postedAt` timestamp NOT NULL,
	`ownerUsername` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reels_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scrape_jobs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`handle` varchar(128) NOT NULL,
	`timeframeDays` int NOT NULL,
	`status` enum('pending','running','completed','failed') NOT NULL DEFAULT 'pending',
	`totalReels` int NOT NULL DEFAULT 0,
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scrape_jobs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `transcriptions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`reelId` int NOT NULL,
	`transcript` text,
	`hookAnalysis` text,
	`status` enum('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
	`errorMessage` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `transcriptions_id` PRIMARY KEY(`id`)
);
